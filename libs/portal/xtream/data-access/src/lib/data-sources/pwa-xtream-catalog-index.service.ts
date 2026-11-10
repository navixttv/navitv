import { Injectable, Injector, inject, signal } from '@angular/core';
import type { CatalogTitleMatchFallback } from '@iptvnator/services';
import {
    isCategoryOutsideCountries,
    normalizeTitleKeys,
    type CatalogTitleMatch,
} from '@iptvnator/shared/interfaces';
import { PwaXtreamDataSource } from './pwa-xtream-data-source';
import type { XtreamCredentials } from '../services/xtream-api.service';

/** The playlist fields the index needs to read a catalog. */
export interface CatalogIndexPlaylist {
    readonly _id: string;
    readonly title?: string;
    readonly serverUrl?: string;
    readonly username?: string;
    readonly password?: string;
    readonly userAgent?: string;
}

/** One film or series of a loaded catalog. */
export interface CatalogIndexEntry {
    readonly playlistId: string;
    readonly playlistName: string;
    readonly type: 'movie' | 'series';
    readonly xtreamId: number;
    readonly categoryId: number;
    readonly title: string;
    readonly posterUrl: string | null;
    /** Provider "added" time in ms; 0 when the provider states none. */
    readonly addedMs: number;
    readonly trailingYear: number | null;
}

interface RawCatalogRow {
    readonly name?: string;
    readonly title?: string;
    readonly stream_id?: number | string;
    readonly series_id?: number | string;
    readonly xtream_id?: number | string;
    readonly category_id?: number | string;
    readonly stream_icon?: string;
    readonly cover?: string;
    readonly poster_url?: string;
    readonly added?: string | number;
    readonly last_modified?: string | number;
}

function toMs(value: string | number | undefined): number {
    const seconds = Number(value);
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
}

/** Index entries for one catalog (pure: tested on its own). */
export function buildCatalogIndexEntries(
    playlist: { readonly id: string; readonly name: string },
    type: 'movie' | 'series',
    rows: readonly RawCatalogRow[]
): CatalogIndexEntry[] {
    const entries: CatalogIndexEntry[] = [];
    for (const row of rows) {
        const title = (row.title ?? row.name ?? '').trim();
        const xtreamId = Number(
            type === 'series'
                ? (row.series_id ?? row.xtream_id)
                : (row.stream_id ?? row.xtream_id)
        );
        const categoryId = Number(row.category_id);
        if (
            !title ||
            !Number.isFinite(xtreamId) ||
            !Number.isFinite(categoryId)
        ) {
            continue;
        }
        entries.push({
            playlistId: playlist.id,
            playlistName: playlist.name,
            type,
            xtreamId,
            categoryId,
            title,
            posterUrl: row.poster_url || row.stream_icon || row.cover || null,
            addedMs: toMs(row.added || row.last_modified),
            trailingYear: normalizeTitleKeys(title).trailingYear,
        });
    }
    return entries;
}

/**
 * Matches titles against index entries the way the desktop worker does: an
 * exact normalized title first, then the title without its trailing year
 * (reported in `trailingYear` so callers can reject "Blade Runner 2049" for
 * "Blade Runner").
 */
export function matchCatalogTitles(
    entries: readonly CatalogIndexEntry[],
    titles: readonly string[]
): CatalogTitleMatch[] {
    const exact = new Map<string, CatalogIndexEntry[]>();
    const base = new Map<string, CatalogIndexEntry[]>();
    for (const entry of entries) {
        const keys = normalizeTitleKeys(entry.title);
        if (keys.exact) {
            const list = exact.get(keys.exact) ?? [];
            list.push(entry);
            exact.set(keys.exact, list);
        }
        if (keys.base) {
            const list = base.get(keys.base) ?? [];
            list.push(entry);
            base.set(keys.base, list);
        }
    }
    const matches: CatalogTitleMatch[] = [];
    for (const queryTitle of new Set(titles)) {
        const keys = normalizeTitleKeys(queryTitle);
        const exactHits = keys.exact ? exact.get(keys.exact) : undefined;
        const hits = exactHits ?? (keys.base ? base.get(keys.base) : undefined);
        if (!hits) continue;
        for (const entry of hits) {
            matches.push({
                queryTitle,
                playlistId: entry.playlistId,
                playlistName: entry.playlistName,
                categoryId: entry.categoryId,
                xtreamId: entry.xtreamId,
                type: entry.type,
                trailingYear: exactHits ? null : entry.trailingYear,
            });
        }
    }
    return matches;
}

/**
 * NaviTV TV / browser build: films and series of every Xtream source, read
 * once per session in the background (the kept English / Spanish categories
 * only), so Home can offer "Recently added", "Trending" and "Because you
 * watched" without the desktop app's SQLite catalog. The same reads fill the
 * session cache, so Movies and Series open instantly afterwards.
 */
@Injectable({ providedIn: 'root' })
export class PwaXtreamCatalogIndexService implements CatalogTitleMatchFallback {
    // Resolved on first load: building Home must not pull in the PWA data
    // source (and its API stack) where the index is never warmed.
    private readonly injector = inject(Injector);

    private entries: CatalogIndexEntry[] = [];
    private warming: Promise<void> | null = null;
    private warmedKey: string | null = null;
    private readonly revisionState = signal(0);
    /** Bumps whenever the index changes; Home re-reads on it. */
    readonly revision = this.revisionState.asReadonly();

    /** Reads every Xtream catalog not indexed yet; resolves when done. */
    warm(playlists: readonly CatalogIndexPlaylist[]): Promise<void> {
        const xtream = playlists.filter(
            (playlist) =>
                !!playlist.serverUrl &&
                !!playlist.username &&
                !!playlist.password
        );
        const key = xtream.map((playlist) => playlist._id).join('|');
        if (this.warming && key === this.warmedKey) return this.warming;
        this.warmedKey = key;
        const run = this.load(xtream);
        this.warming = run;
        return run;
    }

    /** Waits for a warm in progress; the index as it stands otherwise. */
    async ready(): Promise<void> {
        if (this.warming) {
            await this.warming.catch(() => undefined);
        }
    }

    async matchTitles(titles: readonly string[]): Promise<CatalogTitleMatch[]> {
        await this.ready();
        return matchCatalogTitles(this.entries, titles);
    }

    /** Newest films and series first, foreign-tagged titles left out. */
    recentlyAdded(limit: number): CatalogIndexEntry[] {
        return this.entries
            .filter(
                (entry) =>
                    entry.addedMs > 0 &&
                    !isCategoryOutsideCountries(entry.title)
            )
            .sort((a, b) => b.addedMs - a.addedMs)
            .slice(0, limit);
    }

    private async load(
        playlists: readonly CatalogIndexPlaylist[]
    ): Promise<void> {
        const entries: CatalogIndexEntry[] = [];
        let dataSource: PwaXtreamDataSource;
        try {
            dataSource = this.injector.get(PwaXtreamDataSource);
        } catch (error) {
            console.warn('[CatalogIndex] No PWA data source', error);
            return;
        }
        for (const playlist of playlists) {
            const credentials: XtreamCredentials = {
                serverUrl: playlist.serverUrl as string,
                username: playlist.username as string,
                password: playlist.password as string,
                ...(playlist.userAgent
                    ? { userAgent: playlist.userAgent }
                    : {}),
            };
            const name = playlist.title || playlist.serverUrl || 'Xtream';
            for (const type of ['movie', 'series'] as const) {
                try {
                    const rows = (await dataSource.getContent(
                        playlist._id,
                        credentials,
                        type
                    )) as readonly RawCatalogRow[];
                    entries.push(
                        ...buildCatalogIndexEntries(
                            { id: playlist._id, name },
                            type,
                            Array.isArray(rows) ? rows : []
                        )
                    );
                    // Publish as each catalog lands: films show before series load.
                    this.entries = entries.slice();
                    this.revisionState.update((value) => value + 1);
                } catch (error) {
                    console.warn(
                        '[CatalogIndex] Could not read a catalog',
                        error
                    );
                }
            }
        }
        this.entries = entries;
        this.revisionState.update((value) => value + 1);
    }
}

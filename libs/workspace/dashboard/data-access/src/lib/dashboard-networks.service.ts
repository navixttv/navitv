import { Injectable, inject, signal } from '@angular/core';
import {
    RuntimeCapabilitiesService,
    TmdbApiService,
    TmdbRuntimeService,
    tmdbLogoUrl,
} from '@iptvnator/services';
import {
    XTREAM_DATA_SOURCE,
    type XtreamCredentials,
} from '@iptvnator/portal/xtream/data-access';
import {
    groupNetworks,
    matchNetworkLogos,
    type DashboardNetwork,
    type NetworkCategory,
} from './dashboard-networks.util';
import type { LiveChannelsPlaylist } from './dashboard-live-channels.loader';

const LOGO_CACHE_KEY = 'navitv.dashboard.networkLogos';
const LOGO_CACHE_TTL_MS = 7 * 24 * 3_600_000;
/** Titles per category row on a network page. */
export const NETWORK_ROW_LIMIT = 40;

export interface NetworkRowItem {
    readonly xtreamId: number;
    readonly title: string;
    readonly posterUrl: string | null;
}

export interface NetworkRow {
    readonly category: NetworkCategory;
    readonly items: readonly NetworkRowItem[];
    readonly total: number;
}

interface CategoryRow {
    readonly id?: number;
    readonly name?: string;
    readonly xtream_id?: number;
    readonly category_id?: string | number;
    readonly category_name?: string;
}

interface ContentRow {
    readonly category_id?: string | number;
    readonly xtream_id?: number | string;
    readonly title?: string;
    readonly name?: string;
    readonly poster_url?: string;
    readonly added?: string | number;
}

/**
 * NaviTV "Networks": which streaming services the viewer's catalog covers
 * (from film / series category names), their TMDB logos, and a network
 * page's rows. Uses the Xtream data source, so it reads SQLite on desktop and
 * the provider (session-cached) on the TV / browser build.
 */
@Injectable({ providedIn: 'root' })
export class DashboardNetworksService {
    private readonly dataSource = inject(XTREAM_DATA_SOURCE);
    private readonly runtime = inject(RuntimeCapabilitiesService);
    private readonly tmdbRuntime = inject(TmdbRuntimeService);
    private readonly tmdbApi = inject(TmdbApiService);

    private readonly networksState = signal<DashboardNetwork[]>([]);
    readonly networks = this.networksState.asReadonly();
    private loadedKey: string | null = null;
    private playlists: readonly LiveChannelsPlaylist[] = [];

    async load(playlists: readonly LiveChannelsPlaylist[]): Promise<void> {
        const xtream = playlists.filter(
            (p) => !!p.serverUrl && !!p.username && !!p.password
        );
        this.playlists = xtream;
        const key = xtream.map((p) => p._id).join('|');
        if (key === this.loadedKey) return;
        this.loadedKey = key;
        const categories: NetworkCategory[] = [];
        for (const playlist of xtream) {
            for (const type of ['movie', 'series'] as const) {
                try {
                    categories.push(
                        ...(await this.categoriesOf(playlist, type))
                    );
                } catch (error) {
                    console.warn(
                        '[DashboardNetworks] Categories failed',
                        error
                    );
                }
            }
        }
        this.networksState.set(groupNetworks(categories));
        const logos = await this.logos();
        if (logos.size > 0 && this.loadedKey === key) {
            this.networksState.set(groupNetworks(categories, logos));
        }
    }

    invalidate(): void {
        this.loadedKey = null;
    }

    network(id: string): DashboardNetwork | null {
        return (
            this.networksState().find((network) => network.id === id) ?? null
        );
    }

    /** One row per category of the network, newest titles first. */
    async rows(network: DashboardNetwork): Promise<NetworkRow[]> {
        const rows: NetworkRow[] = [];
        const byCatalog = new Map<string, NetworkCategory[]>();
        for (const category of network.categories) {
            const key = `${category.playlistId}|${category.type}`;
            byCatalog.set(key, [...(byCatalog.get(key) ?? []), category]);
        }
        for (const categories of byCatalog.values()) {
            const { playlistId, type } = categories[0];
            const playlist = this.playlists.find((p) => p._id === playlistId);
            if (!playlist) continue;
            const content = (await this.dataSource.getContent(
                playlistId,
                this.credentials(playlist),
                type
            )) as readonly ContentRow[];
            for (const category of categories) {
                const matching = content
                    .filter(
                        (row) => String(row.category_id) === category.matchId
                    )
                    .sort(
                        (a, b) => Number(b.added ?? 0) - Number(a.added ?? 0)
                    );
                if (matching.length === 0) continue;
                rows.push({
                    category,
                    total: matching.length,
                    items: matching.slice(0, NETWORK_ROW_LIMIT).map((row) => ({
                        xtreamId: Number(row.xtream_id),
                        title: row.title || row.name || '',
                        posterUrl: row.poster_url || null,
                    })),
                });
            }
        }
        return rows;
    }

    private async categoriesOf(
        playlist: LiveChannelsPlaylist,
        type: 'movie' | 'series'
    ): Promise<NetworkCategory[]> {
        const rows = (await this.dataSource.getCategories(
            playlist._id,
            this.credentials(playlist),
            type === 'movie' ? 'vod' : 'series'
        )) as readonly CategoryRow[];
        const desktop = this.runtime.supportsXtreamSqliteDataSource;
        const out: NetworkCategory[] = [];
        for (const row of rows) {
            const name = row.name ?? row.category_name ?? '';
            const xtreamId = Number(desktop ? row.xtream_id : row.category_id);
            const matchId = String(desktop ? row.id : row.category_id);
            if (!name || !Number.isFinite(xtreamId)) continue;
            out.push({
                playlistId: playlist._id,
                playlistName: playlist.title ?? '',
                type,
                name,
                matchId,
                xtreamId,
            });
        }
        return out;
    }

    private credentials(playlist: LiveChannelsPlaylist): XtreamCredentials {
        return {
            serverUrl: playlist.serverUrl as string,
            username: playlist.username as string,
            password: playlist.password as string,
            ...(playlist.userAgent ? { userAgent: playlist.userAgent } : {}),
        };
    }

    /** Network logos from TMDB's US provider list, cached for a week. */
    private async logos(): Promise<Map<string, string>> {
        try {
            const cached = JSON.parse(
                localStorage.getItem(LOGO_CACHE_KEY) ?? 'null'
            );
            if (cached && Date.now() - cached.at < LOGO_CACHE_TTL_MS) {
                return new Map(
                    Object.entries(cached.logos as Record<string, string>)
                );
            }
        } catch {
            // No cache: ask TMDB.
        }
        if (!this.tmdbRuntime.isEnabled()) return new Map();
        try {
            const key = this.tmdbRuntime.apiKey();
            const language = this.tmdbRuntime.language();
            const [tv, movie] = await Promise.all([
                this.tmdbApi.getWatchProviders('tv', 'US', language, key),
                this.tmdbApi.getWatchProviders('movie', 'US', language, key),
            ]);
            const logos = matchNetworkLogos(
                [...(tv.results ?? []), ...(movie.results ?? [])],
                tmdbLogoUrl
            );
            try {
                localStorage.setItem(
                    LOGO_CACHE_KEY,
                    JSON.stringify({
                        at: Date.now(),
                        logos: mapToRecord(logos),
                    })
                );
            } catch {
                // Storage unavailable: ask again next session.
            }
            return logos;
        } catch (error) {
            console.warn('[DashboardNetworks] Logos unavailable', error);
            return new Map();
        }
    }
}

/** `Object.fromEntries` for the es2018 web build. */
function mapToRecord(map: ReadonlyMap<string, string>): Record<string, string> {
    const record: Record<string, string> = {};
    map.forEach((value, key) => {
        record[key] = value;
    });
    return record;
}

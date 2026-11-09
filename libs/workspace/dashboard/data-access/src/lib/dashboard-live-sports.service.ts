import { inject, Injectable, signal } from '@angular/core';
import {
    DatabaseService,
    RuntimeCapabilitiesService,
} from '@iptvnator/services';
import type { PortalActivityItem } from '@iptvnator/shared/interfaces';
import {
    buildLiveSportsItems,
    isSportsCategoryName,
} from './dashboard-live-sports.util';

/** The playlist fields the sports rail needs from the playlist inventory. */
export interface LiveSportsPlaylist {
    readonly _id: string;
    readonly title?: string;
    readonly serverUrl?: string;
}

/**
 * Loads the NaviTV "Live sports" rail candidates: live channels in the
 * visible sports categories of every Xtream playlist. Reads the local SQLite
 * catalog only (Electron), so it never contacts a provider; the PWA has no
 * local catalog and the rail stays empty there.
 */
@Injectable({ providedIn: 'root' })
export class DashboardLiveSportsService {
    private readonly db = inject(DatabaseService);
    private readonly runtime = inject(RuntimeCapabilitiesService);

    private readonly itemsState = signal<PortalActivityItem[]>([]);
    /** Candidates in provider order; the rail ranks them by guide data. */
    readonly items = this.itemsState.asReadonly();

    private loadedKey: string | null = null;
    private generation = 0;

    /** Reloads only when the set of Xtream playlists changes. */
    async load(playlists: readonly LiveSportsPlaylist[]): Promise<void> {
        const xtream = playlists.filter((playlist) => !!playlist.serverUrl);
        const key = xtream.map((playlist) => playlist._id).join('|');
        if (key === this.loadedKey) return;
        this.loadedKey = key;
        const generation = ++this.generation;

        if (!this.runtime.supportsXtreamSqliteDataSource || !xtream.length) {
            this.itemsState.set([]);
            return;
        }

        const items: PortalActivityItem[] = [];
        for (const playlist of xtream) {
            try {
                const categories = await this.db.getXtreamCategories(
                    playlist._id,
                    'live'
                );
                // Read the (large) live list only when a visible sports
                // category exists.
                const hasSports = categories.some(
                    (category) =>
                        !category.hidden &&
                        !category.locked &&
                        isSportsCategoryName(category.name)
                );
                const sportsItems = hasSports
                    ? buildLiveSportsItems(
                          { id: playlist._id, name: playlist.title },
                          categories,
                          await this.db.getXtreamContent(playlist._id, 'live')
                      )
                    : [];
                items.push(...sportsItems);
            } catch (error) {
                console.warn('[DashboardLiveSports] Failed to load', error);
            }
            // A newer load (playlists changed meanwhile) owns the result.
            if (generation !== this.generation) return;
        }
        this.itemsState.set(items);
    }

    /** Forget the loaded key so the next `load` reads the catalog again. */
    invalidate(): void {
        this.loadedKey = null;
    }
}

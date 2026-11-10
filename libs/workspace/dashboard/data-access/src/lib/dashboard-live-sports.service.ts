import { inject, Injectable, signal } from '@angular/core';
import type { PortalActivityItem } from '@iptvnator/shared/interfaces';
import {
    DashboardLiveChannelsLoader,
    type LiveChannelsPlaylist,
} from './dashboard-live-channels.loader';
import { isSportsCategoryName } from './dashboard-live-sports.util';

/** The playlist fields the sports rail needs from the playlist inventory. */
export type LiveSportsPlaylist = LiveChannelsPlaylist;

/**
 * Loads the NaviTV "Live sports" rail candidates: live channels in the
 * visible sports categories of every Xtream playlist (see
 * {@link DashboardLiveChannelsLoader} for where they are read from).
 */
@Injectable({ providedIn: 'root' })
export class DashboardLiveSportsService {
    private readonly loader = inject(DashboardLiveChannelsLoader);

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

        if (!xtream.length) {
            this.itemsState.set([]);
            return;
        }

        const items: PortalActivityItem[] = [];
        for (const playlist of xtream) {
            try {
                const channels = await this.loader.load(
                    playlist,
                    isSportsCategoryName
                );
                items.push(...channels.map((channel) => channel.item));
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

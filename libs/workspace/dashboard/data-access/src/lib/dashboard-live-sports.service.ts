import { inject, Injectable, signal } from '@angular/core';
import {
    DatabaseService,
    RuntimeCapabilitiesService,
} from '@iptvnator/services';
import { XtreamApiService } from '@iptvnator/portal/xtream/data-access';
import {
    isCategoryOutsideCountries,
    type PortalActivityItem,
} from '@iptvnator/shared/interfaces';
import {
    buildLiveSportsItems,
    isSportsCategoryName,
    LIVE_SPORTS_PER_PLAYLIST_LIMIT,
    type LiveSportsCategoryRow,
    type LiveSportsContentRow,
} from './dashboard-live-sports.util';

/** The playlist fields the sports rail needs from the playlist inventory. */
export interface LiveSportsPlaylist {
    readonly _id: string;
    readonly title?: string;
    readonly serverUrl?: string;
    readonly username?: string;
    readonly password?: string;
    readonly userAgent?: string;
}

/** Sports categories read from the provider per load (TV / browser build). */
const PROVIDER_SPORTS_CATEGORY_LIMIT = 6;

/**
 * Loads the NaviTV "Live sports" rail candidates: live channels in the
 * visible sports categories of every Xtream playlist. The desktop app reads
 * its local SQLite catalog; the TV / browser build has no local catalog and
 * asks the provider for its English / Spanish sports categories instead.
 */
@Injectable({ providedIn: 'root' })
export class DashboardLiveSportsService {
    private readonly db = inject(DatabaseService);
    private readonly runtime = inject(RuntimeCapabilitiesService);
    private readonly api = inject(XtreamApiService);

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
            if (!this.runtime.supportsXtreamSqliteDataSource) {
                try {
                    items.push(...(await this.loadFromProvider(playlist)));
                } catch (error) {
                    console.warn('[DashboardLiveSports] Failed to load', error);
                }
                if (generation !== this.generation) return;
                continue;
            }
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

    /**
     * TV / browser build: the provider's sports categories (country filter
     * applied, provider order), read one category at a time until the
     * per-playlist limit is reached.
     */
    private async loadFromProvider(
        playlist: LiveSportsPlaylist
    ): Promise<PortalActivityItem[]> {
        if (!playlist.serverUrl || !playlist.username || !playlist.password) {
            return [];
        }
        const credentials = {
            serverUrl: playlist.serverUrl,
            username: playlist.username,
            password: playlist.password,
            ...(playlist.userAgent ? { userAgent: playlist.userAgent } : {}),
        };
        const sports = (await this.api.getCategories(credentials, 'live'))
            .filter(
                (category) =>
                    isSportsCategoryName(category.category_name) &&
                    !isCategoryOutsideCountries(category.category_name)
            )
            .slice(0, PROVIDER_SPORTS_CATEGORY_LIMIT);
        const categories: LiveSportsCategoryRow[] = [];
        const content: LiveSportsContentRow[] = [];
        for (const category of sports) {
            if (content.length >= LIVE_SPORTS_PER_PLAYLIST_LIMIT) break;
            const id = Number(category.category_id);
            if (!Number.isFinite(id)) continue;
            categories.push({
                id,
                name: category.category_name,
                xtream_id: id,
            });
            const streams = await this.api.getLiveStreams(credentials, {
                categoryId: category.category_id,
            });
            for (const stream of Array.isArray(streams) ? streams : []) {
                const streamId = Number(stream.stream_id);
                if (!Number.isFinite(streamId)) continue;
                content.push({
                    id: streamId,
                    category_id: id,
                    title: stream.name,
                    xtream_id: streamId,
                    poster_url: stream.stream_icon || null,
                });
            }
        }
        return buildLiveSportsItems(
            { id: playlist._id, name: playlist.title },
            categories,
            content
        );
    }

    /** Forget the loaded key so the next `load` reads the catalog again. */
    invalidate(): void {
        this.loadedKey = null;
    }
}

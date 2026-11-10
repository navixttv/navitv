import { inject, Injectable } from '@angular/core';
import {
    DatabaseService,
    RuntimeCapabilitiesService,
} from '@iptvnator/services';
import { XtreamApiService } from '@iptvnator/portal/xtream/data-access';
import { isCategoryOutsideCountries } from '@iptvnator/shared/interfaces';
import {
    buildLiveCategoryChannels,
    LIVE_SPORTS_PER_PLAYLIST_LIMIT,
    type LiveCategoryChannel,
    type LiveSportsCategoryRow,
    type LiveSportsContentRow,
} from './dashboard-live-sports.util';

/** The playlist fields a live channel row needs from the playlist inventory. */
export interface LiveChannelsPlaylist {
    readonly _id: string;
    readonly title?: string;
    readonly serverUrl?: string;
    readonly username?: string;
    readonly password?: string;
    readonly userAgent?: string;
}

/** Categories read from the provider per load (TV / browser build). */
export const PROVIDER_LIVE_CATEGORY_LIMIT = 6;

/**
 * Live channels of one Xtream playlist from the categories a Home row wants
 * ("Live sports", "Live TV for you"). The desktop app reads its local SQLite
 * catalog, where hidden and locked categories are already marked; the TV /
 * browser build has no local catalog and asks the provider for the matching
 * English / Spanish categories, one category at a time.
 */
@Injectable({ providedIn: 'root' })
export class DashboardLiveChannelsLoader {
    private readonly db = inject(DatabaseService);
    private readonly runtime = inject(RuntimeCapabilitiesService);
    private readonly api = inject(XtreamApiService);

    async load(
        playlist: LiveChannelsPlaylist,
        isWanted: (categoryName: string) => boolean,
        limit = LIVE_SPORTS_PER_PLAYLIST_LIMIT,
        providerCategoryLimit = PROVIDER_LIVE_CATEGORY_LIMIT
    ): Promise<LiveCategoryChannel[]> {
        if (!playlist.serverUrl) return [];
        if (!this.runtime.supportsXtreamSqliteDataSource) {
            return this.loadFromProvider(
                playlist,
                isWanted,
                limit,
                providerCategoryLimit
            );
        }
        const categories = await this.db.getXtreamCategories(
            playlist._id,
            'live'
        );
        // Read the (large) live list only when a wanted category is visible.
        const hasWanted = categories.some(
            (category) =>
                !category.hidden && !category.locked && isWanted(category.name)
        );
        if (!hasWanted) return [];
        return buildLiveCategoryChannels(
            { id: playlist._id, name: playlist.title },
            categories,
            await this.db.getXtreamContent(playlist._id, 'live'),
            isWanted,
            limit
        );
    }

    private async loadFromProvider(
        playlist: LiveChannelsPlaylist,
        isWanted: (categoryName: string) => boolean,
        limit: number,
        providerCategoryLimit: number
    ): Promise<LiveCategoryChannel[]> {
        if (!playlist.serverUrl || !playlist.username || !playlist.password) {
            return [];
        }
        const credentials = {
            serverUrl: playlist.serverUrl,
            username: playlist.username,
            password: playlist.password,
            ...(playlist.userAgent ? { userAgent: playlist.userAgent } : {}),
        };
        const wanted = (await this.api.getCategories(credentials, 'live'))
            .filter(
                (category) =>
                    isWanted(category.category_name) &&
                    !isCategoryOutsideCountries(category.category_name)
            )
            .slice(0, providerCategoryLimit);
        const categories: LiveSportsCategoryRow[] = [];
        const content: LiveSportsContentRow[] = [];
        for (const category of wanted) {
            if (content.length >= limit) break;
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
        return buildLiveCategoryChannels(
            { id: playlist._id, name: playlist.title },
            categories,
            content,
            isWanted,
            limit
        );
    }
}

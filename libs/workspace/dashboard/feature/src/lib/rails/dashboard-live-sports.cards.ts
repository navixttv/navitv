import { buildXtreamNavigationTarget } from '@iptvnator/portal/shared/util';
import type { PortalActivityItem } from '@iptvnator/shared/interfaces';
import {
    buildDashboardPortalLiveEpgKey,
    rankLiveSportsCards,
} from '@iptvnator/workspace/dashboard/data-access';
import type { DashboardRailCard } from './dashboard-rail.component';

/** Cards the "Live sports" rail shows at most, after ranking. */
export const LIVE_SPORTS_RAIL_LIMIT = 20;

/**
 * A live sports channel as a rail card. A click lands on the channel inside
 * its Xtream live category and starts it, like a channel picked by hand.
 */
export function buildLiveSportsCard(
    item: PortalActivityItem
): DashboardRailCard {
    const target = buildXtreamNavigationTarget({
        playlistId: item.playlist_id,
        type: 'live',
        categoryId: item.category_id,
        itemId: item.xtream_id,
        title: item.title,
        imageUrl: item.poster_url,
    });
    return {
        id: `sports-${item.playlist_id}-${item.xtream_id}`,
        title: item.title,
        imageUrl: item.poster_url,
        icon: 'sports',
        contentType: 'live',
        epgPlaylistId: item.playlist_id,
        liveEpgSourceKey: buildDashboardPortalLiveEpgKey(item),
        link: target.link,
        ...(target.state ? { state: target.state } : {}),
    };
}

/** Enriched cards ranked games-first, trimmed to the rail limit. */
export function rankLiveSportsRail(
    enriched: readonly DashboardRailCard[]
): DashboardRailCard[] {
    return rankLiveSportsCards(enriched).slice(0, LIVE_SPORTS_RAIL_LIMIT);
}

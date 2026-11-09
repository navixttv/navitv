import { buildXtreamNavigationTarget } from '@iptvnator/portal/shared/util';
import type { PortalActivityItem } from '@iptvnator/shared/interfaces';
import {
    buildDashboardPortalLiveEpgKey,
    rankLiveSportsCards,
    type UpcomingGame,
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

/** Words the upcoming-game time label is built from (already translated). */
export interface UpcomingGameLabels {
    readonly live: string;
    readonly today: string;
    readonly tomorrow: string;
    readonly locale: string;
}

function startOfDay(ms: number): number {
    const date = new Date(ms);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
}

/**
 * "Live · 7:00 – 9:30 PM", "Today 7:30 PM", "Tomorrow 1:00 PM" or
 * "Sat 4:00 PM", in the viewer's language and the device's time zone.
 */
export function upcomingGameTimeLabel(
    game: Pick<UpcomingGame<unknown>, 'startMs' | 'stopMs' | 'live'>,
    nowMs: number,
    labels: UpcomingGameLabels
): string {
    let time: Intl.DateTimeFormat;
    let weekday: Intl.DateTimeFormat;
    try {
        time = new Intl.DateTimeFormat(labels.locale, {
            hour: 'numeric',
            minute: '2-digit',
        });
        weekday = new Intl.DateTimeFormat(labels.locale, { weekday: 'short' });
    } catch {
        time = new Intl.DateTimeFormat(undefined, {
            hour: 'numeric',
            minute: '2-digit',
        });
        weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
    }
    if (game.live) {
        return `${labels.live} · ${time.format(game.startMs)} – ${time.format(game.stopMs)}`;
    }
    const days = Math.round(
        (startOfDay(game.startMs) - startOfDay(nowMs)) / 86_400_000
    );
    const at = time.format(game.startMs);
    if (days <= 0) return `${labels.today} ${at}`;
    if (days === 1) return `${labels.tomorrow} ${at}`;
    return `${weekday.format(game.startMs)} ${at}`;
}

/**
 * An upcoming game as a channel-layout card: the channel on top, the game
 * and its time below (a progress bar while it is on). A click tunes to the
 * channel.
 */
export function buildUpcomingGameCard(
    game: UpcomingGame<PortalActivityItem>,
    nowMs: number,
    labels: UpcomingGameLabels
): DashboardRailCard {
    const channel = buildLiveSportsCard(game.channel);
    const span = game.stopMs - game.startMs;
    return {
        ...channel,
        id: `game-${game.channel.playlist_id}-${game.key}`,
        // The guide answer is already here: no lazy now-playing lookup.
        liveEpgSourceKey: null,
        nowPlayingState: null,
        nowPlayingTitle: game.title,
        nowPlayingTimeRange: upcomingGameTimeLabel(game, nowMs, labels),
        nowPlayingProgress:
            game.live && span > 0
                ? Math.max(
                      0,
                      Math.min(100, ((nowMs - game.startMs) / span) * 100)
                  )
                : null,
    };
}

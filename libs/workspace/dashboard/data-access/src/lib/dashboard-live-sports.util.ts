import type { PortalActivityItem } from '@iptvnator/shared/interfaces';

/**
 * NaviTV "Live sports" rail: picks live channels from the Xtream categories
 * that look like sports. Hidden categories (the US/UK country filter, or a
 * user's own choice in Manage categories) and parental-locked ones are
 * skipped, so the rail never shows what the catalog hides.
 */

/**
 * Most channels kept per playlist: the pool the "Live sports" rail and the
 * "Upcoming games" guide reads pick their channels from.
 */
export const LIVE_SPORTS_PER_PLAYLIST_LIMIT = 120;

const SPORTS_CATEGORY_PATTERN =
    /\b(?:sports?|espn|nfl|nba|wnba|mlb|nhl|mls|ncaa|ncaaf|ncaab|ufc|wwe|aew|boxing|ppv|fight|football|soccer|f1|formula ?1|golf|tennis|cricket|rugby|racing|nascar|motorsport|premier league|bein|dazn|game ?pass|sunday ticket|nba league pass|mlb\.tv)\b/i;

/** True when a live category name looks like a sports category. */
export function isSportsCategoryName(name: string | null | undefined): boolean {
    return SPORTS_CATEGORY_PATTERN.test(name ?? '');
}

export interface LiveSportsCategoryRow {
    readonly id: number;
    readonly name: string;
    readonly xtream_id: number;
    readonly hidden?: boolean | null;
    readonly locked?: boolean | null;
}

export interface LiveSportsContentRow {
    readonly id: number;
    readonly category_id: number;
    readonly title: string;
    readonly xtream_id: number;
    readonly poster_url?: string | null;
}

/** A live channel with the name of the category it was found in. */
export interface LiveCategoryChannel {
    readonly item: PortalActivityItem;
    readonly categoryName: string;
}

/**
 * Live channels of one playlist's visible categories whose name `isWanted`
 * accepts, in provider order, as dashboard activity items. `category_id` on
 * a content row is the database category id; the item carries the provider
 * category id instead, which is what Xtream navigation expects.
 */
export function buildLiveCategoryChannels(
    playlist: { readonly id: string; readonly name?: string },
    categories: readonly LiveSportsCategoryRow[],
    content: readonly LiveSportsContentRow[],
    isWanted: (categoryName: string) => boolean,
    limit = LIVE_SPORTS_PER_PLAYLIST_LIMIT
): LiveCategoryChannel[] {
    const wanted = new Map<number, LiveSportsCategoryRow>();
    for (const category of categories) {
        if (category.hidden || category.locked) continue;
        if (isWanted(category.name)) {
            wanted.set(category.id, category);
        }
    }
    if (wanted.size === 0) return [];

    const channels: LiveCategoryChannel[] = [];
    for (const row of content) {
        if (channels.length >= limit) break;
        const category = wanted.get(row.category_id);
        if (!category) continue;
        channels.push({
            categoryName: category.name,
            item: {
                id: row.id,
                title: row.title,
                type: 'live',
                playlist_id: playlist.id,
                ...(playlist.name ? { playlist_name: playlist.name } : {}),
                category_id: category.xtream_id,
                xtream_id: row.xtream_id,
                ...(row.poster_url ? { poster_url: row.poster_url } : {}),
                source: 'xtream',
            },
        });
    }
    return channels;
}

/** Live channels of one playlist's visible sports categories. */
export function buildLiveSportsItems(
    playlist: { readonly id: string; readonly name?: string },
    categories: readonly LiveSportsCategoryRow[],
    content: readonly LiveSportsContentRow[],
    limit = LIVE_SPORTS_PER_PLAYLIST_LIMIT
): PortalActivityItem[] {
    return buildLiveCategoryChannels(
        playlist,
        categories,
        content,
        isSportsCategoryName,
        limit
    ).map((channel) => channel.item);
}

/**
 * A guide title that reads like a match: "Team A vs Team B", "A v B",
 * "A @ B", "Bears at Packers". Plain "at" only counts between two
 * capitalized words ("highlights at halftime" is not a game); a show named
 * like "Live at Five" still reads as one, which only moves its card up.
 */
const GAME_TITLE_PATTERN = /\s(?:vs\.?|v\.?|@)\s|[A-Z][\w.'&-]*\sat\s[A-Z]/;

export function isGameTitle(title: string | null | undefined): boolean {
    return GAME_TITLE_PATTERN.test(title ?? '');
}

/**
 * Orders sports cards: games on now first, then anything else on air, then
 * channels without guide data. The sort is stable, so provider order holds
 * inside each group.
 */
export function rankLiveSportsCards<
    T extends { readonly nowPlayingTitle?: string | null },
>(cards: readonly T[]): T[] {
    const score = (card: T): number =>
        isGameTitle(card.nowPlayingTitle) ? 2 : card.nowPlayingTitle ? 1 : 0;
    return cards
        .map((card, index) => ({ card, index, score: score(card) }))
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map(({ card }) => card);
}

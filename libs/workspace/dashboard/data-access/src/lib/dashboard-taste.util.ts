import { categoryCountry } from '@iptvnator/shared/interfaces';

/**
 * NaviTV "Make Home yours": what a viewer likes, and how each pick finds
 * titles (TMDB genres) or channels (live category names).
 */

/** Shows & movies picks. */
export const TASTE_GENRES = [
    'reality',
    'drama',
    'comedy',
    'crime',
    'action',
    'scifi',
    'documentary',
    'kids',
    'novelas',
] as const;
export type TasteGenre = (typeof TASTE_GENRES)[number];

/** Live TV picks. */
export const TASTE_LIVE = [
    'news',
    'local',
    'entertainment',
    'kids',
    'spanish',
    'movies',
    'music',
] as const;
export type TasteLive = (typeof TASTE_LIVE)[number];

export interface DashboardTaste {
    readonly genres: readonly TasteGenre[];
    readonly live: readonly TasteLive[];
}

/** One TMDB discover query: a genre, optionally from one origin country. */
export interface TasteDiscoverQuery {
    readonly mediaType: 'movie' | 'tv';
    readonly genreId: number;
    readonly countryCode?: string;
}

/**
 * TMDB genre ids (they differ between TV and films). Series come first: the
 * rows are "shows you might like", films fill in.
 */
export const TASTE_GENRE_QUERIES: Readonly<
    Record<TasteGenre, readonly TasteDiscoverQuery[]>
> = {
    reality: [{ mediaType: 'tv', genreId: 10764 }],
    drama: [
        { mediaType: 'tv', genreId: 18 },
        { mediaType: 'movie', genreId: 18 },
    ],
    comedy: [
        { mediaType: 'tv', genreId: 35 },
        { mediaType: 'movie', genreId: 35 },
    ],
    crime: [
        { mediaType: 'tv', genreId: 80 },
        { mediaType: 'movie', genreId: 80 },
    ],
    action: [
        { mediaType: 'tv', genreId: 10759 },
        { mediaType: 'movie', genreId: 28 },
    ],
    scifi: [
        { mediaType: 'tv', genreId: 10765 },
        { mediaType: 'movie', genreId: 878 },
    ],
    documentary: [
        { mediaType: 'tv', genreId: 99 },
        { mediaType: 'movie', genreId: 99 },
    ],
    kids: [
        { mediaType: 'tv', genreId: 10762 },
        { mediaType: 'movie', genreId: 10751 },
    ],
    // Telenovelas: drama and soap series made in Mexico and Colombia.
    novelas: [
        { mediaType: 'tv', genreId: 10766, countryCode: 'MX' },
        { mediaType: 'tv', genreId: 18, countryCode: 'MX' },
        { mediaType: 'tv', genreId: 18, countryCode: 'CO' },
    ],
};

const LIVE_PATTERNS: Readonly<Record<TasteLive, RegExp>> = {
    news: /\b(?:news|noticias|cnn|msnbc|cnbc|bloomberg|weather|c-?span)\b/i,
    local: /\b(?:locals?|local channels|abc|nbc|cbs|fox|pbs|cw|my ?network)\b/i,
    entertainment:
        /\b(?:entertainment|general|variety|lifestyle|reality|comedy|drama)\b/i,
    kids: /\b(?:kids?|children|cartoons?|disney|nick(?:elodeon)?|junior|baby|infantil|ni[ñn]os)\b/i,
    spanish:
        /\b(?:latino|latin|spanish|espa[ñn]ol|hispan[oa]|m[eé]xico|univision|telemundo|novelas?)\b/i,
    movies: /\b(?:movies?|cinema|cine|pel[ií]culas|hbo|showtime|starz|cinemax|epix|mgm|amc|tcm)\b/i,
    music: /\b(?:music|m[uú]sica|mtv|vh1|concerts?)\b/i,
};

/** The Live TV pick a live category belongs to, first match in pick order. */
export function liveTasteOf(
    categoryName: string,
    picks: readonly TasteLive[]
): TasteLive | null {
    for (const pick of picks) {
        if (pick === 'spanish') {
            const country = categoryCountry(categoryName);
            if (country === 'ES' || country === 'MX' || country === 'LATINO') {
                return pick;
            }
        }
        if (LIVE_PATTERNS[pick].test(categoryName)) return pick;
    }
    return null;
}

/**
 * Interleaves channels of each pick (one of each in turn), so a row of News,
 * Kids and Spanish TV does not open with thirty news channels.
 */
export function interleaveByPick<T>(
    groups: ReadonlyMap<TasteLive, readonly T[]>,
    limit: number
): T[] {
    const queues = [...groups.values()].map((items) => [...items]);
    const out: T[] = [];
    while (out.length < limit && queues.some((queue) => queue.length > 0)) {
        for (const queue of queues) {
            const next = queue.shift();
            if (next !== undefined) out.push(next);
            if (out.length >= limit) break;
        }
    }
    return out;
}

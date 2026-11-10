import { Injectable, inject, signal } from '@angular/core';
import {
    CatalogTitleMatchService,
    TmdbEnrichmentService,
} from '@iptvnator/services';
import type { PortalActivityItem } from '@iptvnator/shared/interfaces';
import {
    DashboardLiveChannelsLoader,
    type LiveChannelsPlaylist,
} from './dashboard-live-channels.loader';
import {
    buildRecommendationItems,
    type DashboardRecommendationItem,
    type RecommendationCandidate,
} from './dashboard-recommendations.util';
import {
    interleaveByPick,
    liveTasteOf,
    TASTE_GENRE_QUERIES,
    type TasteGenre,
    type TasteLive,
} from './dashboard-taste.util';

/** Genre rows shown at most (the first picks win). */
export const TASTE_GENRE_ROW_LIMIT = 4;
/** TMDB titles per genre sent to the catalog match (two aliases each). */
const CANDIDATES_PER_GENRE = 25;
const ITEMS_PER_ROW = 18;
/** Fewer matches than this hide a row: two cards read worse than none. */
export const TASTE_MIN_ROW_ITEMS = 4;
const LIVE_ROW_LIMIT = 30;

export interface DashboardTasteRow {
    readonly genre: TasteGenre;
    readonly items: readonly DashboardRecommendationItem[];
}

/**
 * NaviTV "Make Home yours" rows: per chosen genre, TMDB's popular shows and
 * films of that genre that exist in the viewer's catalog (one batched title
 * match, as "Trending" does); and "Live TV for you", channels from the live
 * categories of the chosen Live TV picks.
 */
@Injectable({ providedIn: 'root' })
export class DashboardTasteRailsService {
    private readonly enrichment = inject(TmdbEnrichmentService);
    private readonly titleMatch = inject(CatalogTitleMatchService);
    private readonly loader = inject(DashboardLiveChannelsLoader);

    private readonly rowsState = signal<DashboardTasteRow[]>([]);
    readonly rows = this.rowsState.asReadonly();
    private readonly liveState = signal<PortalActivityItem[]>([]);
    readonly liveChannels = this.liveState.asReadonly();

    private genreKey: string | null = null;
    private liveKey: string | null = null;
    private genreGeneration = 0;
    private liveGeneration = 0;

    get genresAvailable(): boolean {
        return this.enrichment.isEnabled() && this.titleMatch.isAvailable;
    }

    async loadGenres(genres: readonly TasteGenre[]): Promise<void> {
        const picked = genres.slice(0, TASTE_GENRE_ROW_LIMIT);
        const key = `${this.enrichment.language()}|${picked.join(',')}`;
        if (key === this.genreKey) return;
        this.genreKey = key;
        const generation = ++this.genreGeneration;
        if (picked.length === 0 || !this.genresAvailable) {
            this.rowsState.set([]);
            return;
        }

        const candidates = new Map<TasteGenre, RecommendationCandidate[]>();
        for (const genre of picked) {
            const list: RecommendationCandidate[] = [];
            for (const query of TASTE_GENRE_QUERIES[genre]) {
                const titles =
                    (await this.enrichment
                        .discoverTitles(query.mediaType, {
                            genreId: query.genreId,
                            countryCode: query.countryCode ?? null,
                        })
                        .catch(() => null)) ?? [];
                for (const title of titles) {
                    list.push({
                        tmdbId: title.tmdbId,
                        mediaType: title.mediaType,
                        title: title.title,
                        originalTitle:
                            title.originalTitle &&
                            title.originalTitle !== title.title
                                ? title.originalTitle
                                : null,
                        year: title.year,
                        posterUrl: title.posterUrl,
                        rating: null,
                        seedTitle: genre,
                    });
                }
            }
            candidates.set(genre, list.slice(0, CANDIDATES_PER_GENRE));
            if (generation !== this.genreGeneration) return;
        }

        const queryTitles: string[] = [];
        for (const list of candidates.values()) {
            for (const candidate of list) {
                queryTitles.push(candidate.title);
                if (candidate.originalTitle) {
                    queryTitles.push(candidate.originalTitle);
                }
            }
        }
        const matches = this.titleMatch.visibleMatches(
            await this.titleMatch.matchTitles(queryTitles)
        );
        if (generation !== this.genreGeneration) return;

        const rows: DashboardTasteRow[] = [];
        for (const genre of picked) {
            const items = buildRecommendationItems(
                candidates.get(genre) ?? [],
                matches,
                ITEMS_PER_ROW
            );
            if (items.length >= TASTE_MIN_ROW_ITEMS)
                rows.push({ genre, items });
        }
        this.rowsState.set(rows);
        // An empty answer (catalog still loading on the TV) may be retried.
        if (rows.length === 0) this.genreKey = null;
    }

    async loadLive(
        playlists: readonly LiveChannelsPlaylist[],
        picks: readonly TasteLive[]
    ): Promise<void> {
        const xtream = playlists.filter((playlist) => !!playlist.serverUrl);
        const key = `${xtream.map((p) => p._id).join('|')}#${picks.join(',')}`;
        if (key === this.liveKey) return;
        this.liveKey = key;
        const generation = ++this.liveGeneration;
        if (picks.length === 0 || xtream.length === 0) {
            this.liveState.set([]);
            return;
        }

        const groups = new Map<TasteLive, PortalActivityItem[]>();
        for (const pick of picks) groups.set(pick, []);
        for (const playlist of xtream) {
            try {
                const channels = await this.loader.load(
                    playlist,
                    (name) => liveTasteOf(name, picks) !== null,
                    LIVE_ROW_LIMIT * 2,
                    picks.length * 2
                );
                for (const channel of channels) {
                    const pick = liveTasteOf(channel.categoryName, picks);
                    if (pick) groups.get(pick)?.push(channel.item);
                }
            } catch (error) {
                console.warn(
                    '[DashboardTasteRails] Live channels failed',
                    error
                );
            }
            if (generation !== this.liveGeneration) return;
        }
        this.liveState.set(interleaveByPick(groups, LIVE_ROW_LIMIT));
    }

    /** Read again on the next load (a revisit after the catalog changed). */
    invalidate(): void {
        this.genreKey = null;
        this.liveKey = null;
    }
}

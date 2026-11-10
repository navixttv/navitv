import { Injectable, inject, signal } from '@angular/core';
import { StreamResolverService } from '@iptvnator/portal/shared/data-access';
import type { PortalActivityItem } from '@iptvnator/shared/interfaces';
import { buildDashboardPortalLiveEpgEntry } from './dashboard-portal-live-epg.util';
import {
    buildUpcomingGames,
    orderChannelsForGuide,
    type DashboardSport,
    type UpcomingGame,
    type UpcomingGameChannel,
} from './dashboard-upcoming-games.util';

/** Sports channels whose guide is read per load (one request each). */
export const UPCOMING_GAMES_CHANNEL_LIMIT = 16;
const CONCURRENCY = 3;
/** A guide answer is reused this long before the channel is asked again. */
const GUIDE_TTL_MS = 20 * 60_000;

/**
 * Loads the NaviTV "Upcoming games" row: the guide of the most relevant sports
 * channels (chosen sports first, then the big networks), searched for games on
 * now or in the next 24 hours. Works wherever the channel's guide works: the
 * provider's own guide on every platform, an imported XMLTV guide on desktop.
 */
@Injectable({ providedIn: 'root' })
export class DashboardUpcomingGamesService {
    private readonly resolver = inject(StreamResolverService);

    private readonly gamesState = signal<UpcomingGame<PortalActivityItem>[]>(
        []
    );
    readonly games = this.gamesState.asReadonly();

    private readonly loadingState = signal(false);
    readonly loading = this.loadingState.asReadonly();

    private readonly guides = new Map<
        string,
        { fetchedAt: number; channel: UpcomingGameChannel<PortalActivityItem> }
    >();
    private generation = 0;

    async load(
        channels: readonly PortalActivityItem[],
        sports: readonly DashboardSport[] | null
    ): Promise<void> {
        const generation = ++this.generation;
        const picked = orderChannelsForGuide(channels, sports).slice(
            0,
            UPCOMING_GAMES_CHANNEL_LIMIT
        );
        if (picked.length === 0) {
            this.gamesState.set([]);
            return;
        }
        this.loadingState.set(true);
        const answers: UpcomingGameChannel<PortalActivityItem>[] = new Array(
            picked.length
        );
        let next = 0;
        const worker = async (): Promise<void> => {
            while (next < picked.length) {
                if (generation !== this.generation) return;
                const index = next++;
                answers[index] = await this.guideFor(picked[index]);
                // Show games as soon as the first channels answer.
                if (generation === this.generation) {
                    this.publish(answers, sports);
                }
            }
        };
        try {
            await Promise.all(
                Array.from(
                    { length: Math.min(CONCURRENCY, picked.length) },
                    () => worker()
                )
            );
        } finally {
            if (generation === this.generation) {
                this.publish(answers, sports);
                this.loadingState.set(false);
            }
        }
    }

    private publish(
        answers: readonly (
            UpcomingGameChannel<PortalActivityItem> | undefined
        )[],
        sports: readonly DashboardSport[] | null
    ): void {
        const ready: UpcomingGameChannel<PortalActivityItem>[] = [];
        for (const answer of answers) {
            if (answer) ready.push(answer);
        }
        this.gamesState.set(buildUpcomingGames(ready, Date.now(), sports));
    }

    private async guideFor(
        channel: PortalActivityItem
    ): Promise<UpcomingGameChannel<PortalActivityItem>> {
        const key = `${channel.playlist_id}:${channel.xtream_id ?? channel.id}`;
        const cached = this.guides.get(key);
        if (cached && Date.now() - cached.fetchedAt < GUIDE_TTL_MS) {
            return cached.channel;
        }
        const entry = buildDashboardPortalLiveEpgEntry(channel);
        let programs: Awaited<
            ReturnType<StreamResolverService['loadEpgItems']>
        > = [];
        if (entry) {
            try {
                programs = await this.resolver.loadEpgItems(entry.item);
            } catch {
                programs = [];
            }
        }
        const answer: UpcomingGameChannel<PortalActivityItem> = {
            channel,
            channelName: channel.title,
            programs,
        };
        this.guides.set(key, { fetchedAt: Date.now(), channel: answer });
        return answer;
    }
}

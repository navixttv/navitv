import type { PortalActivityItem } from '@iptvnator/shared/interfaces';
import {
    buildUpcomingGameCard,
    upcomingGameTimeLabel,
} from './dashboard-live-sports.cards';

const labels = {
    live: 'Live',
    today: 'Today',
    tomorrow: 'Tomorrow',
    locale: 'en-US',
};

describe('upcoming game cards', () => {
    const now = new Date(2026, 10, 9, 12, 0, 0).getTime();
    const at = (day: number, hour: number, minute = 0) =>
        new Date(2026, 10, day, hour, minute, 0).getTime();

    it('labels live, today, tomorrow and later games', () => {
        expect(
            upcomingGameTimeLabel(
                { startMs: at(9, 11), stopMs: at(9, 14), live: true },
                now,
                labels
            )
        ).toMatch(/^Live · 11:00\sAM – 2:00\sPM$/);
        expect(
            upcomingGameTimeLabel(
                { startMs: at(9, 19, 30), stopMs: at(9, 22), live: false },
                now,
                labels
            )
        ).toMatch(/^Today 7:30\sPM$/);
        expect(
            upcomingGameTimeLabel(
                { startMs: at(10, 13), stopMs: at(10, 16), live: false },
                now,
                labels
            )
        ).toMatch(/^Tomorrow 1:00\sPM$/);
        expect(
            upcomingGameTimeLabel(
                { startMs: at(12, 17), stopMs: at(12, 20), live: false },
                now,
                labels
            )
        ).toMatch(/^Thu 5:00\sPM$/);
    });

    it('shows the game under its channel and tunes to the channel', () => {
        const channel: PortalActivityItem = {
            id: 70,
            title: 'US| Sports One',
            type: 'live',
            playlist_id: 'xt',
            category_id: 7,
            xtream_id: 70,
            source: 'xtream',
        };
        const card = buildUpcomingGameCard(
            {
                key: 'a@1',
                title: 'Team A vs Team B',
                channel,
                channelName: channel.title,
                startMs: at(9, 11),
                stopMs: at(9, 13),
                live: true,
                sport: null,
            },
            now,
            labels
        );
        expect(card).toMatchObject({
            title: 'US| Sports One',
            nowPlayingTitle: 'Team A vs Team B',
            nowPlayingProgress: 50,
            liveEpgSourceKey: null,
            contentType: 'live',
        });
        expect(card.link.length).toBeGreaterThan(0);
    });
});

import type { EpgItem } from '@iptvnator/shared/interfaces';
import {
    buildUpcomingGames,
    detectSport,
    isUpcomingGame,
    orderChannelsForGuide,
} from './dashboard-upcoming-games.util';

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 10, 9, 20, 0, 0);

function program(
    title: string,
    startOffsetH: number,
    lengthH = 3,
    description = ''
): EpgItem {
    const start = NOW + startOffsetH * HOUR;
    const stop = start + lengthH * HOUR;
    return {
        id: title,
        epg_id: '1',
        title,
        lang: 'en',
        start: new Date(start).toISOString(),
        end: new Date(stop).toISOString(),
        stop: new Date(stop).toISOString(),
        description,
        channel_id: '1',
        start_timestamp: String(start / 1000),
        stop_timestamp: String(stop / 1000),
    };
}

describe('dashboard upcoming games', () => {
    it.each([
        ['Team A vs Team B', true],
        ['UFC 999: Main Card', true],
        ['Boxing: Fighter A vs Fighter B', true],
        ['NFL Football', false],
        ['SportsCenter', false],
        ['NBA Today', false],
        ['Classic: Team A vs Team B', false],
    ])('reads %p as a game: %p', (title, expected) => {
        expect(isUpcomingGame(title)).toBe(expected);
    });

    it('takes a game from the description when the title names the sport', () => {
        expect(isUpcomingGame('NFL Football', 'Team A at Team B.')).toBe(true);
        expect(isUpcomingGame('NFL Live', 'Team A at Team B.')).toBe(false);
    });

    it.each([
        ['NBA Basketball: Team A vs Team B', '', '', 'basketball'],
        ['College Football: Team A vs Team B', '', '', 'football'],
        ['Football: Club A vs Club B', '', 'UK| Sky Sports', 'soccer'],
        ['Football: Team A vs Team B', '', 'US| ESPN', 'football'],
        ['UFC 999', '', '', 'fights'],
        ['Liga MX: Club A vs Club B', '', '', 'soccer'],
        ['Team A vs Team B', '', 'US| NHL Network', 'hockey'],
        ['Team A vs Team B', '', 'Sports 1', null],
    ])(
        'detects the sport of %p (%p, %p)',
        (title, description, channel, sport) => {
            expect(detectSport(title, description, channel)).toBe(sport);
        }
    );

    const channels = [
        {
            channel: { id: 'espn' },
            channelName: 'US| ESPN',
            programs: [
                program('SportsCenter', -1, 1),
                program('NBA Basketball: Team A vs Team B', -1, 3),
                program('College Football: Team C vs Team D', 3, 4),
                program('Ended: Team E vs Team F', -5, 2),
                program('Far away: Team G vs Team H', 30, 3),
            ],
        },
        {
            channel: { id: 'espn2' },
            channelName: 'US| ESPN2',
            programs: [
                program('College Football: Team C vs Team D', 3, 4),
                program('UFC 999: Main Card', 1, 3),
            ],
        },
    ];

    it('keeps games on now or within a day, live first, each game once', () => {
        const games = buildUpcomingGames(channels, NOW);
        expect(
            games.map((game) => [game.title, game.live, game.channel])
        ).toEqual([
            ['NBA Basketball: Team A vs Team B', true, { id: 'espn' }],
            ['UFC 999: Main Card', false, { id: 'espn2' }],
            ['College Football: Team C vs Team D', false, { id: 'espn' }],
        ]);
    });

    it('keeps only the chosen sports', () => {
        const games = buildUpcomingGames(channels, NOW, ['fights', 'football']);
        expect(games.map((game) => game.sport)).toEqual(['fights', 'football']);
    });

    it('treats an empty choice as all sports', () => {
        expect(buildUpcomingGames(channels, NOW, [])).toHaveLength(3);
    });

    it('reads the guide of chosen-sport channels, then big networks, first', () => {
        const ordered = orderChannelsForGuide(
            [
                { title: 'US| Sports 1' },
                { title: 'US| ESPN' },
                { title: 'US| NBA TV' },
                { title: 'US| UFC Fight Pass' },
            ],
            ['fights']
        );
        expect(ordered.map((channel) => channel.title)).toEqual([
            'US| UFC Fight Pass',
            'US| ESPN',
            'US| NBA TV',
            'US| Sports 1',
        ]);
    });
});

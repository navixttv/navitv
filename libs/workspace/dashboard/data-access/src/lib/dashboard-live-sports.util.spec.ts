import {
    buildLiveSportsItems,
    isGameTitle,
    isSportsCategoryName,
    rankLiveSportsCards,
} from './dashboard-live-sports.util';

describe('dashboard live sports', () => {
    it.each([
        'US | Sports',
        'NFL Game Pass',
        'UK: Football',
        'PPV Events',
        'ESPN+',
        'NBA League Pass',
        'Golf & Tennis',
    ])('treats %p as a sports category', (name) => {
        expect(isSportsCategoryName(name)).toBe(true);
    });

    it.each(['US | News', 'Kids', 'Movies 4K', 'Documentaries', '', null])(
        'does not treat %p as a sports category',
        (name) => {
            expect(isSportsCategoryName(name)).toBe(false);
        }
    );

    const categories = [
        { id: 1, name: 'US | Sports', xtream_id: 101 },
        { id: 2, name: 'US | News', xtream_id: 102 },
        { id: 3, name: 'FR | Sport', xtream_id: 103, hidden: true },
        { id: 4, name: 'NFL Locked', xtream_id: 104, locked: true },
    ];
    const content = [
        { id: 10, category_id: 1, title: 'Sports 1', xtream_id: 501 },
        { id: 11, category_id: 2, title: 'News 24', xtream_id: 502 },
        { id: 12, category_id: 3, title: 'Sport FR', xtream_id: 503 },
        { id: 13, category_id: 4, title: 'Locked', xtream_id: 504 },
        {
            id: 14,
            category_id: 1,
            title: 'Sports 2',
            xtream_id: 505,
            poster_url: 'https://logos.example.test/s2.png',
        },
    ];

    it('keeps channels of visible, unlocked sports categories with provider ids', () => {
        expect(
            buildLiveSportsItems(
                { id: 'pl-1', name: 'Provider' },
                categories,
                content
            )
        ).toEqual([
            {
                id: 10,
                title: 'Sports 1',
                type: 'live',
                playlist_id: 'pl-1',
                playlist_name: 'Provider',
                category_id: 101,
                xtream_id: 501,
                source: 'xtream',
            },
            {
                id: 14,
                title: 'Sports 2',
                type: 'live',
                playlist_id: 'pl-1',
                playlist_name: 'Provider',
                category_id: 101,
                xtream_id: 505,
                poster_url: 'https://logos.example.test/s2.png',
                source: 'xtream',
            },
        ]);
    });

    it('respects the per-playlist limit and returns nothing without sports', () => {
        expect(
            buildLiveSportsItems({ id: 'pl' }, categories, content, 1)
        ).toHaveLength(1);
        expect(
            buildLiveSportsItems({ id: 'pl' }, [categories[1]], content)
        ).toEqual([]);
    });

    it.each([
        ['Team A vs Team B', true],
        ['Team A vs. Team B', true],
        ['Club A v Club B', true],
        ['Team A @ Team B', true],
        ['Team A at Team B', true],
        ['Highlights at halftime', false],
        ['SportsCenter', false],
        ['', false],
        [null, false],
    ])('reads %p as a game: %p', (title, expected) => {
        expect(isGameTitle(title)).toBe(expected);
    });

    it('ranks games first, then programmes, keeping provider order inside groups', () => {
        const cards = [
            { id: 'a', nowPlayingTitle: null },
            { id: 'b', nowPlayingTitle: 'Studio Show' },
            { id: 'c', nowPlayingTitle: 'Team A vs Team B' },
            { id: 'd', nowPlayingTitle: 'Highlights' },
            { id: 'e', nowPlayingTitle: 'Team C @ Team D' },
        ];
        expect(rankLiveSportsCards(cards).map((card) => card.id)).toEqual([
            'c',
            'e',
            'b',
            'd',
            'a',
        ]);
    });
});

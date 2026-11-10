import {
    interleaveByPick,
    liveTasteOf,
    TASTE_GENRE_QUERIES,
    TASTE_GENRES,
    type TasteLive,
} from './dashboard-taste.util';

describe('dashboard taste', () => {
    it('has TMDB queries for every genre pick', () => {
        for (const genre of TASTE_GENRES) {
            expect(TASTE_GENRE_QUERIES[genre].length).toBeGreaterThan(0);
        }
        expect(TASTE_GENRE_QUERIES.reality).toEqual([
            { mediaType: 'tv', genreId: 10764 },
        ]);
    });

    it.each([
        ['US| NEWS NETWORK', ['news'], 'news'],
        ['US| KIDS NETWORK', ['news', 'kids'], 'kids'],
        ['ES| Canales', ['spanish'], 'spanish'],
        ['LATINO | General', ['spanish'], 'spanish'],
        ['US| Telemundo', ['spanish'], 'spanish'],
        ['US| MOVIES NETWORK', ['movies'], 'movies'],
        ['US| LOCALS', ['local'], 'local'],
        ['US| ENTERTAINMENT', ['entertainment'], 'entertainment'],
        ['US| SPORTS NETWORK', ['news', 'kids'], null],
    ] as const)('puts %p in %p as %p', (name, picks, expected) => {
        expect(liveTasteOf(name, picks as readonly TasteLive[])).toBe(expected);
    });

    it('interleaves the picks one channel at a time', () => {
        const groups = new Map<TasteLive, string[]>([
            ['news', ['n1', 'n2', 'n3']],
            ['kids', ['k1']],
            ['spanish', ['s1', 's2']],
        ]);
        expect(interleaveByPick(groups, 10)).toEqual([
            'n1',
            'k1',
            's1',
            'n2',
            's2',
            'n3',
        ]);
        expect(interleaveByPick(groups, 2)).toEqual(['n1', 'k1']);
    });
});

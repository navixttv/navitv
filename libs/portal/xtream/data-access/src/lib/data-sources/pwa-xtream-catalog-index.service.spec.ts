import {
    buildCatalogIndexEntries,
    matchCatalogTitles,
} from './pwa-xtream-catalog-index.service';

describe('PWA catalog index', () => {
    const playlist = { id: 'pl', name: 'Provider' };
    const movies = buildCatalogIndexEntries(playlist, 'movie', [
        {
            xtream_id: 11,
            stream_id: 11,
            category_id: '5',
            title: 'Example Film',
            poster_url: 'https://img.example/a.jpg',
            added: '1700000000',
        },
        {
            xtream_id: 12,
            stream_id: 12,
            category_id: '5',
            title: 'Space Saga 2049',
            added: '1800000000',
        },
        { stream_id: 13, category_id: '5', title: '' },
    ]);
    const series = buildCatalogIndexEntries(playlist, 'series', [
        {
            series_id: 21,
            xtream_id: 21,
            category_id: '9',
            name: 'Example Show',
            last_modified: '1750000000',
        },
    ]);

    it('keeps titled rows with their provider ids, poster and added time', () => {
        expect(movies).toHaveLength(2);
        expect(movies[0]).toMatchObject({
            playlistId: 'pl',
            playlistName: 'Provider',
            type: 'movie',
            xtreamId: 11,
            categoryId: 5,
            posterUrl: 'https://img.example/a.jpg',
            addedMs: 1_700_000_000_000,
        });
        expect(series[0]).toMatchObject({
            type: 'series',
            xtreamId: 21,
            addedMs: 1_750_000_000_000,
        });
    });

    it('matches exact titles first, then without the trailing year', () => {
        const matches = matchCatalogTitles(
            [...movies, ...series],
            ['example film', 'Example Show', 'Space Saga', 'Unknown']
        );
        expect(
            matches.map((m) => [
                m.queryTitle,
                m.xtreamId,
                m.type,
                m.trailingYear,
            ])
        ).toEqual([
            ['example film', 11, 'movie', null],
            ['Example Show', 21, 'series', null],
            ['Space Saga', 12, 'movie', 2049],
        ]);
    });
});

import type { XtreamCategory } from '@iptvnator/shared/interfaces';
import {
    fetchCatalogByCategory,
    keptCatalogCategories,
} from './pwa-country-catalog';

const category = (category_id: string, category_name: string) =>
    ({ category_id, category_name, parent_id: 0 }) as XtreamCategory;

describe('pwa country catalog', () => {
    it('keeps English and Spanish categories and drops foreign ones', () => {
        const kept = keptCatalogCategories([
            category('1', 'EN | Action'),
            category('2', 'NL | Netflix'),
            category('3', 'ES | Peliculas'),
            category('4', 'AR | Drama'),
            category('5', 'Top Movies'),
        ]);
        expect(kept.map((c) => c.category_id)).toEqual(['1', '3', '5']);
    });

    it('reads each kept category, in category order, without duplicates', async () => {
        const catalog: Record<
            string,
            { stream_id: number; category_id: string }[]
        > = {
            '1': [
                { stream_id: 10, category_id: '1' },
                { stream_id: 11, category_id: '1' },
            ],
            '3': [
                { stream_id: 30, category_id: '3' },
                { stream_id: 11, category_id: '3' },
            ],
        };
        const fetchCategory = jest.fn(
            async (id: string | number) => catalog[String(id)] ?? []
        );
        const progress: number[] = [];

        const rows = await fetchCatalogByCategory(['1', '3'], fetchCategory, {
            concurrency: 2,
            onProgress: (count) => progress.push(count),
        });

        expect(fetchCategory).toHaveBeenCalledTimes(2);
        expect(rows.map((row) => row.stream_id)).toEqual([10, 11, 30]);
        expect(progress[progress.length - 1]).toBe(4);
    });

    it('falls back to the whole answer when the provider ignores category_id', async () => {
        const whole = [
            { stream_id: 1, category_id: '1' },
            { stream_id: 2, category_id: '2' },
            { stream_id: 3, category_id: '3' },
        ];
        const fetchCategory = jest.fn(async () => whole);

        const rows = await fetchCatalogByCategory(['1', '3'], fetchCategory, {
            concurrency: 1,
        });

        expect(fetchCategory).toHaveBeenCalledTimes(1);
        expect(rows.map((row) => row.stream_id)).toEqual([1, 3]);
    });

    it('stops when aborted', async () => {
        const controller = new AbortController();
        controller.abort();
        await expect(
            fetchCatalogByCategory(['1'], async () => [], {
                signal: controller.signal,
            })
        ).rejects.toBeDefined();
    });
});

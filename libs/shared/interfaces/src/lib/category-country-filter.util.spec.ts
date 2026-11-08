import {
    categoryCountry,
    DEFAULT_CONTENT_COUNTRIES,
    foreignCategoryXtreamIds,
    isCategoryOutsideCountries,
    withForeignCategoriesHidden,
} from './category-country-filter.util';

describe('category country filter', () => {
    it.each([
        ['US | Sports', 'US'],
        ['USA: News', 'US'],
        ['|UK| Entertainment', 'UK'],
        ['UK - Kids', 'UK'],
        ['[GB] Drama', 'UK'],
        ['EN - Movies', 'EN'],
        ['FR: Cinema', 'FR'],
        ['|DE| Football', 'DE'],
        ['(IN) Bollywood', 'IN'],
        ['ARABIC | Series', 'ARABIC'],
        ['LAT - Novelas', 'LATINO'],
        ['EX-YU | Sport', 'EXYU'],
    ])('reads the country tag of %p as %p', (name, country) => {
        expect(categoryCountry(name)).toBe(country);
    });

    it.each([
        'Sky - Sports F1',
        '24/7 Channels',
        '4K | Movies',
        'PPV | Boxing',
        'NFL | Game Pass',
        'VIP Sports',
        'NCIS: Collection',
        'TV | Shows',
        'SD | Kids',
        'USA Today',
        '',
        null,
        undefined,
    ])('finds no country tag in %p', (name) => {
        expect(categoryCountry(name)).toBeNull();
    });

    it('defaults to US and UK', () => {
        expect(DEFAULT_CONTENT_COUNTRIES).toEqual(['US', 'UK']);
    });

    it('keeps allowed, English and untagged categories visible', () => {
        for (const name of ['US | A', 'UK: B', 'EN - C', '4K | D', 'Kids']) {
            expect(isCategoryOutsideCountries(name)).toBe(false);
        }
    });

    it('hides categories tagged for other countries', () => {
        for (const name of ['FR | A', 'CA: B', 'ARABIC - C', '|DE| D']) {
            expect(isCategoryOutsideCountries(name)).toBe(true);
        }
    });

    it('treats English tags as foreign when no English-speaking country is allowed', () => {
        expect(isCategoryOutsideCountries('EN - Movies', ['FR'])).toBe(true);
        expect(isCategoryOutsideCountries('FR - Films', ['fr'])).toBe(false);
    });

    it('returns provider ids of foreign categories and skips invalid ids', () => {
        expect(
            foreignCategoryXtreamIds([
                { category_id: '1', category_name: 'US | A' },
                { category_id: '2', category_name: 'FR | B' },
                { category_id: 3, category_name: 'DE | C' },
                { category_id: 'x', category_name: 'ES | D' },
                { category_id: null, category_name: 'IT | E' },
            ])
        ).toEqual([2, 3]);
    });

    it('merges foreign ids into restored hidden ids without duplicates', () => {
        const categories = [
            { category_id: '2', category_name: 'FR | B' },
            { category_id: '7', category_name: 'US | C' },
        ];
        expect(withForeignCategoriesHidden([5, 2], categories)).toEqual([5, 2]);
        expect(withForeignCategoriesHidden(undefined, categories)).toEqual([2]);
        expect(
            withForeignCategoriesHidden(undefined, [categories[1]])
        ).toBeUndefined();
        expect(withForeignCategoriesHidden([], [categories[1]])).toEqual([]);
    });
});

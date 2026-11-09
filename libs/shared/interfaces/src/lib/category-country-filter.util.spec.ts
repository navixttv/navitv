import {
    categoryCountry,
    DEFAULT_CONTENT_COUNTRIES,
    foreignCategoryXtreamIds,
    foreignGroupTitles,
    isCategoryOutsideCountries,
    refreshedHiddenGroupTitles,
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
        ['KU - Kids', 'KU'],
        ['KU \u2013 Kids', 'KU'],
        ['GR \u2014 Series', 'GR'],
        ['KU\u00a0-\u00a0Kids', 'KU'],
        ['DE \uff5c Kids', 'DE'],
        ['4K-AR \u2013 Movies', 'AR'],
        ['EN \u2013 Movies', 'EN'],
        ['4K 3840P DOLBY AUDIO \u0623\u0641\u0644\u0627\u0645', 'NON-LATIN'],
        ['FA | Movies', 'FA'],
        ['KUR | Series', 'KU'],
        ['4K-AR - Movies', 'AR'],
        ['FHD | US Sports', null],
        ['4K-US | Movies', 'US'],
        ['OSN+ Movies 4K', 'ARABIC'],
        ['MBC Drama', 'ARABIC'],
        ['أفلام عربية', 'NON-LATIN'],
        ['Фильмы', 'NON-LATIN'],
        ['電影', 'NON-LATIN'],
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
        'TOP 10 | Movies',
        'MY LIST | Movies',
        'Netflix Movies',
        'Pokémon Séries',
        'For Adults',
        '',
        null,
        undefined,
    ])('finds no country tag in %p', (name) => {
        expect(categoryCountry(name)).toBeNull();
    });

    it('defaults to English and Spanish', () => {
        expect(DEFAULT_CONTENT_COUNTRIES).toEqual([
            'US',
            'UK',
            'ES',
            'LATINO',
            'MX',
        ]);
    });

    it('keeps Spanish-language categories visible by default', () => {
        for (const name of [
            'ES | Series',
            'LAT - Novelas',
            'MX: Noticias',
            'SPANISH | Kids',
            'LATAM | Movies',
        ]) {
            expect(isCategoryOutsideCountries(name)).toBe(false);
        }
    });

    it('keeps allowed, English and untagged categories visible', () => {
        for (const name of ['US | A', 'UK: B', 'EN - C', '4K | D', 'Kids']) {
            expect(isCategoryOutsideCountries(name)).toBe(false);
        }
    });

    it('hides categories tagged for other countries', () => {
        for (const name of [
            'FR | A',
            'CA: B',
            'ARABIC - C',
            '|DE| D',
            'KU - E',
            '4K-AR - F',
            'أفلام',
            'OSN+ G',
        ]) {
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

describe('M3U group country filter', () => {
    const item = (title: string) => ({ group: { title } });

    it('lists unique foreign group titles', () => {
        expect(
            foreignGroupTitles([
                item('US | News'),
                item('FR | Cinema'),
                item('FR | Cinema'),
                item('Kids'),
                { group: undefined },
            ])
        ).toEqual(['FR | Cinema']);
    });

    it('keeps the user list and adds only new foreign groups on refresh', () => {
        const current = {
            hiddenGroupTitles: ['US | Shopping'],
            playlist: { items: [item('US | News'), item('DE | Sport')] },
        };
        expect(
            refreshedHiddenGroupTitles(current, [
                item('US | News'),
                // Existing foreign group the user un-hid stays visible.
                item('DE | Sport'),
                item('FR | Football'),
            ])
        ).toEqual(['US | Shopping', 'FR | Football']);
    });

    it('adds nothing when the previous groups are unknown', () => {
        expect(
            refreshedHiddenGroupTitles({ hiddenGroupTitles: ['A'] }, [
                item('FR | Football'),
            ])
        ).toEqual(['A']);
        expect(
            refreshedHiddenGroupTitles({}, [item('FR | Football')])
        ).toBeUndefined();
    });
});

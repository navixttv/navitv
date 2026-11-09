/**
 * NaviTV country filter for provider categories.
 *
 * IPTV providers usually tag each category with a country or language code
 * ("US | Sports", "|UK| News", "FR: Cinema", "[DE] Kids"). On import,
 * categories tagged for a country outside the allowed list start hidden.
 * Categories without a recognizable country tag always stay visible, and a
 * user's own show/hide choice in Manage categories always wins, because the
 * database applies explicit visibility after these defaults.
 */

/** Countries whose categories are visible by default. */
export const DEFAULT_CONTENT_COUNTRIES: readonly string[] = ['US', 'UK'];

/** Tag for English-language categories that name no single country. */
const ENGLISH = 'EN';

/** Countries whose categories an English-language tag is meant for. */
const ENGLISH_SPEAKING = new Set(['US', 'UK']);

/**
 * Two-letter country codes. "TV" (Tuvalu) and "SD" (Sudan) are left out on
 * purpose: providers use them as channel-type and quality tags.
 */
const COUNTRY_CODES = new Set(
    (
        'AD AE AF AG AL AM AO AR AT AU AZ BA BB BD BE BF BG BH BI BJ BN BO BR ' +
        'BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK ' +
        'DM DO DZ EC EE EG ER ES ET FI FJ FR GA GB GD GE GH GM GN GQ GR GT GW ' +
        'GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KM KN KP ' +
        'KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MK ML MM MN ' +
        'MO MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NZ OM PA PE PG PH PK ' +
        'PL PR PT PY QA RO RS RU RW SA SC SE SG SI SK SL SM SN SO SR SV SY SZ ' +
        'TD TG TH TJ TL TM TN TR TT TW TZ UA UG UK US UY UZ VA VE VN YE ZA ZM ZW'
    ).split(' ')
);

/** Longer tags providers use, mapped to a country (or a foreign region). */
const TAG_ALIASES: Readonly<Record<string, string>> = {
    USA: 'US',
    GB: 'UK',
    GBR: 'UK',
    ENG: 'UK',
    EN: ENGLISH,
    ENGLISH: ENGLISH,
    CAN: 'CA',
    MEX: 'MX',
    FRA: 'FR',
    FRENCH: 'FR',
    GER: 'DE',
    DEU: 'DE',
    GERMAN: 'DE',
    ITA: 'IT',
    ITALY: 'IT',
    ESP: 'ES',
    SPA: 'ES',
    SPAIN: 'ES',
    POR: 'PT',
    PRT: 'PT',
    BRA: 'BR',
    NLD: 'NL',
    TUR: 'TR',
    POL: 'PL',
    RUS: 'RU',
    IND: 'IN',
    INDIA: 'IN',
    PAK: 'PK',
    ARA: 'ARABIC',
    ARAB: 'ARABIC',
    ARABIC: 'ARABIC',
    LAT: 'LATINO',
    LATIN: 'LATINO',
    LATINO: 'LATINO',
    AFR: 'AFRICA',
    AFRICA: 'AFRICA',
    ASIA: 'ASIA',
    EXYU: 'EXYU',
    'EX-YU': 'EXYU',
    CARIB: 'CARIBBEAN',
    CARIBBEAN: 'CARIBBEAN',
};

/**
 * A leading tag followed by a separator: "US | x", "US|x", "|US| x",
 * "US: x", "US - x", "[US] x", "(US) x". A tag without any separator
 * ("USA Today") is never treated as a country.
 */
const LEADING_TAG_PATTERN =
    /^\s*(?:\|\s*([A-Za-z-]{2,9})\s*\||\[\s*([A-Za-z-]{2,9})\s*\]|\(\s*([A-Za-z-]{2,9})\s*\)|([A-Za-z-]{2,9})\s*(?:\||:|\s-\s|-\s|\s-))/;

/**
 * The country a category name is tagged for: an uppercase country code,
 * "EN" for English-language categories, a region name (e.g. "ARABIC"), or
 * null when the name carries no recognizable country tag.
 */
export function categoryCountry(
    name: string | null | undefined
): string | null {
    const match = LEADING_TAG_PATTERN.exec(name ?? '');
    if (!match) return null;

    const tag = (match[1] ?? match[2] ?? match[3] ?? match[4] ?? '')
        .trim()
        .toUpperCase();
    if (!tag) return null;

    const alias = TAG_ALIASES[tag];
    if (alias) return alias;
    return tag.length === 2 && COUNTRY_CODES.has(tag) ? tag : null;
}

/**
 * True when the category is tagged for a country outside `allowed`.
 * Untagged categories are never outside the filter.
 */
export function isCategoryOutsideCountries(
    name: string | null | undefined,
    allowed: readonly string[] = DEFAULT_CONTENT_COUNTRIES
): boolean {
    const country = categoryCountry(name);
    if (country === null) return false;

    const allowedSet = new Set(allowed.map((code) => code.toUpperCase()));
    if (country === ENGLISH) {
        return ![...allowedSet].some((code) => ENGLISH_SPEAKING.has(code));
    }
    return !allowedSet.has(country);
}

/** Provider category ids that should start hidden under the country filter. */
export function foreignCategoryXtreamIds(
    categories: readonly {
        category_id?: string | number | null;
        category_name?: string | null;
    }[],
    allowed: readonly string[] = DEFAULT_CONTENT_COUNTRIES
): number[] {
    // A plain loop: the web build compiles this lib with lib=es2018, which
    // has no Array#flatMap.
    const ids: number[] = [];
    for (const category of categories) {
        const id = Number(category.category_id);
        if (category.category_id == null || Number.isNaN(id)) continue;
        if (isCategoryOutsideCountries(category.category_name, allowed)) {
            ids.push(id);
        }
    }
    return ids;
}

/** Default hidden ids merged with the country filter, without duplicates. */
export function withForeignCategoriesHidden(
    hiddenIds: readonly number[] | undefined,
    categories: Parameters<typeof foreignCategoryXtreamIds>[0],
    allowed: readonly string[] = DEFAULT_CONTENT_COUNTRIES
): number[] | undefined {
    const merged = new Set([
        ...(hiddenIds ?? []),
        ...foreignCategoryXtreamIds(categories, allowed),
    ]);
    return merged.size > 0
        ? [...merged]
        : hiddenIds
          ? [...hiddenIds]
          : undefined;
}

type GroupedItem = { group?: { title?: string | null } | null };

/** Unique M3U group titles tagged for countries outside `allowed`. */
export function foreignGroupTitles(
    items: readonly GroupedItem[] | null | undefined,
    allowed: readonly string[] = DEFAULT_CONTENT_COUNTRIES
): string[] {
    const titles = new Set<string>();
    for (const item of items ?? []) {
        const title = item.group?.title;
        if (title && isCategoryOutsideCountries(title, allowed)) {
            titles.add(title);
        }
    }
    return [...titles];
}

/**
 * Hidden M3U groups after a refresh: the user's current list is kept as is,
 * plus foreign groups that did not exist before. Groups the user un-hid stay
 * visible. When the previous groups are unknown, nothing is added.
 */
export function refreshedHiddenGroupTitles(
    current: {
        hiddenGroupTitles?: string[];
        playlist?: { items?: readonly GroupedItem[] } | null;
    },
    updatedItems: readonly GroupedItem[] | null | undefined,
    allowed: readonly string[] = DEFAULT_CONTENT_COUNTRIES
): string[] | undefined {
    const previousItems = current.playlist?.items ?? [];
    if (previousItems.length === 0) return current.hiddenGroupTitles;

    const known = new Set(previousItems.map((item) => item.group?.title ?? ''));
    const added = foreignGroupTitles(updatedItems, allowed).filter(
        (title) => !known.has(title)
    );
    if (added.length === 0) return current.hiddenGroupTitles;
    return [...new Set([...(current.hiddenGroupTitles ?? []), ...added])];
}

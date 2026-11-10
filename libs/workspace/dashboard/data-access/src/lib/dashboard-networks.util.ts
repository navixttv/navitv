import { isCategoryOutsideCountries } from '@iptvnator/shared/interfaces';

/**
 * NaviTV "Networks": the streaming services a provider's film and series
 * categories are named after ("NETFLIX MOVIES", "|EN| DISNEY+", ...).
 */
export interface DashboardNetworkDefinition {
    readonly id: string;
    readonly name: string;
    /** Matches a provider category name. */
    readonly category: RegExp;
    /** Matches TMDB's watch-provider name, for the logo; null: name tile only. */
    readonly provider: RegExp | null;
}

export const DASHBOARD_NETWORKS: readonly DashboardNetworkDefinition[] = [
    {
        id: 'netflix',
        name: 'Netflix',
        category: /\bnetflix\b/i,
        provider: /^netflix$/i,
    },
    {
        id: 'disney',
        name: 'Disney+',
        category: /\bdisney\b/i,
        provider: /^disney\s*(?:\+|plus)$/i,
    },
    { id: 'hulu', name: 'Hulu', category: /\bhulu\b/i, provider: /^hulu$/i },
    {
        id: 'prime',
        name: 'Prime Video',
        category: /\b(?:amazon|prime\s*video|prime\s*\+|prime)\b/i,
        provider: /^amazon prime video$/i,
    },
    {
        id: 'max',
        name: 'Max',
        category: /\bhbo\b|\bmax originals?\b/i,
        provider: /^(?:hbo\s*)?max$/i,
    },
    {
        id: 'apple',
        name: 'Apple TV+',
        category: /\bapple\s*(?:tv\s*)?(?:\+|plus)|\bapple\s*tv\b/i,
        provider: /^apple tv(?:\s*\+|\s*plus)?$/i,
    },
    {
        id: 'paramount',
        name: 'Paramount+',
        category: /\bparamount\b/i,
        provider: /^paramount\s*(?:\+|plus)/i,
    },
    {
        id: 'peacock',
        name: 'Peacock',
        category: /\bpeacock\b/i,
        provider: /^peacock/i,
    },
    {
        id: 'discovery',
        name: 'Discovery+',
        category: /\bdiscovery\b/i,
        provider: /^discovery\s*(?:\+|plus)$/i,
    },
    {
        id: 'starz',
        name: 'Starz',
        category: /\bstarz\b/i,
        provider: /^starz$/i,
    },
    {
        id: 'showtime',
        name: 'Showtime',
        category: /\bshowtime\b/i,
        provider: /showtime/i,
    },
    {
        id: 'amc',
        name: 'AMC+',
        category: /\bamc\b/i,
        provider: /^amc\s*(?:\+|plus)$/i,
    },
    {
        id: 'bet',
        name: 'BET+',
        category: /\bbet\s*(?:\+|plus)/i,
        provider: /^bet\s*(?:\+|plus)$/i,
    },
    {
        id: 'crunchyroll',
        name: 'Crunchyroll',
        category: /\bcrunchyroll\b/i,
        provider: /^crunchyroll$/i,
    },
    { id: 'vix', name: 'ViX', category: /\bvix\b/i, provider: /^vix/i },
    {
        id: 'natgeo',
        name: 'National Geographic',
        category: /\bnat(?:ional)?\s*geo(?:graphic)?\b/i,
        provider: null,
    },
];

/** A film or series category, with the ids content rows and routes use. */
export interface NetworkCategory {
    readonly playlistId: string;
    readonly playlistName: string;
    readonly type: 'movie' | 'series';
    readonly name: string;
    /** What content rows carry in `category_id` (database id on desktop). */
    readonly matchId: string;
    /** The provider category id (route parameter). */
    readonly xtreamId: number;
}

export interface DashboardNetwork {
    readonly id: string;
    readonly name: string;
    readonly logoUrl: string | null;
    readonly categories: readonly NetworkCategory[];
}

/** The network a category name belongs to (first in the list wins). */
export function networkOfCategory(
    name: string
): DashboardNetworkDefinition | null {
    if (isCategoryOutsideCountries(name)) return null;
    return (
        DASHBOARD_NETWORKS.find((network) => network.category.test(name)) ??
        null
    );
}

/**
 * The networks a set of categories covers, in the fixed network order, each
 * with its categories (films first). Networks without a category are left out.
 */
export function groupNetworks(
    categories: readonly NetworkCategory[],
    logos: ReadonlyMap<string, string> = new Map()
): DashboardNetwork[] {
    const grouped = new Map<string, NetworkCategory[]>();
    for (const category of categories) {
        const network = networkOfCategory(category.name);
        if (!network) continue;
        const list = grouped.get(network.id) ?? [];
        list.push(category);
        grouped.set(network.id, list);
    }
    const networks: DashboardNetwork[] = [];
    for (const definition of DASHBOARD_NETWORKS) {
        const list = grouped.get(definition.id);
        if (!list) continue;
        networks.push({
            id: definition.id,
            name: definition.name,
            logoUrl: logos.get(definition.id) ?? null,
            categories: [...list].sort(
                (a, b) =>
                    Number(a.type === 'series') - Number(b.type === 'series')
            ),
        });
    }
    return networks;
}

/** Logo paths per network id from TMDB's provider list. */
export function matchNetworkLogos(
    providers: readonly { provider_name: string; logo_path: string | null }[],
    logoUrl: (path: string) => string | null
): Map<string, string> {
    const logos = new Map<string, string>();
    for (const definition of DASHBOARD_NETWORKS) {
        if (!definition.provider) continue;
        const pattern = definition.provider;
        const match = providers.find(
            (provider) =>
                !!provider.logo_path &&
                pattern.test(provider.provider_name.trim())
        );
        const url = match?.logo_path ? logoUrl(match.logo_path) : null;
        if (url) logos.set(definition.id, url);
    }
    return logos;
}

import {
    groupNetworks,
    matchNetworkLogos,
    networkOfCategory,
    type NetworkCategory,
} from './dashboard-networks.util';

const category = (
    name: string,
    type: 'movie' | 'series' = 'movie',
    id = 1
): NetworkCategory => ({
    playlistId: 'pl',
    playlistName: 'Provider',
    type,
    name,
    matchId: String(id),
    xtreamId: id,
});

describe('dashboard networks', () => {
    it.each([
        ['NETFLIX MOVIES', 'netflix'],
        ['4K NETFLIX MOVIES', 'netflix'],
        ['|EN| DISNEY+', 'disney'],
        ['DISNEY+ KIDS', 'disney'],
        ['APPLE+ MOVIES', 'apple'],
        ['|EN| PRIME+', 'prime'],
        ['EN | HBO Series', 'max'],
        ['Hulu Originals', 'hulu'],
        ['|EN| DRAMA', null],
        ['|NL| NETFLIX', null],
    ])('files %p under %p', (name, id) => {
        expect(networkOfCategory(name)?.id ?? null).toBe(id);
    });

    it('groups categories by network, in network order, films first', () => {
        const networks = groupNetworks([
            category('NETFLIX SERIES', 'series', 3),
            category('|EN| DISNEY+', 'movie', 4),
            category('NETFLIX MOVIES', 'movie', 2),
            category('|EN| DRAMA', 'movie', 5),
        ]);
        expect(networks.map((network) => network.id)).toEqual([
            'netflix',
            'disney',
        ]);
        expect(networks[0].categories.map((c) => c.name)).toEqual([
            'NETFLIX MOVIES',
            'NETFLIX SERIES',
        ]);
        expect(networks[0].logoUrl).toBeNull();
    });

    it('takes logos from matching TMDB providers', () => {
        const logos = matchNetworkLogos(
            [
                { provider_name: 'Netflix', logo_path: '/n.jpg' },
                { provider_name: 'Disney Plus', logo_path: '/d.jpg' },
                { provider_name: 'Amazon Prime Video', logo_path: null },
            ],
            (path) => `https://img.example${path}`
        );
        expect(Object.fromEntries(logos)).toEqual({
            netflix: 'https://img.example/n.jpg',
            disney: 'https://img.example/d.jpg',
        });
    });
});

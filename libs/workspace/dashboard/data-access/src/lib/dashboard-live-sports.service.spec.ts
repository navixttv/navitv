import { TestBed } from '@angular/core/testing';
import {
    DatabaseService,
    RuntimeCapabilitiesService,
} from '@iptvnator/services';
import { DashboardLiveSportsService } from './dashboard-live-sports.service';

describe('DashboardLiveSportsService', () => {
    const db = {
        getXtreamCategories: jest.fn(),
        getXtreamContent: jest.fn(),
    };

    function setup(supportsSqlite = true) {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
            providers: [
                { provide: DatabaseService, useValue: db },
                {
                    provide: RuntimeCapabilitiesService,
                    useValue: {
                        supportsXtreamSqliteDataSource: supportsSqlite,
                    },
                },
            ],
        });
        return TestBed.inject(DashboardLiveSportsService);
    }

    beforeEach(() => {
        jest.resetAllMocks();
        db.getXtreamCategories.mockResolvedValue([
            { id: 1, name: 'US | Sports', xtream_id: 101, hidden: false },
            { id: 2, name: 'US | News', xtream_id: 102, hidden: false },
        ]);
        db.getXtreamContent.mockResolvedValue([
            { id: 10, category_id: 1, title: 'Sports 1', xtream_id: 501 },
            { id: 11, category_id: 2, title: 'News 24', xtream_id: 502 },
        ]);
    });

    it('loads sports channels of Xtream playlists only', async () => {
        const service = setup();

        await service.load([
            {
                _id: 'xt',
                title: 'Provider',
                serverUrl: 'https://xt.example.test',
            },
            { _id: 'm3u', title: 'Local list' },
        ]);

        expect(db.getXtreamCategories).toHaveBeenCalledTimes(1);
        expect(db.getXtreamCategories).toHaveBeenCalledWith('xt', 'live');
        expect(service.items().map((item) => item.title)).toEqual(['Sports 1']);
        expect(service.items()[0]).toMatchObject({
            playlist_id: 'xt',
            category_id: 101,
            xtream_id: 501,
            source: 'xtream',
        });
    });

    it('skips the live list when no visible sports category exists', async () => {
        db.getXtreamCategories.mockResolvedValue([
            { id: 2, name: 'US | News', xtream_id: 102, hidden: false },
            { id: 3, name: 'FR | Sport', xtream_id: 103, hidden: true },
        ]);
        const service = setup();

        await service.load([
            { _id: 'xt', serverUrl: 'https://xt.example.test' },
        ]);

        expect(db.getXtreamContent).not.toHaveBeenCalled();
        expect(service.items()).toEqual([]);
    });

    it('reloads only when the Xtream playlists change or after invalidate', async () => {
        const service = setup();
        const playlists = [{ _id: 'xt', serverUrl: 'https://xt.example.test' }];

        await service.load(playlists);
        await service.load(playlists);
        expect(db.getXtreamCategories).toHaveBeenCalledTimes(1);

        service.invalidate();
        await service.load(playlists);
        expect(db.getXtreamCategories).toHaveBeenCalledTimes(2);
    });

    it('stays empty without the local SQLite catalog', async () => {
        const service = setup(false);

        await service.load([
            { _id: 'xt', serverUrl: 'https://xt.example.test' },
        ]);

        expect(db.getXtreamCategories).not.toHaveBeenCalled();
        expect(service.items()).toEqual([]);
    });

    it('keeps other playlists when one catalog read fails', async () => {
        db.getXtreamCategories
            .mockRejectedValueOnce(new Error('worker busy'))
            .mockResolvedValueOnce([
                { id: 1, name: 'Sports', xtream_id: 101, hidden: false },
            ]);
        jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        const service = setup();

        await service.load([
            { _id: 'a', serverUrl: 'https://a.example.test' },
            { _id: 'b', serverUrl: 'https://b.example.test' },
        ]);

        expect(service.items().map((item) => item.playlist_id)).toEqual(['b']);
    });
});

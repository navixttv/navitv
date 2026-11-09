import { TestBed } from '@angular/core/testing';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { PlaylistActions } from '@iptvnator/m3u-state';
import { DataService } from '@iptvnator/services';
import { LazySnackBar } from '@iptvnator/services/lazy-snack-bar';
import {
    parseRemoteSource,
    REMOTE_SOURCE_EVENT,
    RemoteSourceIntakeService,
} from './remote-source-intake.service';

describe('parseRemoteSource', () => {
    it('accepts an Xtream login and trims it', () => {
        expect(
            parseRemoteSource({
                type: 'xtream',
                title: ' Home ',
                serverUrl: ' http://provider.example:8080 ',
                username: 'user',
                password: 'pass',
            })
        ).toEqual({
            type: 'xtream',
            title: 'Home',
            serverUrl: 'http://provider.example:8080',
            username: 'user',
            password: 'pass',
        });
    });

    it('accepts an http(s) M3U link only', () => {
        expect(
            parseRemoteSource({
                type: 'm3u',
                url: 'https://lists.example/a.m3u',
            })
        ).toEqual({ type: 'm3u', url: 'https://lists.example/a.m3u' });
        expect(
            parseRemoteSource({ type: 'm3u', url: 'file:///etc/passwd' })
        ).toBeNull();
    });

    it.each([
        null,
        'xtream',
        { type: 'xtream', serverUrl: 'http://x.example', username: 'u' },
        { type: 'stalker', url: 'http://x.example' },
    ])('rejects %p', (detail) => {
        expect(parseRemoteSource(detail)).toBeNull();
    });
});

describe('RemoteSourceIntakeService', () => {
    const store = { dispatch: jest.fn() };
    const data = { fetchPlaylistDefinition: jest.fn() };
    const snackBar = { open: jest.fn().mockResolvedValue(null) };

    function setup(): RemoteSourceIntakeService {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
            providers: [
                { provide: Store, useValue: store },
                { provide: DataService, useValue: data },
                { provide: LazySnackBar, useValue: snackBar },
                {
                    provide: TranslateService,
                    useValue: {
                        instant: (key: string, params?: { title?: string }) =>
                            `${key}:${params?.title ?? ''}`,
                    },
                },
            ],
        });
        return TestBed.inject(RemoteSourceIntakeService);
    }

    beforeEach(() => jest.clearAllMocks());

    it('adds an Xtream source sent from a phone like the Xtream form', () => {
        setup().start();

        window.dispatchEvent(
            new CustomEvent(REMOTE_SOURCE_EVENT, {
                detail: {
                    type: 'xtream',
                    serverUrl: 'http://provider.example:8080/',
                    username: 'user',
                    password: 'pass',
                },
            })
        );

        expect(store.dispatch).toHaveBeenCalledTimes(1);
        const action = store.dispatch.mock.calls[0][0];
        expect(action.type).toBe(PlaylistActions.addPlaylist.type);
        expect(action.playlist).toMatchObject({
            title: 'provider.example',
            username: 'user',
            password: 'pass',
            xtreamContentTypes: ['movie', 'live', 'series'],
        });
        expect(action.playlist.serverUrl).toMatch(
            /^http:\/\/provider\.example:8080/
        );
        expect(snackBar.open).toHaveBeenCalledWith(
            'HOME.ADD_FROM_PHONE.ADDED:provider.example',
            undefined,
            { duration: 4000 }
        );
    });

    it('downloads an M3U link and adds it with the given name', async () => {
        data.fetchPlaylistDefinition.mockResolvedValue({
            _id: 'p1',
            title: 'list.m3u',
            filename: 'list.m3u',
        });

        await setup().add({
            type: 'm3u',
            title: 'Family list',
            url: 'https://lists.example/list.m3u',
        });

        expect(data.fetchPlaylistDefinition).toHaveBeenCalledWith(
            'https://lists.example/list.m3u'
        );
        const action = store.dispatch.mock.calls[0][0];
        expect(action.type).toBe(
            PlaylistActions.handleAddingPlaylistByUrl.type
        );
        expect(action.playlist).toMatchObject({
            title: 'Family list',
            filename: 'Family list',
        });
    });

    it('reports a failed download instead of throwing', async () => {
        data.fetchPlaylistDefinition.mockRejectedValue(new Error('offline'));
        jest.spyOn(console, 'warn').mockImplementation(() => undefined);

        await setup().add({ type: 'm3u', url: 'https://lists.example/x.m3u' });

        expect(store.dispatch).not.toHaveBeenCalled();
        expect(snackBar.open).toHaveBeenCalledWith(
            'HOME.ADD_FROM_PHONE.FAILED:',
            undefined,
            { duration: 4000 }
        );
    });
});

import { Injectable, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { PlaylistActions } from '@iptvnator/m3u-state';
import { DataService } from '@iptvnator/services';
import { LazySnackBar } from '@iptvnator/services/lazy-snack-bar';
import {
    createRandomId,
    normalizeXtreamServerUrl,
    Playlist,
    XTREAM_CONTENT_TYPES,
} from '@iptvnator/shared/interfaces';

/** The event the TV layer fires with a source sent from a phone. */
export const REMOTE_SOURCE_EVENT = 'navitv:add-source';

export type RemoteSource =
    | {
          readonly type: 'xtream';
          readonly title?: string;
          readonly serverUrl: string;
          readonly username: string;
          readonly password: string;
      }
    | {
          readonly type: 'm3u';
          readonly title?: string;
          readonly url: string;
      };

/** Reads a remote source from an untrusted event payload; null when invalid. */
export function parseRemoteSource(detail: unknown): RemoteSource | null {
    if (!detail || typeof detail !== 'object') return null;
    const raw = detail as Record<string, unknown>;
    const text = (key: string, max = 2048): string => {
        const value = raw[key];
        return typeof value === 'string' ? value.trim().slice(0, max) : '';
    };
    const title = text('title', 200) || undefined;
    if (raw['type'] === 'xtream') {
        const serverUrl = text('serverUrl');
        const username = text('username', 512);
        const password = text('password', 512);
        if (!serverUrl || !username || !password) return null;
        return { type: 'xtream', title, serverUrl, username, password };
    }
    if (raw['type'] === 'm3u') {
        const url = text('url');
        if (!/^https?:\/\//i.test(url)) return null;
        return { type: 'm3u', title, url };
    }
    return null;
}

/**
 * NaviTV "Add from phone": the TV app receives a source from a phone on the
 * same Wi-Fi and fires {@link REMOTE_SOURCE_EVENT}; this adds it exactly like
 * the Xtream / M3U URL forms of the Add source dialog would.
 */
@Injectable({ providedIn: 'root' })
export class RemoteSourceIntakeService {
    private readonly store = inject(Store);
    private readonly data = inject(DataService);
    private readonly snackBar = inject(LazySnackBar);
    private readonly translate = inject(TranslateService);
    private started = false;

    start(): void {
        if (this.started || typeof window === 'undefined') return;
        this.started = true;
        window.addEventListener(REMOTE_SOURCE_EVENT, (event) => {
            const source = parseRemoteSource((event as CustomEvent).detail);
            if (source) void this.add(source);
        });
    }

    async add(source: RemoteSource): Promise<void> {
        try {
            if (source.type === 'xtream') {
                const serverUrl = normalizeXtreamServerUrl(source.serverUrl);
                const title =
                    source.title || this.hostOf(serverUrl) || 'Xtream';
                this.store.dispatch(
                    PlaylistActions.addPlaylist({
                        playlist: {
                            _id: createRandomId(),
                            title,
                            serverUrl,
                            username: source.username,
                            password: source.password,
                            importDate: new Date().toISOString(),
                            xtreamContentTypes: [...XTREAM_CONTENT_TYPES],
                        } as Playlist,
                    })
                );
                this.notify('HOME.ADD_FROM_PHONE.ADDED', title);
                return;
            }
            const fetched = await this.data.fetchPlaylistDefinition(source.url);
            const title = source.title;
            this.store.dispatch(
                PlaylistActions.handleAddingPlaylistByUrl({
                    isTemporary: false,
                    playlist: title
                        ? { ...fetched, title, filename: title }
                        : fetched,
                })
            );
            this.notify(
                'HOME.ADD_FROM_PHONE.ADDED',
                title || fetched.title || fetched.filename || 'M3U'
            );
        } catch (error) {
            console.warn(
                '[RemoteSourceIntake] Could not add the source',
                error
            );
            this.notify('HOME.ADD_FROM_PHONE.FAILED', '');
        }
    }

    private hostOf(url: string): string {
        try {
            return new URL(url).hostname;
        } catch {
            return '';
        }
    }

    private notify(key: string, title: string): void {
        void this.snackBar.open(
            this.translate.instant(key, { title }),
            undefined,
            { duration: 4000 }
        );
    }
}

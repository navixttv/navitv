import { Injectable, signal } from '@angular/core';
import {
    TASTE_GENRES,
    TASTE_LIVE,
    type DashboardTaste,
    type TasteGenre,
    type TasteLive,
} from './dashboard-taste.util';

const STORAGE_KEY = 'navitv.dashboard.taste';

/**
 * What the viewer likes ("Make Home yours"), kept on this device. `null`
 * until the picker was answered; a skipped picker saves empty picks.
 */
@Injectable({ providedIn: 'root' })
export class DashboardTastePreferencesService {
    private readonly state = signal<DashboardTaste | null>(this.read());
    readonly taste = this.state.asReadonly();

    save(taste: DashboardTaste): void {
        const valid = DashboardTastePreferencesService.clean(taste);
        this.state.set(valid);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
        } catch {
            // Storage unavailable (private mode): the picks last this session.
        }
    }

    private read(): DashboardTaste | null {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw === null) return null;
            const parsed: unknown = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return null;
            return DashboardTastePreferencesService.clean(
                parsed as Partial<DashboardTaste>
            );
        } catch {
            return null;
        }
    }

    private static clean(taste: Partial<DashboardTaste>): DashboardTaste {
        const genres = Array.isArray(taste.genres) ? taste.genres : [];
        const live = Array.isArray(taste.live) ? taste.live : [];
        return {
            genres: TASTE_GENRES.filter((genre: TasteGenre) =>
                genres.includes(genre)
            ),
            live: TASTE_LIVE.filter((pick: TasteLive) => live.includes(pick)),
        };
    }
}

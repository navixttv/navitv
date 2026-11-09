import { Injectable, signal } from '@angular/core';
import {
    DASHBOARD_SPORTS,
    type DashboardSport,
} from './dashboard-upcoming-games.util';

const STORAGE_KEY = 'navitv.dashboard.sports';

/**
 * The sports a viewer wants on Home, kept on this device (each TV or computer
 * has its own). `null` until the viewer has answered the picker; an empty
 * list means "all sports".
 */
@Injectable({ providedIn: 'root' })
export class DashboardSportsPreferencesService {
    private readonly state = signal<DashboardSport[] | null>(this.read());

    /** Chosen sports; `null` = not asked yet, `[]` = all sports. */
    readonly sports = this.state.asReadonly();

    save(sports: readonly DashboardSport[]): void {
        const valid = DASHBOARD_SPORTS.filter((sport) =>
            sports.includes(sport)
        );
        this.state.set(valid);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
        } catch {
            // Storage unavailable (private mode): the choice lasts this session.
        }
    }

    /** Ask again (the "Choose sports" button). */
    reset(): void {
        this.state.set(null);
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch {
            // ignore
        }
    }

    private read(): DashboardSport[] | null {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw === null) return null;
            const parsed: unknown = JSON.parse(raw);
            if (!Array.isArray(parsed)) return null;
            return DASHBOARD_SPORTS.filter((sport) => parsed.includes(sport));
        } catch {
            return null;
        }
    }
}

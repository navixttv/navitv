import {
    ChangeDetectionStrategy,
    Component,
    input,
    output,
    signal,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import {
    TASTE_GENRES,
    TASTE_LIVE,
    type DashboardTaste,
    type TasteGenre,
    type TasteLive,
} from '@iptvnator/workspace/dashboard/data-access';

/**
 * NaviTV "Make Home yours": shows & movies and Live TV picks. Plain toggle
 * buttons so a TV remote reaches every choice with the arrow keys.
 */
@Component({
    selector: 'lib-dashboard-taste-picker',
    imports: [TranslatePipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <section
            class="taste-picker"
            data-test-id="dashboard-taste-picker"
            [attr.aria-label]="'WORKSPACE.DASHBOARD.TASTE.TITLE' | translate"
        >
            <h2 class="taste-picker__title">
                {{ 'WORKSPACE.DASHBOARD.TASTE.TITLE' | translate }}
            </h2>
            <p class="taste-picker__hint">
                {{ 'WORKSPACE.DASHBOARD.TASTE.HINT' | translate }}
            </p>
            <h3 class="taste-picker__group">
                {{ 'WORKSPACE.DASHBOARD.TASTE.SHOWS' | translate }}
            </h3>
            <div class="taste-picker__choices" role="group">
                @for (genre of genres; track genre) {
                    <button
                        type="button"
                        class="taste-picker__choice"
                        [class.taste-picker__choice--on]="hasGenre(genre)"
                        [attr.aria-pressed]="hasGenre(genre)"
                        [attr.data-test-id]="'taste-genre-' + genre"
                        (click)="toggleGenre(genre)"
                    >
                        {{
                            'WORKSPACE.DASHBOARD.TASTE.GENRES.' +
                                genre.toUpperCase() | translate
                        }}
                    </button>
                }
            </div>
            <h3 class="taste-picker__group">
                {{ 'WORKSPACE.DASHBOARD.TASTE.LIVE' | translate }}
            </h3>
            <div class="taste-picker__choices" role="group">
                @for (pick of livePicks; track pick) {
                    <button
                        type="button"
                        class="taste-picker__choice"
                        [class.taste-picker__choice--on]="hasLive(pick)"
                        [attr.aria-pressed]="hasLive(pick)"
                        [attr.data-test-id]="'taste-live-' + pick"
                        (click)="toggleLive(pick)"
                    >
                        {{
                            'WORKSPACE.DASHBOARD.TASTE.LIVE_TYPES.' +
                                pick.toUpperCase() | translate
                        }}
                    </button>
                }
            </div>
            <div class="taste-picker__actions">
                <button
                    type="button"
                    class="taste-picker__save"
                    data-test-id="taste-picker-save"
                    [disabled]="!hasAny()"
                    (click)="saved.emit(current())"
                >
                    {{ 'WORKSPACE.DASHBOARD.TASTE.SAVE' | translate }}
                </button>
                <button
                    type="button"
                    data-test-id="taste-picker-skip"
                    (click)="saved.emit({ genres: [], live: [] })"
                >
                    {{ 'WORKSPACE.DASHBOARD.TASTE.SKIP' | translate }}
                </button>
            </div>
        </section>
    `,
    styles: `
        :host {
            display: block;
            padding: 0 var(--rails-gutter, 24px);
        }
        .taste-picker {
            border-radius: 16px;
            padding: 20px 24px;
            background: var(--mat-sys-surface-container, transparent);
            color: var(--mat-sys-on-surface, inherit);
        }
        .taste-picker__title {
            margin: 0 0 4px;
            font-size: 1.15rem;
            font-weight: 600;
        }
        .taste-picker__hint {
            margin: 0 0 8px;
            opacity: 0.75;
        }
        .taste-picker__group {
            margin: 16px 0 8px;
            font-size: 0.95rem;
            font-weight: 600;
        }
        .taste-picker__choices,
        .taste-picker__actions {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
        }
        .taste-picker__actions {
            margin-top: 18px;
        }
        button {
            font: inherit;
            cursor: pointer;
            border-radius: 999px;
            padding: 8px 18px;
            border: 1px solid var(--mat-sys-outline-variant, currentColor);
            background: transparent;
            color: inherit;
        }
        button:focus-visible {
            outline: 3px solid var(--app-focus-ring);
            outline-offset: 2px;
        }
        .taste-picker__choice--on,
        .taste-picker__save {
            background: var(--mat-sys-primary, currentColor);
            border-color: var(--mat-sys-primary, currentColor);
            color: var(--mat-sys-on-primary, inherit);
        }
        .taste-picker__save:disabled {
            opacity: 0.5;
            cursor: default;
        }
    `,
})
export class DashboardTastePickerComponent {
    /** Starts from the viewer's previous picks when editing. */
    readonly initial = input<DashboardTaste | null>(null);
    readonly saved = output<DashboardTaste>();

    readonly genres = TASTE_GENRES;
    readonly livePicks = TASTE_LIVE;
    private readonly edited = signal<DashboardTaste | null>(null);

    current(): DashboardTaste {
        return this.edited() ?? this.initial() ?? { genres: [], live: [] };
    }

    hasAny(): boolean {
        const taste = this.current();
        return taste.genres.length > 0 || taste.live.length > 0;
    }

    hasGenre(genre: TasteGenre): boolean {
        return this.current().genres.includes(genre);
    }

    hasLive(pick: TasteLive): boolean {
        return this.current().live.includes(pick);
    }

    toggleGenre(genre: TasteGenre): void {
        const taste = this.current();
        const genres = taste.genres.includes(genre)
            ? taste.genres.filter((value) => value !== genre)
            : TASTE_GENRES.filter(
                  (value) => value === genre || taste.genres.includes(value)
              );
        this.edited.set({ ...taste, genres });
    }

    toggleLive(pick: TasteLive): void {
        const taste = this.current();
        const live = taste.live.includes(pick)
            ? taste.live.filter((value) => value !== pick)
            : TASTE_LIVE.filter(
                  (value) => value === pick || taste.live.includes(value)
              );
        this.edited.set({ ...taste, live });
    }
}

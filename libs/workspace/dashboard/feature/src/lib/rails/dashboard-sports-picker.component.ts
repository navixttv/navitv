import {
    ChangeDetectionStrategy,
    Component,
    input,
    output,
    signal,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import {
    DASHBOARD_SPORTS,
    type DashboardSport,
} from '@iptvnator/workspace/dashboard/data-access';

/**
 * NaviTV "Which sports do you want on Home?" card. Plain toggle buttons so a
 * TV remote can reach every choice with the arrow keys.
 */
@Component({
    selector: 'lib-dashboard-sports-picker',
    imports: [TranslatePipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <section
            class="sports-picker"
            data-test-id="dashboard-sports-picker"
            [attr.aria-label]="
                'WORKSPACE.DASHBOARD.SPORTS_PICKER.TITLE' | translate
            "
        >
            <h2 class="sports-picker__title">
                {{ 'WORKSPACE.DASHBOARD.SPORTS_PICKER.TITLE' | translate }}
            </h2>
            <p class="sports-picker__hint">
                {{ 'WORKSPACE.DASHBOARD.SPORTS_PICKER.HINT' | translate }}
            </p>
            <div class="sports-picker__choices" role="group">
                @for (sport of sports; track sport) {
                    <button
                        type="button"
                        class="sports-picker__choice"
                        [class.sports-picker__choice--on]="isOn(sport)"
                        [attr.aria-pressed]="isOn(sport)"
                        [attr.data-test-id]="'sports-picker-' + sport"
                        (click)="toggle(sport)"
                    >
                        {{
                            'WORKSPACE.DASHBOARD.SPORTS.' + sport.toUpperCase()
                                | translate
                        }}
                    </button>
                }
            </div>
            <div class="sports-picker__actions">
                <button
                    type="button"
                    class="sports-picker__save"
                    data-test-id="sports-picker-save"
                    [disabled]="selected().length === 0"
                    (click)="saved.emit(selected())"
                >
                    {{ 'WORKSPACE.DASHBOARD.SPORTS_PICKER.SAVE' | translate }}
                </button>
                <button
                    type="button"
                    class="sports-picker__all"
                    data-test-id="sports-picker-all"
                    (click)="saved.emit([])"
                >
                    {{ 'WORKSPACE.DASHBOARD.SPORTS_PICKER.ALL' | translate }}
                </button>
            </div>
        </section>
    `,
    styles: `
        :host {
            display: block;
            padding: 0 var(--rails-gutter, 24px);
        }
        .sports-picker {
            border-radius: 16px;
            padding: 20px 24px;
            background: var(
                --mat-sys-surface-container,
                rgba(255, 255, 255, 0.06)
            );
            color: var(--mat-sys-on-surface, inherit);
        }
        .sports-picker__title {
            margin: 0 0 4px;
            font-size: 1.15rem;
            font-weight: 600;
        }
        .sports-picker__hint {
            margin: 0 0 16px;
            opacity: 0.75;
        }
        .sports-picker__choices,
        .sports-picker__actions {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
        }
        .sports-picker__actions {
            margin-top: 16px;
        }
        button {
            font: inherit;
            cursor: pointer;
            border-radius: 999px;
            padding: 8px 18px;
            border: 1px solid
                var(--mat-sys-outline-variant, rgba(255, 255, 255, 0.24));
            background: transparent;
            color: inherit;
        }
        button:focus-visible {
            outline: 3px solid var(--mat-sys-primary, #f5a623);
            outline-offset: 2px;
        }
        .sports-picker__choice--on,
        .sports-picker__save {
            background: var(--mat-sys-primary, #f5a623);
            border-color: var(--mat-sys-primary, #f5a623);
            color: var(--mat-sys-on-primary, #14151b);
        }
        .sports-picker__save:disabled {
            opacity: 0.5;
            cursor: default;
        }
    `,
})
export class DashboardSportsPickerComponent {
    /** Starts from the viewer's previous choice when editing. */
    readonly initial = input<readonly DashboardSport[] | null>(null);
    /** The chosen sports; `[]` = all sports. */
    readonly saved = output<DashboardSport[]>();

    readonly sports = DASHBOARD_SPORTS;
    private readonly picked = signal<Set<DashboardSport> | null>(null);

    readonly selected = (): DashboardSport[] =>
        DASHBOARD_SPORTS.filter((sport) => this.current().has(sport));

    isOn(sport: DashboardSport): boolean {
        return this.current().has(sport);
    }

    toggle(sport: DashboardSport): void {
        const next = new Set(this.current());
        if (next.has(sport)) next.delete(sport);
        else next.add(sport);
        this.picked.set(next);
    }

    private current(): Set<DashboardSport> {
        return this.picked() ?? new Set(this.initial() ?? []);
    }
}

import {
    ChangeDetectionStrategy,
    Component,
    computed,
    effect,
    inject,
    signal,
    untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { map } from 'rxjs';
import {
    DashboardDataService,
    DashboardNetworksService,
    type NetworkRow,
} from '@iptvnator/workspace/dashboard/data-access';
import {
    DashboardRailComponent,
    type DashboardRailCard,
} from '../rails/dashboard-rail.component';

interface NetworkRowView {
    readonly key: string;
    readonly label: string;
    readonly cards: DashboardRailCard[];
    readonly total: number;
    readonly seeAll: string[];
}

/**
 * NaviTV network page ("/workspace/networks/:networkId"): every film and
 * series category the provider files under one streaming service, as rows
 * of posters (newest first) with "See all" into the category itself.
 */
@Component({
    selector: 'lib-dashboard-network-page',
    imports: [DashboardRailComponent, MatIcon, RouterLink, TranslatePipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="network-page" data-test-id="network-page">
            <header class="network-page__header">
                <a
                    class="network-page__back"
                    [routerLink]="['/workspace/dashboard']"
                    [attr.aria-label]="
                        'WORKSPACE.DASHBOARD.NETWORKS.BACK' | translate
                    "
                >
                    <mat-icon aria-hidden="true">arrow_back</mat-icon>
                </a>
                @if (network()?.logoUrl; as logo) {
                    <img
                        class="network-page__logo"
                        [src]="logo"
                        [alt]="network()?.name"
                    />
                }
                <h1 class="network-page__title">{{ network()?.name }}</h1>
            </header>
            @if (loading()) {
                <p class="network-page__status">
                    {{ 'WORKSPACE.DASHBOARD.NETWORKS.LOADING' | translate }}
                </p>
            } @else if (rows().length === 0) {
                <p class="network-page__status">
                    {{ 'WORKSPACE.DASHBOARD.NETWORKS.EMPTY' | translate }}
                </p>
            }
            @for (row of rows(); track row.key) {
                <lib-dashboard-rail
                    [label]="row.label"
                    [items]="row.cards"
                    [totalCount]="row.total"
                    [seeAllLink]="row.seeAll"
                    [testId]="'network-row-' + row.key"
                />
            }
        </div>
    `,
    styles: `
        :host {
            display: block;
            height: 100%;
            overflow-y: auto;
        }
        .network-page {
            padding: 16px 0 32px;
            display: flex;
            flex-direction: column;
            gap: 20px;
        }
        .network-page__header {
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 0 var(--rails-gutter, 24px);
        }
        .network-page__back {
            display: grid;
            place-items: center;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            color: inherit;
        }
        .network-page__back:focus-visible {
            outline: 3px solid var(--app-focus-ring);
            outline-offset: 2px;
        }
        .network-page__logo {
            width: 56px;
            height: 56px;
            border-radius: 12px;
            object-fit: cover;
        }
        .network-page__title {
            margin: 0;
            font-size: 1.6rem;
            font-weight: 700;
        }
        .network-page__status {
            padding: 0 var(--rails-gutter, 24px);
            opacity: 0.75;
        }
    `,
})
export class DashboardNetworkPageComponent {
    private readonly route = inject(ActivatedRoute);
    private readonly networks = inject(DashboardNetworksService);
    private readonly data = inject(DashboardDataService);

    private readonly networkId = toSignal(
        this.route.paramMap.pipe(
            map((params) => params.get('networkId') ?? '')
        ),
        { initialValue: '' }
    );
    readonly network = computed(() => {
        const id = this.networkId();
        return (
            this.networks.networks().find((network) => network.id === id) ??
            null
        );
    });
    readonly loading = signal(true);
    private readonly rowsState = signal<NetworkRow[]>([]);
    readonly rows = computed<NetworkRowView[]>(() =>
        this.rowsState().map((row) => {
            const section = row.category.type === 'movie' ? 'vod' : 'series';
            const base = [
                '/workspace/xtreams',
                row.category.playlistId,
                section,
                String(row.category.xtreamId),
            ];
            return {
                key: `${row.category.playlistId}-${row.category.type}-${row.category.xtreamId}`,
                label: row.category.name,
                total: row.total,
                seeAll: base,
                cards: row.items.map((item) => ({
                    id: `network-${row.category.type}-${item.xtreamId}`,
                    title: item.title,
                    imageUrl: item.posterUrl ?? undefined,
                    icon:
                        row.category.type === 'movie'
                            ? 'movie'
                            : 'video_library',
                    contentType: row.category.type,
                    link: [...base, String(item.xtreamId)],
                })),
            };
        })
    );

    constructor() {
        // Opened directly (not from Home): find the networks first.
        effect(() => {
            if (!this.data.playlistsLoaded()) return;
            const playlists = this.data.playlists();
            untracked(() => void this.networks.load(playlists));
        });
        let generation = 0;
        effect(() => {
            const network = this.network();
            const known = this.networks.networks().length > 0;
            const current = ++generation;
            untracked(() => {
                if (!network) {
                    // The provider has no categories for this network.
                    if (known) {
                        this.rowsState.set([]);
                        this.loading.set(false);
                    }
                    return;
                }
                this.loading.set(true);
                void this.networks
                    .rows(network)
                    .catch(() => [] as NetworkRow[])
                    .then((rows) => {
                        if (current !== generation) return;
                        this.rowsState.set(rows);
                        this.loading.set(false);
                    });
            });
        });
    }
}

import type { EpgItem } from '@iptvnator/shared/interfaces';
import { isGameTitle } from './dashboard-live-sports.util';

/**
 * NaviTV "Upcoming games": games found in the guide of the sports channels
 * the "Live sports" rail draws from, live ones first, then by start time.
 */

/** Sports a viewer can ask for on Home. */
export const DASHBOARD_SPORTS = [
    'football',
    'basketball',
    'fights',
    'soccer',
    'baseball',
    'hockey',
] as const;
export type DashboardSport = (typeof DASHBOARD_SPORTS)[number];

const SPORT_PATTERNS: ReadonlyArray<readonly [DashboardSport, RegExp]> = [
    [
        'fights',
        /\b(?:ufc|boxing|bellator|pfl|mma|wwe|aew|smackdown|wrestling|fight night|fights?|lucha libre)\b/i,
    ],
    [
        'basketball',
        /\b(?:nba|wnba|ncaab|basketball|baloncesto|march madness|g league)\b/i,
    ],
    [
        'football',
        /\b(?:nfl|ncaaf|college football|football americano|american football|super bowl|sunday night football|monday night football|thursday night football|redzone|red zone|cfl|xfl|ufl)\b/i,
    ],
    [
        'soccer',
        /\b(?:soccer|futbol|fútbol|mls|liga mx|la liga|laliga|premier league|epl|serie a|bundesliga|ligue 1|champions league|uefa|fifa|copa|concacaf|world cup)\b/i,
    ],
    ['baseball', /\b(?:mlb|baseball|béisbol|beisbol|world series)\b/i],
    ['hockey', /\b(?:nhl|hockey|stanley cup)\b/i],
];

/** US channels that carry football: the plain "Football" word there is NFL / college. */
const US_FOOTBALL_CONTEXT =
    /\b(?:us|usa|espn|fox|nbc|cbs|abc|nfl|sec|big ten|acc|pac)\b/i;

/** The sport a programme is about, from its title, description and channel. */
export function detectSport(
    title: string,
    description = '',
    channel = ''
): DashboardSport | null {
    const text = `${title} ${description}`;
    for (const [sport, pattern] of SPORT_PATTERNS) {
        if (pattern.test(text)) return sport;
    }
    if (/\bfootball\b/i.test(text)) {
        return US_FOOTBALL_CONTEXT.test(`${text} ${channel}`)
            ? 'football'
            : 'soccer';
    }
    for (const [sport, pattern] of SPORT_PATTERNS) {
        if (pattern.test(channel)) return sport;
    }
    return null;
}

/** Studio, news and replay shows: about sport, but not a game to tune in to. */
const STUDIO_SHOW =
    /\b(?:live|today|tonight|countdown|center|centre|highlights?|news|talk|show|insider|replay|classic|classics|pregame|pre-game|postgame|post-game|preview|recap|magazine|podcast|daily|weekly|access|inside|kickoff show|first take|get up|now)\b/i;
const EVENT_TITLE =
    /\b(?:ufc \d+|ufc fight night|boxing|bellator|pfl|wwe|aew|ppv|main card|main event|prelims)\b/i;
const REPLAY = /\b(?:replay|re-?air|encore|classic|rewind|archive)\b/i;

/** True when a guide entry reads like a game or fight to tune in to. */
export function isUpcomingGame(title: string, description = ''): boolean {
    const name = title.trim();
    if (!name || REPLAY.test(name)) return false;
    if (isGameTitle(name)) return true;
    if (EVENT_TITLE.test(name)) return true;
    // "NFL Football" with "Bears at Packers" in the description.
    return (
        !STUDIO_SHOW.test(name) &&
        detectSport(name) !== null &&
        isGameTitle(description)
    );
}

export interface UpcomingGameChannel<T> {
    /** The channel the game is on (what a click tunes to). */
    readonly channel: T;
    readonly channelName: string;
    readonly programs: readonly EpgItem[];
}

export interface UpcomingGame<T> {
    /** Stable key: one game shown once even when several channels carry it. */
    readonly key: string;
    readonly title: string;
    readonly channel: T;
    readonly channelName: string;
    readonly startMs: number;
    readonly stopMs: number;
    readonly live: boolean;
    readonly sport: DashboardSport | null;
}

/** Programme time in ms: the unix-seconds field first, then the ISO string. */
export function epgItemTimeMs(
    timestamp: string | number | null | undefined,
    iso: string | null | undefined
): number | null {
    const seconds = Number(timestamp);
    if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
    const parsed = iso ? Date.parse(iso) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
}

const HOUR_MS = 3_600_000;
export const UPCOMING_GAMES_HORIZON_MS = 24 * HOUR_MS;
export const UPCOMING_GAMES_LIMIT = 20;

function gameKey(title: string, startMs: number): string {
    const normalized = title
        .toLowerCase()
        .replace(/\b(?:live|en vivo|hd|fhd|4k)\b/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
    // Channels round start times differently; a quarter hour is the same game.
    return `${normalized}@${Math.round(startMs / (15 * 60_000))}`;
}

/**
 * Games on now or starting within the horizon, one row per game: live first,
 * then by start time. With `sports` set, only those sports are kept.
 */
export function buildUpcomingGames<T>(
    channels: readonly UpcomingGameChannel<T>[],
    nowMs: number,
    sports: readonly DashboardSport[] | null = null,
    options: { horizonMs?: number; limit?: number } = {}
): UpcomingGame<T>[] {
    const horizonMs = options.horizonMs ?? UPCOMING_GAMES_HORIZON_MS;
    const limit = options.limit ?? UPCOMING_GAMES_LIMIT;
    const wanted = sports && sports.length > 0 ? new Set(sports) : null;
    const seen = new Set<string>();
    const games: UpcomingGame<T>[] = [];

    for (const entry of channels) {
        for (const program of entry.programs) {
            const title = (program.title ?? '').trim();
            const description = program.description ?? '';
            if (!isUpcomingGame(title, description)) continue;
            const startMs = epgItemTimeMs(
                program.start_timestamp,
                program.start
            );
            const stopMs = epgItemTimeMs(
                program.stop_timestamp,
                program.stop || program.end
            );
            if (startMs === null || stopMs === null || stopMs <= startMs)
                continue;
            if (stopMs <= nowMs || startMs > nowMs + horizonMs) continue;
            const sport = detectSport(title, description, entry.channelName);
            if (wanted && (sport === null || !wanted.has(sport))) continue;
            const key = gameKey(title, startMs);
            if (seen.has(key)) continue;
            seen.add(key);
            games.push({
                key,
                title,
                channel: entry.channel,
                channelName: entry.channelName,
                startMs,
                stopMs,
                live: startMs <= nowMs,
                sport,
            });
        }
    }

    return games
        .sort(
            (a, b) => Number(b.live) - Number(a.live) || a.startMs - b.startMs
        )
        .slice(0, limit);
}

/**
 * Which sports channels to read the guide of first: channels named after a
 * chosen sport, then the big US sports networks, then the rest in provider
 * order. Guide reads are one request per channel, so the head of this order
 * is what the row is built from.
 */
const MAJOR_NETWORKS =
    /\b(?:espn|espn2|espnu|fs1|fs2|fox|nbc|cbs|abc|tnt|tbs|trutv|nfl|nba|nhl|mlb|big ten|btn|sec|acc|peacock|prime|dazn|tudn|univision|telemundo|ppv|bally)\b/i;

export function channelGuidePriority(
    name: string,
    sports: readonly DashboardSport[] | null
): number {
    const sport = detectSport('', '', name);
    if (sports && sports.length > 0 && sport && sports.includes(sport))
        return 0;
    if (MAJOR_NETWORKS.test(name)) return 1;
    if (sport) return 2;
    return 3;
}

export function orderChannelsForGuide<T extends { readonly title: string }>(
    channels: readonly T[],
    sports: readonly DashboardSport[] | null
): T[] {
    return channels
        .map((channel, index) => ({
            channel,
            index,
            priority: channelGuidePriority(channel.title, sports),
        }))
        .sort((a, b) => a.priority - b.priority || a.index - b.index)
        .map(({ channel }) => channel);
}

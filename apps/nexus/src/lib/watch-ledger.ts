/**
 * The server side of a watch heartbeat: turns one report into what to store.
 *
 * Why this exists. The old heartbeat sent deltas ("I watched 30 more seconds")
 * and the client forgot each delta the moment it sent it. A request that failed,
 * a token that would not refresh, or a flush skipped while another was in
 * flight lost that playback for good. What the student had played lived only
 * in the page, and a reload rebuilt it from a single number that those losses
 * had made too small. So a student on a poor connection watched a section, was
 * told they had not, reloaded, and was sent back to watch it again
 * (Inaya, recap 68f14d40, 2026-10-12).
 *
 * Now the client reports cumulative totals for its viewing session: everything
 * it has played since the page opened, as ranges and as seconds. Resending the
 * same report changes nothing, so the client never has to forget anything, and
 * a failed request is simply covered by the next one. The server keeps a small
 * baseline per session and credits only the growth.
 *
 * The client is not trusted further than the old one was:
 *   - credited seconds are capped by how much real time has passed (at twice
 *     speed, plus slack), measured on the server's clock;
 *   - the stretches a session adds can never cover more than that session was
 *     credited for, so ranges cannot be invented to open a quiz;
 *   - blocked-seek counts are capped per report.
 *
 * Pure, so every rule is unit tested (watch-ledger.test.ts).
 */

import { creditedPlayedUntil } from './watch-progress';
import {
  compactRanges,
  mergeRanges,
  parseRanges,
  totalPlayed,
  truncateRanges,
  type PlayedRange,
} from './played-ranges';

/** Fastest playback any gate allows. Credit beyond this rate is not real. */
const MAX_RATE = 2;
/** Slack per report, for clock jitter and the first flush of a session. */
const SLACK_SECONDS = 30;
/** A session older than this is not credited for its whole age. */
const MAX_SESSION_SECONDS = 4 * 60 * 60;
/** Stretches beyond what was credited, for rounding at each end of a range. */
const RANGE_SLACK_SECONDS = 5;
const MAX_BLOCKED_PER_REPORT = 50;
const MAX_SESSIONS = 8;
/** The stored record stays small however much a student scrubs. */
export const MAX_STORED_RANGES = 200;
/** What one report may carry; the client compacts to this. */
export const MAX_REPORT_RANGES = 64;

export interface PlaybackDiagnostics {
  stalls: number;
  stall_seconds: number;
  reloads: number;
  grant_refreshes: number;
  grant_refresh_failures: number;
  discarded_seconds: number;
}

export const EMPTY_DIAGNOSTICS: PlaybackDiagnostics = {
  stalls: 0,
  stall_seconds: 0,
  reloads: 0,
  grant_refreshes: 0,
  grant_refresh_failures: 0,
  discarded_seconds: 0,
};

const DIAG_KEYS = Object.keys(EMPTY_DIAGNOSTICS) as Array<keyof PlaybackDiagnostics>;

/** What the server remembers about one viewing session. */
export interface SessionBaseline {
  /** Cumulative watched seconds the client last reported. */
  w: number;
  /** Seconds credited to this session so far. */
  c: number;
  /** Server time of the last report, ms. */
  at: number;
  /** Cumulative blocked seeks last reported. */
  b: number;
  /** Cumulative diagnostics last reported. */
  d: PlaybackDiagnostics;
}

export interface WatchReport {
  sessionId: string;
  /** Seconds since the session began, by the client's monotonic clock. */
  elapsedSeconds: number;
  position: number;
  duration: number;
  /** Cumulative seconds played this session. */
  watchedSeconds: number;
  /** Everything played this session. */
  ranges: PlayedRange[];
  /** Cumulative refused seeks this session. */
  blockedTotal: number;
  diagnostics: PlaybackDiagnostics;
  userAgent: string | null;
}

export interface StoredWatch {
  /** null for a row written before ranges were stored. */
  ranges: PlayedRange[] | null;
  sessions: Record<string, SessionBaseline>;
  position: number;
  watchedSeconds: number;
}

export interface WatchUpdate {
  credit: number;
  blockedDelta: number;
  diagnosticsDelta: PlaybackDiagnostics;
  ranges: PlayedRange[];
  sessions: Record<string, SessionBaseline>;
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function nonNegative(value: unknown): number {
  return Math.max(0, num(value));
}

/** A v2 heartbeat body, or null for anything else (a v1 body takes the old path). */
export function parseWatchReport(body: unknown): WatchReport | null {
  const b = body as Record<string, unknown> | null;
  if (!b || b.v !== 2) return null;
  const sessionId = typeof b.session_id === 'string' ? b.session_id.slice(0, 64) : '';
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(sessionId)) return null;

  const duration = nonNegative(b.duration_seconds);
  const rawDiag = (b.diagnostics ?? {}) as Record<string, unknown>;
  const diagnostics = { ...EMPTY_DIAGNOSTICS };
  for (const key of DIAG_KEYS) diagnostics[key] = nonNegative(rawDiag[key]);

  return {
    sessionId,
    elapsedSeconds: nonNegative(b.elapsed_seconds),
    position: Math.round(nonNegative(b.last_video_position_seconds)),
    duration: Math.round(duration),
    watchedSeconds: nonNegative(b.watched_seconds),
    ranges: compactRanges(parseRanges(b.played_ranges, duration), MAX_REPORT_RANGES),
    blockedTotal: Math.round(nonNegative(b.blocked_total)),
    diagnostics,
    userAgent: typeof b.user_agent === 'string' ? b.user_agent.slice(0, 300) : null,
  };
}

/** Stored ranges, or the prefix a pre-ranges row stands for. */
export function storedRanges(stored: Pick<StoredWatch, 'ranges' | 'position' | 'watchedSeconds'>): PlayedRange[] {
  if (stored.ranges) return stored.ranges;
  const prefix = creditedPlayedUntil(stored.position, stored.watchedSeconds);
  return prefix > 0 ? [[0, prefix]] : [];
}

/** Read the jsonb columns of a progress row. */
export function readStoredWatch(row: {
  played_ranges?: unknown;
  watch_sessions?: unknown;
  last_video_position_seconds?: unknown;
  watched_seconds?: unknown;
} | null): StoredWatch {
  const sessions: Record<string, SessionBaseline> = {};
  const raw = row?.watch_sessions;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [id, value] of Object.entries(raw as Record<string, any>)) {
      if (!value || typeof value !== 'object') continue;
      const d = { ...EMPTY_DIAGNOSTICS };
      for (const key of DIAG_KEYS) d[key] = nonNegative(value.d?.[key]);
      sessions[id] = { w: nonNegative(value.w), c: nonNegative(value.c), at: nonNegative(value.at), b: nonNegative(value.b), d };
    }
  }
  return {
    ranges: row?.played_ranges == null ? null : parseRanges(row.played_ranges),
    sessions,
    position: nonNegative(row?.last_video_position_seconds),
    watchedSeconds: nonNegative(row?.watched_seconds),
  };
}

export function applyWatchReport(stored: StoredWatch, report: WatchReport, nowMs: number): WatchUpdate {
  const previous = stored.sessions[report.sessionId];

  // How much playback real time allows since the last thing we heard.
  const sinceSeconds = previous
    ? Math.max(0, (nowMs - previous.at) / 1000)
    : Math.min(report.elapsedSeconds, MAX_SESSION_SECONDS);
  const budget = sinceSeconds * MAX_RATE + SLACK_SECONDS;

  const lastW = previous?.w ?? 0;
  const credit = Math.round(Math.min(Math.max(0, report.watchedSeconds - lastW), budget));
  const creditedToSession = (previous?.c ?? 0) + credit;

  // A session's stretches may not cover more than it was credited for. Anything
  // beyond that is dropped from the end, never invented.
  let sessionRanges = report.ranges;
  if (totalPlayed(sessionRanges) > creditedToSession + RANGE_SLACK_SECONDS) {
    sessionRanges = truncateRanges(sessionRanges, creditedToSession + RANGE_SLACK_SECONDS);
  }
  const ranges = compactRanges(mergeRanges([...storedRanges(stored), ...sessionRanges]), MAX_STORED_RANGES);

  const blockedDelta = Math.min(MAX_BLOCKED_PER_REPORT, Math.max(0, report.blockedTotal - (previous?.b ?? 0)));
  const diagnosticsDelta = { ...EMPTY_DIAGNOSTICS };
  for (const key of DIAG_KEYS) {
    diagnosticsDelta[key] = Math.max(0, Math.round(report.diagnostics[key] - (previous?.d[key] ?? 0)));
  }

  const sessions: Record<string, SessionBaseline> = {
    ...stored.sessions,
    [report.sessionId]: {
      w: Math.max(lastW, report.watchedSeconds),
      c: creditedToSession,
      at: nowMs,
      b: Math.max(previous?.b ?? 0, report.blockedTotal),
      d: report.diagnostics,
    },
  };
  const ids = Object.keys(sessions).sort((a, b) => sessions[b].at - sessions[a].at);
  for (const id of ids.slice(MAX_SESSIONS)) delete sessions[id];

  return { credit, blockedDelta, diagnosticsDelta, ranges, sessions };
}

/**
 * The "played until" an older client understands: the end of the stretch that
 * starts at the beginning. Kept in the embed reply for pages still open on the
 * previous build.
 */
export function prefixEnd(ranges: ReadonlyArray<PlayedRange>): number {
  const first = mergeRanges(ranges)[0];
  return first && first[0] <= 1 ? first[1] : 0;
}

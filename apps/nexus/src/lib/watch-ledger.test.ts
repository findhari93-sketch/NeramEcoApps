import { describe, it, expect } from 'vitest';
import {
  applyWatchReport,
  parseWatchReport,
  readStoredWatch,
  storedRanges,
  prefixEnd,
  EMPTY_DIAGNOSTICS,
  type StoredWatch,
  type WatchReport,
} from './watch-ledger';

const T0 = Date.UTC(2026, 9, 14, 12, 0, 0);
const empty: StoredWatch = { ranges: [], sessions: {}, position: 0, watchedSeconds: 0 };

function report(overrides: Partial<WatchReport> = {}): WatchReport {
  return {
    sessionId: 'sess-abc123',
    elapsedSeconds: 60,
    position: 0,
    duration: 4383,
    watchedSeconds: 0,
    ranges: [],
    blockedTotal: 0,
    diagnostics: { ...EMPTY_DIAGNOSTICS },
    userAgent: null,
    timelineVersion: null,
    ...overrides,
  };
}

/** Apply a report and fold the result back into stored state, like the route does. */
function step(stored: StoredWatch, r: WatchReport, now: number) {
  const update = applyWatchReport(stored, r, now);
  const next: StoredWatch = {
    ranges: update.ranges,
    sessions: update.sessions,
    position: Math.max(stored.position, r.position),
    watchedSeconds: stored.watchedSeconds + update.credit,
  };
  return { update, next };
}

describe('applyWatchReport', () => {
  it('credits a session once, however many times the same report arrives', () => {
    const r = report({ watchedSeconds: 30, ranges: [[3496, 3526]], position: 3526 });
    const first = step(empty, r, T0);
    expect(first.update.credit).toBe(30);
    const again = step(first.next, r, T0 + 1_000);
    expect(again.update.credit).toBe(0);
    expect(again.update.ranges).toEqual([[3496, 3526]]);
  });

  it('loses nothing when reports fail: the next one carries everything', () => {
    // Reports at 30s and 60s never arrived. The 90s one covers both.
    const r = report({ watchedSeconds: 90, ranges: [[3496, 3586]], elapsedSeconds: 95 });
    const { update } = step(empty, r, T0);
    expect(update.credit).toBe(90);
    expect(update.ranges).toEqual([[3496, 3586]]);
  });

  it('credits rewatching as watch time without inventing coverage', () => {
    // Inaya's case: the same stretch played twice.
    const s1 = step(empty, report({ watchedSeconds: 600, ranges: [[3429, 4029]], elapsedSeconds: 620 }), T0);
    const s2 = step(s1.next, report({ watchedSeconds: 1200, ranges: [[3429, 4029]] }), T0 + 610_000);
    expect(s2.update.credit).toBe(600);
    expect(s2.next.watchedSeconds).toBe(1200);
    expect(s2.update.ranges).toEqual([[3429, 4029]]);
  });

  it('caps credit at what real time allows, on the server clock', () => {
    const s1 = step(empty, report({ watchedSeconds: 10, ranges: [[0, 10]], elapsedSeconds: 10 }), T0);
    // 60 seconds later the client claims an hour.
    const s2 = step(s1.next, report({ watchedSeconds: 3610, ranges: [[0, 3610]] }), T0 + 60_000);
    expect(s2.update.credit).toBe(150); // 60s at 2x + 30s slack
  });

  it('never lets a session cover more than it was credited for', () => {
    // A first report claiming the whole section after 20 seconds.
    const { update } = step(empty, report({ watchedSeconds: 900, ranges: [[3429, 4366]], elapsedSeconds: 20 }), T0);
    expect(update.credit).toBe(70);
    expect(update.ranges).toEqual([[3429, 3504]]);
  });

  it('keeps what earlier sessions played', () => {
    const s1 = step(empty, report({ sessionId: 'sess-one-1', watchedSeconds: 100, ranges: [[0, 100]], elapsedSeconds: 100 }), T0);
    const s2 = step(
      s1.next,
      report({ sessionId: 'sess-two-2', watchedSeconds: 50, ranges: [[200, 250]], elapsedSeconds: 50 }),
      T0 + 3_600_000,
    );
    expect(s2.update.ranges).toEqual([
      [0, 100],
      [200, 250],
    ]);
  });

  it('turns a pre-ranges row into the prefix it always stood for', () => {
    const legacy: StoredWatch = { ranges: null, sessions: {}, position: 3496, watchedSeconds: 3450 };
    expect(storedRanges(legacy)).toEqual([[0, 3496]]);
    const { update } = step(legacy, report({ watchedSeconds: 30, ranges: [[3496, 3526]], elapsedSeconds: 30 }), T0);
    expect(update.ranges).toEqual([[0, 3526]]);
  });

  it('counts blocked seeks and diagnostics as growth, capped, and never negative', () => {
    const s1 = step(
      empty,
      report({ blockedTotal: 3, diagnostics: { ...EMPTY_DIAGNOSTICS, stalls: 2, stall_seconds: 41 } }),
      T0,
    );
    expect(s1.update.blockedDelta).toBe(3);
    expect(s1.update.diagnosticsDelta.stall_seconds).toBe(41);
    const s2 = step(
      s1.next,
      report({ blockedTotal: 500, diagnostics: { ...EMPTY_DIAGNOSTICS, stalls: 1, stall_seconds: 41 } }),
      T0 + 30_000,
    );
    expect(s2.update.blockedDelta).toBe(50);
    expect(s2.update.diagnosticsDelta.stalls).toBe(0);
    expect(s2.update.diagnosticsDelta.stall_seconds).toBe(0);
  });

  it('keeps only the most recent sessions', () => {
    let stored = empty;
    for (let i = 0; i < 12; i++) {
      stored = step(stored, report({ sessionId: `sess-${String(i).padStart(4, '0')}` }), T0 + i * 1000).next;
    }
    expect(Object.keys(stored.sessions)).toHaveLength(8);
    expect(stored.sessions['sess-0011']).toBeTruthy();
    expect(stored.sessions['sess-0000']).toBeUndefined();
  });
});

describe('parseWatchReport', () => {
  it('reads a v2 body and clamps it', () => {
    const r = parseWatchReport({
      v: 2,
      session_id: 'abc_DEF-123',
      elapsed_seconds: 90,
      last_video_position_seconds: 120.4,
      duration_seconds: 100,
      watched_seconds: 80,
      played_ranges: [[0, 50], [40, 150], ['x', 3], [-5, 2]],
      blocked_total: 2,
      diagnostics: { stalls: 1, stall_seconds: -4, bogus: 9 },
      user_agent: 'UA',
    });
    expect(r).toMatchObject({ sessionId: 'abc_DEF-123', position: 120, duration: 100, watchedSeconds: 80 });
    expect(r?.ranges).toEqual([[0, 100]]);
    expect(r?.diagnostics).toEqual({ ...EMPTY_DIAGNOSTICS, stalls: 1 });
  });

  it('leaves a v1 body or a bad session id to the old path', () => {
    expect(parseWatchReport({ last_video_position_seconds: 5, watched_delta_seconds: 5 })).toBeNull();
    expect(parseWatchReport({ v: 2, session_id: 'a b' })).toBeNull();
    expect(parseWatchReport(null)).toBeNull();
  });
});

describe('readStoredWatch and prefixEnd', () => {
  it('reads jsonb columns defensively', () => {
    const stored = readStoredWatch({
      played_ranges: [[10, 20], [0, 5]],
      watch_sessions: { s1: { w: 5, c: 5, at: 1, b: 0, d: { stalls: 2 } }, junk: 3 },
      last_video_position_seconds: 20,
      watched_seconds: 15,
    });
    expect(stored.ranges).toEqual([[0, 5], [10, 20]]);
    expect(stored.sessions.s1.d.stalls).toBe(2);
    expect(stored.sessions.junk).toBeUndefined();
    expect(readStoredWatch(null).ranges).toBeNull();
  });

  it('gives older clients the stretch that starts at the beginning', () => {
    expect(prefixEnd([[0, 300], [400, 500]])).toBe(300);
    expect(prefixEnd([[60, 300]])).toBe(0);
    expect(prefixEnd([])).toBe(0);
  });
});

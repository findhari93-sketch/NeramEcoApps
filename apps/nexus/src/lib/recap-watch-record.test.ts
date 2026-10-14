import { describe, it, expect, vi } from 'vitest';
import { recordWatchReport, readWatchProgress } from './recap-watch-record';

/**
 * The route half of the watch ledger, against a fake Supabase client: a v2
 * report is applied with a version guard and retried when another flush won
 * the race, an older page's v1 body keeps working, and a database the
 * migration has not reached yet never loses the resume point.
 */

type Row = Record<string, unknown> | null;

function fakeSupabase(opts: {
  rows?: Row[];
  readError?: { code: string; message: string } | null;
  applyResults?: Array<{ data?: unknown; error?: { code: string; message: string } | null }>;
  timeline?: number;
}) {
  const rows = [...(opts.rows ?? [null])];
  const applyResults = [...(opts.applyResults ?? [{ data: true }])];
  const rpc = vi.fn(async (name: string, _args: Record<string, any>) => {
    if (name === 'nexus_apply_recap_watch') return applyResults.shift() ?? { data: true, error: null };
    return { data: null, error: null };
  });
  const selects: string[] = [];
  const from = vi.fn(() => {
    const chain: any = {
      select: (cols: string) => {
        selects.push(cols);
        return chain;
      },
      eq: () => chain,
      maybeSingle: async () => {
        if (selects[selects.length - 1] === 'timeline_version') {
          return { data: { timeline_version: opts.timeline ?? 0 }, error: null };
        }
        if (opts.readError && selects[selects.length - 1].includes('played_ranges')) {
          return { data: null, error: opts.readError };
        }
        return { data: rows.length > 1 ? rows.shift() : rows[0], error: null };
      },
    };
    return chain;
  });
  return { client: { rpc, from }, rpc, selects };
}

const v2 = (overrides: Record<string, unknown> = {}) => ({
  v: 2,
  session_id: 'sess-123456',
  elapsed_seconds: 60,
  last_video_position_seconds: 3526,
  duration_seconds: 4383,
  watched_seconds: 30,
  played_ranges: [[3496, 3526]],
  blocked_total: 0,
  diagnostics: { stalls: 1, stall_seconds: 41 },
  user_agent: 'UA',
  ...overrides,
});

describe('recordWatchReport', () => {
  it('applies a v2 report through the ledger with a version guard', async () => {
    const { client, rpc } = fakeSupabase({
      rows: [
        {
          played_ranges: [[0, 3496]],
          watch_sessions: {},
          watch_version: 4,
          last_video_position_seconds: 3496,
          watched_seconds: 3450,
        },
      ],
    });
    const result = await recordWatchReport(client, 'stu', 'recap', v2());
    expect(result).toEqual({ ok: true, credited: 30 });
    const [name, args] = rpc.mock.calls[0];
    expect(name).toBe('nexus_apply_recap_watch');
    expect(args).toMatchObject({
      p_expected_version: 4,
      p_pos: 3526,
      p_credit: 30,
      p_ranges: [[0, 3526]],
      p_diag: { stalls: 1, stall_seconds: 41 },
      p_user_agent: 'UA',
    });
  });

  it('re-reads and re-applies when another flush got there first', async () => {
    const { client, rpc } = fakeSupabase({
      rows: [
        { played_ranges: [], watch_sessions: {}, watch_version: 1 },
        { played_ranges: [], watch_sessions: {}, watch_version: 2 },
      ],
      applyResults: [{ data: false }, { data: true }],
    });
    const result = await recordWatchReport(client, 'stu', 'recap', v2());
    expect(result.ok).toBe(true);
    expect(rpc.mock.calls.map(([, a]) => a.p_expected_version)).toEqual([1, 2]);
  });

  it('keeps a page on the previous build working, and records its refused seeks', async () => {
    const { client, rpc } = fakeSupabase({});
    await recordWatchReport(client, 'stu', 'recap', {
      last_video_position_seconds: 100,
      watched_delta_seconds: 25,
      duration_seconds: 600,
      blocked_seeks_delta: 3,
    });
    expect(rpc.mock.calls.map(([n]) => n)).toEqual(['nexus_bump_recap_progress', 'nexus_increment_blocked_seeks']);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_pos: 100, p_watched_delta: 25 });
  });

  it('saves the position the old way when the ledger columns do not exist yet', async () => {
    const { client, rpc } = fakeSupabase({
      readError: { code: '42703', message: 'column played_ranges does not exist' },
    });
    const result = await recordWatchReport(client, 'stu', 'recap', v2());
    expect(result.ok).toBe(false);
    expect(rpc.mock.calls[0]).toEqual([
      'nexus_bump_recap_progress',
      expect.objectContaining({ p_pos: 3526, p_watched_delta: 0 }),
    ]);
  });

  it('saves the position the old way when the ledger function does not exist yet', async () => {
    const { client, rpc } = fakeSupabase({
      applyResults: [{ error: { code: 'PGRST202', message: 'Could not find nexus_apply_recap_watch' } }],
    });
    const result = await recordWatchReport(client, 'stu', 'recap', v2());
    expect(result.ok).toBe(false);
    expect(rpc.mock.calls[1][0]).toBe('nexus_bump_recap_progress');
  });
});

describe('recordWatchReport: a recording switched while the page was open', () => {
  it('refuses a report from the old timeline and says so', async () => {
    const { client, rpc } = fakeSupabase({ timeline: 1 });
    const result = await recordWatchReport(client, 'stu', 'recap', v2({ timeline_version: 0 }));
    expect(result).toEqual({ ok: false, credited: 0, stale: true });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('accepts a report on the current timeline', async () => {
    const { client } = fakeSupabase({ timeline: 1 });
    expect((await recordWatchReport(client, 'stu', 'recap', v2({ timeline_version: 1 }))).ok).toBe(true);
  });
});

describe('readWatchProgress', () => {
  it('returns stored ranges, and the prefix for older pages', async () => {
    const { client } = fakeSupabase({
      rows: [{ played_ranges: [[0, 300], [400, 500]], last_video_position_seconds: 500, watched_seconds: 400 }],
    });
    expect(await readWatchProgress(client, 'stu', 'recap')).toEqual({
      resumeAt: 500,
      playedRanges: [
        [0, 300],
        [400, 500],
      ],
      playedUntil: 300,
      timelineVersion: 0,
    });
  });

  it('turns a pre-ledger row into its prefix', async () => {
    const { client } = fakeSupabase({
      rows: [{ played_ranges: null, last_video_position_seconds: 3496, watched_seconds: 3450 }],
    });
    expect(await readWatchProgress(client, 'stu', 'recap')).toEqual({
      resumeAt: 3496,
      playedRanges: [[0, 3496]],
      playedUntil: 3496,
      timelineVersion: 0,
    });
  });

  it('falls back to the old columns before the migration, never losing the resume point', async () => {
    const { client, selects } = fakeSupabase({
      rows: [{ last_video_position_seconds: 120, watched_seconds: 100 }],
      readError: { code: '42703', message: 'column played_ranges does not exist' },
    });
    const view = await readWatchProgress(client, 'stu', 'recap');
    expect(selects.filter((c) => c !== 'timeline_version')).toHaveLength(2);
    expect(view.resumeAt).toBe(120);
    expect(view.playedRanges).toEqual([[0, 120]]);
  });
});

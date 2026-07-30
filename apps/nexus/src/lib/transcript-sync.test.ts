import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The background sweep's contract.
 *
 * Every assertion here is about NOT doing work. This runs twice a night against
 * every past class, so the expensive mistakes are all of the same shape: fetching
 * a transcript we already hold, retrying a class Teams will never have one for, or
 * calling Graph for a class that has not finished. Each of those turns a fixed
 * one-call-per-class cost into a recurring bill.
 */

const resolveTranscript = vi.fn();
const recordTranscriptFailure = vi.fn();

vi.mock('@/lib/transcript-resolver', () => ({
  resolveTranscript: (...args: unknown[]) => resolveTranscript(...args),
  recordTranscriptFailure: (...args: unknown[]) => recordTranscriptFailure(...args),
  // A literal, not a reference: vi.mock is hoisted above every const in this file.
  MAX_TRANSCRIPT_ATTEMPTS: 6,
}));

/** Must match the literal in the mock factory above. */
const MAX_ATTEMPTS = 6;
vi.mock('@/lib/attendance-sync', () => ({ CLASS_SYNC_COLUMNS: 'id, scheduled_date, start_time' }));
vi.mock('@/lib/class-absences', () => ({ istToday: () => '2026-07-30' }));

import { syncClassTranscripts } from './transcript-sync';

/** A class that ended long ago, so it is always due. */
function endedClass(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    scheduled_date: '2026-07-28',
    start_time: '19:00:00',
    end_time: '20:30:00',
    recording_url: null,
    transcript_url: null,
    ...over,
  };
}

function makeSupabase(classes: any[], transcripts: any[]) {
  const upsert = vi.fn().mockResolvedValue({});
  const classesChain: any = {};
  for (const m of ['select', 'not', 'neq', 'eq', 'gte', 'lte', 'order']) {
    classesChain[m] = vi.fn(() => classesChain);
  }
  classesChain.limit = vi.fn(async () => ({ data: classes, error: null }));

  const from = vi.fn((table: string) => {
    if (table === 'nexus_scheduled_classes') return classesChain;
    return {
      select: vi.fn(() => ({
        in: vi.fn(async () => ({ data: transcripts, error: null })),
      })),
      upsert,
    };
  });
  return { supabase: { from } as any, upsert };
}

beforeEach(() => {
  resolveTranscript.mockReset().mockResolvedValue({ entries: [], source: 'none' });
  recordTranscriptFailure.mockReset().mockResolvedValue('pending');
});

describe('syncClassTranscripts', () => {
  it('never re-fetches a class whose transcript is already stored', async () => {
    const { supabase } = makeSupabase(
      [endedClass('c1')],
      [{ class_id: 'c1', status: 'ok', attempts: 0 }],
    );

    const summary = await syncClassTranscripts(supabase, { days: 400 });

    expect(summary.due).toBe(0);
    expect(summary.stored).toBe(0);
    expect(resolveTranscript).not.toHaveBeenCalled();
  });

  it('gives up permanently once a class has used its attempts', async () => {
    const { supabase } = makeSupabase(
      [endedClass('c1')],
      [{ class_id: 'c1', status: 'pending', attempts: MAX_ATTEMPTS }],
    );

    const summary = await syncClassTranscripts(supabase, { days: 400 });

    expect(summary.due).toBe(0);
    expect(resolveTranscript).not.toHaveBeenCalled();
  });

  it('leaves a class that has not finished alone', async () => {
    const { supabase } = makeSupabase(
      [endedClass('c1', { scheduled_date: '2030-01-01' })],
      [],
    );

    const summary = await syncClassTranscripts(supabase, { days: 400 });

    expect(summary.due).toBe(0);
    expect(resolveTranscript).not.toHaveBeenCalled();
  });

  it('fetches a class that has never been tried', async () => {
    resolveTranscript.mockResolvedValue({
      entries: [{ start: 0, end: 1, text: 'hello' }],
      source: 'graph_live',
    });
    const { supabase } = makeSupabase([endedClass('c1')], []);

    const summary = await syncClassTranscripts(supabase, { days: 400 });

    expect(summary.due).toBe(1);
    expect(summary.stored).toBe(1);
    expect(summary.missed).toBe(0);
    // resolveTranscript stores it, so the sweep must not write anything itself.
    expect(recordTranscriptFailure).not.toHaveBeenCalled();
  });

  it('counts a miss and records why, so the cap can eventually bite', async () => {
    resolveTranscript.mockResolvedValue({
      entries: [],
      source: 'none',
      meetingFailure: 'access_policy_missing',
    });
    const { supabase } = makeSupabase([endedClass('c1')], []);

    const summary = await syncClassTranscripts(supabase, { days: 400 });

    expect(summary.missed).toBe(1);
    expect(summary.stored).toBe(0);
    expect(summary.reasons).toEqual({ access_policy_missing: 1 });
    expect(recordTranscriptFailure).toHaveBeenCalledWith(
      supabase,
      'c1',
      'access_policy_missing',
    );
  });

  it('reports the SharePoint sentinel when that is all there is', async () => {
    resolveTranscript.mockResolvedValue({
      entries: [],
      source: 'none',
      sharepointError: 'NO_ACCESS',
      meetingFailure: 'NO_TRANSCRIPT',
    });
    const { supabase } = makeSupabase([endedClass('c1')], []);

    const summary = await syncClassTranscripts(supabase, { days: 400 });

    expect(summary.reasons).toEqual({ NO_ACCESS: 1 });
  });

  it('reports how many classes went terminal this run', async () => {
    recordTranscriptFailure.mockResolvedValue('unavailable');
    const { supabase } = makeSupabase([endedClass('c1'), endedClass('c2')], []);

    const summary = await syncClassTranscripts(supabase, { days: 400 });

    expect(summary.missed).toBe(2);
    expect(summary.exhausted).toBe(2);
  });

  it('honours the per-run limit so one sweep cannot run away', async () => {
    const classes = Array.from({ length: 10 }, (_, i) => endedClass(`c${i}`));
    const { supabase } = makeSupabase(classes, []);

    const summary = await syncClassTranscripts(supabase, { days: 400, limit: 3 });

    expect(summary.due).toBe(3);
    expect(resolveTranscript).toHaveBeenCalledTimes(3);
  });
});

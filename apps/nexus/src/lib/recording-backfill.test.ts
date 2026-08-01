import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vi.hoisted, because vi.mock is lifted above every const in this file and a
// plain `const fn = vi.fn()` would not exist yet when the factory runs.
const { findRecordingForClass } = vi.hoisted(() => ({ findRecordingForClass: vi.fn() }));
vi.mock('@/lib/recording-locator', () => ({ findRecordingForClass }));

import { syncClassRecordingLinks, MAX_RECORDING_ATTEMPTS } from './recording-backfill';

/** A class that ended two hours ago in IST, so it is past the 60 minute grace. */
function endedClass(overrides: Record<string, unknown> = {}) {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const ist = new Date(twoHoursAgo.getTime() + 5.5 * 60 * 60 * 1000);
  return {
    id: 'class-1',
    classroom_id: 'room-1',
    teacher_id: 'teacher-1',
    title: 'Perspective basics',
    scheduled_date: ist.toISOString().substring(0, 10),
    start_time: '19:00',
    end_time: ist.toISOString().substring(11, 16),
    recording_url: null,
    organizer_ms_oid: null,
    organizer_email: null,
    recording_sync_attempts: 0,
    recording_sync_status: null,
    ...overrides,
  };
}

function makeSupabase(rows: any[]) {
  const updates: Array<{ payload: any; filters: any[] }> = [];

  const client = {
    from() {
      const chain: any = {
        select: () => chain,
        is: () => chain,
        neq: () => chain,
        eq: () => chain,
        lt: () => chain,
        gte: () => chain,
        lte: () => chain,
        order: () => chain,
        limit: () => Promise.resolve({ data: rows, error: null }),
        update: (payload: any) => {
          const entry = { payload, filters: [] as any[] };
          updates.push(entry);
          const u: any = {
            eq: (col: string, val: any) => {
              entry.filters.push([col, val]);
              return u;
            },
            then: (resolve: any) => resolve({ error: null }),
          };
          return u;
        },
      };
      return chain;
    },
  };

  return { client, updates };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('syncClassRecordingLinks', () => {
  it('writes the link and marks the class settled when one is found', async () => {
    findRecordingForClass.mockResolvedValue('https://neram.sharepoint.com/:v:/g/abc');
    const { client, updates } = makeSupabase([endedClass()]);

    const summary = await syncClassRecordingLinks(client);

    expect(summary.found).toBe(1);
    expect(summary.foundClassIds).toEqual(['class-1']);
    expect(updates[0].payload.recording_url).toBe('https://neram.sharepoint.com/:v:/g/abc');
    expect(updates[0].payload.recording_sync_status).toBe('ok');
    expect(updates[0].payload.recording_fetched_at).toBeTruthy();
  });

  it('leaves a class alone until the grace has passed', async () => {
    // Teams needs far longer to publish a 300 MB mp4 than a 12 KB vtt, and
    // calling Graph early only burns an attempt against the cap.
    const nowIst = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const justEnded = endedClass({
      scheduled_date: nowIst.toISOString().substring(0, 10),
      end_time: nowIst.toISOString().substring(11, 16),
    });
    const { client } = makeSupabase([justEnded]);

    const summary = await syncClassRecordingLinks(client);

    expect(summary.due).toBe(0);
    expect(findRecordingForClass).not.toHaveBeenCalled();
  });

  it('counts an attempt when nothing is found, and stays retryable', async () => {
    findRecordingForClass.mockResolvedValue(null);
    const { client, updates } = makeSupabase([endedClass({ recording_sync_attempts: 1 })]);

    const summary = await syncClassRecordingLinks(client);

    expect(summary.missed).toBe(1);
    expect(summary.exhausted).toBe(0);
    expect(updates[0].payload.recording_sync_attempts).toBe(2);
    expect(updates[0].payload.recording_sync_status).toBe('pending');
  });

  it('retires a class at the attempt cap', async () => {
    // Without this, a class Teams never recorded is retried twice a night
    // forever, which is the real cost risk.
    findRecordingForClass.mockResolvedValue(null);
    const { client, updates } = makeSupabase([
      endedClass({ recording_sync_attempts: MAX_RECORDING_ATTEMPTS - 1 }),
    ]);

    const summary = await syncClassRecordingLinks(client);

    expect(summary.exhausted).toBe(1);
    expect(updates[0].payload.recording_sync_status).toBe('unavailable');
  });

  it('never reconsiders a class already marked unavailable', async () => {
    const { client } = makeSupabase([endedClass({ recording_sync_status: 'unavailable' })]);

    const summary = await syncClassRecordingLinks(client);

    expect(summary.due).toBe(0);
    expect(findRecordingForClass).not.toHaveBeenCalled();
  });

  it('passes a cached organizer oid through, and undefined when there is none', async () => {
    // undefined, NOT null: the locator treats undefined as "resolve it yourself"
    // and null as "there is no organizer", which would skip the OneDrive lookup.
    findRecordingForClass.mockResolvedValue(null);

    const { client } = makeSupabase([endedClass({ organizer_ms_oid: 'oid-42' })]);
    await syncClassRecordingLinks(client);
    expect(findRecordingForClass.mock.calls[0][2]).toBe('oid-42');

    findRecordingForClass.mockClear();
    const { client: bare } = makeSupabase([endedClass()]);
    await syncClassRecordingLinks(bare);
    expect(findRecordingForClass.mock.calls[0][2]).toBeUndefined();
  });

  it('counts a thrown lookup as a miss instead of ending the sweep', async () => {
    findRecordingForClass.mockRejectedValue(new Error('Graph 503'));
    const { client, updates } = makeSupabase([endedClass()]);

    const summary = await syncClassRecordingLinks(client);

    expect(summary.missed).toBe(1);
    expect(updates[0].payload.recording_sync_detail).toContain('Graph 503');
  });

  it('does nothing when there are no candidates', async () => {
    const { client } = makeSupabase([]);
    const summary = await syncClassRecordingLinks(client);
    expect(summary).toMatchObject({ candidates: 0, due: 0, found: 0 });
    expect(findRecordingForClass).not.toHaveBeenCalled();
  });
});

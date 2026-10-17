import { describe, it, expect, vi } from 'vitest';

vi.mock('@neram/database', () => ({ getNexusSetting: vi.fn(async () => null) }));
vi.mock('./recording-source-cache', () => ({ evictMedia: vi.fn() }));

import { chooseCutMethod, failTrimJob, requeueTrim } from './recording-trim';

/**
 * Re-trimming a class students already watch trimmed (founder, 2026-10-15).
 * The live trim must survive every way a re-trim can come to nothing.
 */

function fakeSupabase(row: Record<string, unknown>) {
  const updates: Array<Record<string, unknown>> = [];
  const from = () => {
    const q: any = {
      select: () => q,
      eq: () => q,
      maybeSingle: async () => ({ data: row }),
      update: (values: Record<string, unknown>) => {
        updates.push(values);
        return q;
      },
      then: (resolve: (v: unknown) => void) => resolve({ error: null }),
    };
    return q;
  };
  return { client: { from }, updates };
}

const live = {
  id: 't1',
  class_id: 'c1',
  status: 'applied',
  previous: null,
  trimmed_url: 'https://sp/Trimmed/a (trimmed).mp4',
  trimmed_drive_id: 'd1',
  trimmed_item_id: 'i-trim',
  trimmed_size: 100,
  trimmed_duration_seconds: 3231,
  removed_seconds: 714,
  cut_map: [{ src_start: 714, src_end: 3945, out_start: 0, out_len: 3231 }],
  plan: { kind: 'cut', merged: [] },
  detection: { silences: 47 },
  applied_at: '2026-10-14T19:17:52Z',
  applied_by: null,
};

describe('requeueTrim', () => {
  it('queues a live trim again and keeps its record in previous', async () => {
    const { client, updates } = fakeSupabase(live);
    expect(await requeueTrim(client, live)).toBe('requeued');
    expect(updates[0]).toMatchObject({ status: 'queued', attempts: 0, source: 'manual' });
    expect(updates[0].previous).toMatchObject({ cut_map: live.cut_map, trimmed_item_id: 'i-trim', plan: live.plan });
  });

  it('queues a trim that is not live yet without a previous record', async () => {
    const { client, updates } = fakeSupabase({ ...live, status: 'skipped' });
    expect(await requeueTrim(client, { ...live, status: 'skipped' })).toBe('requeued');
    expect(updates[0].previous).toBeNull();
  });

  it('refuses a trim already being made, or a class on its original', async () => {
    const { client } = fakeSupabase(live);
    expect(await requeueTrim(client, { ...live, status: 'running' })).toBe('busy');
    expect(await requeueTrim(client, { ...live, status: 'reverted' })).toBe('busy');
    expect(await requeueTrim(client, { ...live, status: 'queued', previous: { cut_map: [] } })).toBe('busy');
  });
});

describe('failTrimJob during a re-trim', () => {
  it('puts the live trim back instead of marking the class failed', async () => {
    const previous = Object.fromEntries(Object.entries(live).filter(([k]) => !['id', 'class_id', 'status', 'previous'].includes(k)));
    const { client, updates } = fakeSupabase({ id: 't1', previous });
    await failTrimJob(client, 't1', 'WORKER_FAILED', 'ffmpeg exited 1');
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      status: 'applied',
      previous: null,
      reason: 'RETRIM_WORKER_FAILED',
      cut_map: live.cut_map,
      trimmed_item_id: 'i-trim',
      removed_seconds: 714,
    });
    expect(updates[0].detection).toEqual({ silences: 47, retrim: { error: 'ffmpeg exited 1' } });
  });

  it('marks an ordinary trim failed as before', async () => {
    const { client, updates } = fakeSupabase({ id: 't1', previous: null });
    await failTrimJob(client, 't1', 'WORKER_FAILED');
    expect(updates[0]).toMatchObject({ status: 'failed', reason: 'WORKER_FAILED' });
  });
});

describe('chooseCutMethod', () => {
  it('re-encodes only when the setting wants it and the worker can', () => {
    expect(chooseCutMethod({ cutMethod: 'reencode' }, { cut_methods: ['copy', 'reencode'] })).toBe('reencode');
    // A worker from before re-encoding sends nothing: its plan must stay keyframe-snapped.
    expect(chooseCutMethod({ cutMethod: 'reencode' }, {})).toBe('copy');
    expect(chooseCutMethod({ cutMethod: 'copy' }, { cut_methods: ['copy', 'reencode'] })).toBe('copy');
  });
});

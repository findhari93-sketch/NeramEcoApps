import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Validating picks and attaching them. What this pins: a stale or unplayable
 * pick is refused with a message (never silently dropped), snapshots carry the
 * title, thumbnail and length a card needs, and a create attaches the videos to
 * every class row while never attaching a class to itself.
 */

vi.mock('@neram/database', () => ({ getNexusSetting: vi.fn(), loadClassroomRoster: vi.fn() }));

import { PrewatchError, insertPrewatchForClasses, prewatchLinks, resolvePrewatchPicks } from './prewatch-server';

const inserted: unknown[][] = [];
let tables: Record<string, unknown[]> = {};

function fakeDb() {
  return {
    from(name: string) {
      const b: Record<string, unknown> = {};
      for (const m of ['select', 'in', 'eq']) b[m] = () => b;
      b.then = (resolve: (v: unknown) => void) => resolve({ data: tables[name] ?? [], error: null });
      b.insert = async (rows: unknown[]) => {
        inserted.push(rows);
        return { error: null };
      };
      return b;
    },
  };
}

beforeEach(() => {
  inserted.length = 0;
  tables = {
    library_videos: [
      { id: 'v1', youtube_video_id: 'dQw4w9WgXcQ', approved_title: 'Humans on the street', duration_seconds: 900, is_published: true },
      { id: 'v-hidden', youtube_video_id: 'x', original_title: 'Hidden', is_published: false },
    ],
    nexus_scheduled_classes: [
      {
        id: 'c1',
        title: 'Human on Streets',
        scheduled_date: '2026-10-03',
        status: 'completed',
        publish_state: 'published',
        recording_url: 'https://neram.sharepoint.com/rec.mp4',
        youtube_url: null,
        recording_duration_minutes: 60,
      },
      {
        id: 'c-graph',
        title: 'Old',
        scheduled_date: '2026-07-01',
        status: 'completed',
        publish_state: 'published',
        recording_url: 'https://graph.microsoft.com/v1.0/drives/x/items/y',
        youtube_url: null,
        recording_duration_minutes: 60,
      },
    ],
  };
});

describe('resolvePrewatchPicks', () => {
  it('snapshots both kinds in the order picked', async () => {
    const out = await resolvePrewatchPicks(fakeDb(), [
      { kind: 'class_recording', id: 'c1' },
      { kind: 'library_video', id: 'v1' },
    ]);
    expect(out).toEqual([
      {
        kind: 'class_recording',
        library_video_id: null,
        source_class_id: 'c1',
        title: 'Class on 3 Oct 2026: Human on Streets',
        thumb_url: null,
        duration_seconds: 3600,
      },
      {
        kind: 'library_video',
        library_video_id: 'v1',
        source_class_id: null,
        title: 'Humans on the street',
        thumb_url: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
        duration_seconds: 900,
      },
    ]);
  });

  it('refuses an unpublished Library video', async () => {
    await expect(resolvePrewatchPicks(fakeDb(), [{ kind: 'library_video', id: 'v-hidden' }])).rejects.toBeInstanceOf(PrewatchError);
  });

  it('refuses a past class students cannot play', async () => {
    await expect(resolvePrewatchPicks(fakeDb(), [{ kind: 'class_recording', id: 'c-graph' }])).rejects.toBeInstanceOf(PrewatchError);
    await expect(resolvePrewatchPicks(fakeDb(), [{ kind: 'class_recording', id: 'missing' }])).rejects.toBeInstanceOf(PrewatchError);
  });

  it('refuses more than five', async () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ kind: 'library_video' as const, id: `v${i}` }));
    await expect(resolvePrewatchPicks(fakeDb(), six)).rejects.toThrow(/up to 5/);
  });
});

describe('insertPrewatchForClasses', () => {
  it('attaches to every class row, never a class to itself', async () => {
    const templates = await resolvePrewatchPicks(fakeDb(), [
      { kind: 'class_recording', id: 'c1' },
      { kind: 'library_video', id: 'v1' },
    ]);
    const n = await insertPrewatchForClasses(fakeDb(), ['new-a', 'new-b', 'c1'], templates, 'u1');
    expect(n).toBe(5);
    const rows = inserted.flat() as Array<Record<string, unknown>>;
    expect(rows.filter((r) => r.scheduled_class_id === 'c1').map((r) => r.kind)).toEqual(['library_video']);
    expect(rows.find((r) => r.scheduled_class_id === 'new-a' && r.kind === 'library_video')).toMatchObject({
      sort_order: 1,
      created_by: 'u1',
    });
  });
});

describe('prewatchLinks', () => {
  it('links each video to the Nexus watch page of this class', () => {
    expect(prewatchLinks('https://nexus.neramclasses.com/', 'cls-1', [{ id: 'r1', title: 'A', duration_seconds: 60 }])).toEqual([
      { title: 'A', url: 'https://nexus.neramclasses.com/student/timetable/cls-1/watch/r1', durationSeconds: 60 },
    ]);
  });
});

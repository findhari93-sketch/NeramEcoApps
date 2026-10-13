import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Suggestions while scheduling. What this pins: staff only, past classes from
 * any classroom are matched on the title, a Library failure does not take the
 * past classes down, and what is already picked is never offered again.
 */

let user: Record<string, unknown> | null;
const searchVideos = vi.fn();
let classes: unknown[] = [];

vi.mock('@/lib/ms-verify', () => ({ verifyMsToken: async () => ({ oid: 'oid-1' }) }));
vi.mock('@neram/database', () => ({
  searchVideos: (...a: unknown[]) => searchVideos(...a),
  getSupabaseAdminClient: () => ({
    from: (name: string) => {
      const b: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'or', 'neq', 'lte', 'order', 'limit', 'in']) b[m] = () => b;
      b.maybeSingle = async () => ({ data: name === 'users' ? user : null, error: null });
      b.then = (resolve: (v: unknown) => void) =>
        resolve({ data: name === 'nexus_scheduled_classes' ? classes : [], error: null });
      return b;
    },
  }),
}));

import { GET } from './route';

const call = (qs: string) =>
  GET(new NextRequest(`http://localhost/api/timetable/prewatch-suggestions${qs}`, { headers: { Authorization: 'Bearer t' } }));

const pastClass = (id: string, title: string) => ({
  id,
  title,
  description: null,
  scheduled_date: '2026-09-20',
  classroom_id: 'room-x',
  course_topic_id: null,
  recording_url: 'https://neram.sharepoint.com/rec.mp4',
  youtube_url: null,
  recording_duration_minutes: 50,
  library_video_id: null,
  classroom: { name: 'Other Classroom' },
});

beforeEach(() => {
  user = { id: 't-1', user_type: 'teacher', staff_role: 'teacher', can_teach: true };
  searchVideos.mockReset().mockResolvedValue({ videos: [{ id: 'v1', youtube_video_id: 'dQw4w9WgXcQ', original_title: 'Street life' }] });
  classes = [pastClass('c1', 'Humans on the street'), pastClass('c2', 'Matrices')];
});

describe('GET prewatch-suggestions', () => {
  it('is staff only', async () => {
    user = { id: 's-1', user_type: 'student', staff_role: null, can_teach: false };
    expect((await call('?q=Human')).status).toBe(403);
  });

  it('matches past classes from any classroom and mixes in the Library', async () => {
    const body = await (await call('?q=Human%20on%20Streets')).json();
    expect(body.recordings.map((r: { id: string }) => r.id)).toEqual(['c1']);
    expect(body.recordings[0].subtitle).toBe('Other Classroom, 20 Sep 2026');
    expect(body.suggestions.map((s: { key: string }) => s.key)).toEqual(['class_recording:c1', 'library_video:v1']);
  });

  it('keeps the past classes when the Library search fails', async () => {
    searchVideos.mockRejectedValue(new Error('rpc down'));
    const body = await (await call('?q=Human')).json();
    expect(body.library).toEqual([]);
    expect(body.recordings.map((r: { id: string }) => r.id)).toEqual(['c1']);
  });

  it('never offers what is already picked', async () => {
    const body = await (await call('?q=Human%20street&exclude=class_recording:c1')).json();
    expect(body.recordings).toEqual([]);
    expect(body.suggestions.map((s: { key: string }) => s.key)).toEqual(['library_video:v1']);
  });

  it('lets the picker browse with no words: recent classes, no suggestions', async () => {
    const body = await (await call('')).json();
    expect(body.suggestions).toEqual([]);
    expect(body.recordings.map((r: { id: string }) => r.id)).toEqual(['c1', 'c2']);
  });
});

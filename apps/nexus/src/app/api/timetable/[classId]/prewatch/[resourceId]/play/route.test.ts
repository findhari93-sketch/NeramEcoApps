import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

/**
 * The play route is the only way a student reaches another classroom's
 * recording, so what it pins is who gets in:
 * - enrolment in the TARGET class (via resolveClassStaffAccess), and a row that
 *   really sits on that class, are both required;
 * - the grant is minted for the SOURCE class, the file actually streamed;
 * - a student who owes catch-up on the source class is sent to catch-up;
 * - switched off, draft, gone or unpublished all read as 404.
 */

const access = vi.fn();
const loadPrewatchRow = vi.fn();
const isPrewatchEnabled = vi.fn();
const grantVideoAccess = vi.fn();
const isProtectedVideoEnabled = vi.fn();
const getSharePointStreamUrl = vi.fn();
const startedPlainBeforeRecap = vi.fn();
const tables: Record<string, any> = {};

function table(name: string) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'limit', 'order']) b[m] = () => b;
  b.maybeSingle = async () => ({ data: tables[name] ?? null, error: null });
  return b;
}

vi.mock('@/lib/ms-verify', () => ({ verifyMsToken: async () => ({ oid: 'oid-1' }) }));
vi.mock('@neram/database', () => ({ getSupabaseAdminClient: () => ({ from: (n: string) => table(n) }) }));
vi.mock('@/lib/class-staff-access', () => ({ resolveClassStaffAccess: (...a: unknown[]) => access(...a) }));
vi.mock('@/lib/prewatch-server', () => ({
  loadPrewatchRow: (...a: unknown[]) => loadPrewatchRow(...a),
  isPrewatchEnabled: () => isPrewatchEnabled(),
}));
vi.mock('@/lib/video-grant', () => ({
  grantVideoAccess: (...a: unknown[]) => grantVideoAccess(...a),
  isProtectedVideoEnabled: () => isProtectedVideoEnabled(),
}));
vi.mock('@/lib/sharepoint', () => ({ getSharePointStreamUrl: (...a: unknown[]) => getSharePointStreamUrl(...a) }));
vi.mock('@/lib/plain-watch-head-start', () => ({
  startedPlainBeforeRecap: (...a: unknown[]) => startedPlainBeforeRecap(...a),
}));

import { GET } from './route';

type TestUser = { id: string; user_type: string; staff_role: string | null; can_teach: boolean };
const student: TestUser = { id: 'stu-1', user_type: 'student', staff_role: null, can_teach: false };
const teacher: TestUser = { id: 't-1', user_type: 'teacher', staff_role: 'teacher', can_teach: true };

function grantAccess(user = student, over: Record<string, unknown> = {}) {
  access.mockResolvedValue({
    userId: user.id,
    user,
    canEdit: user !== student,
    cls: { classroom_id: 'room-target', teacher_id: 't-1', publish_state: 'published', ...over },
  });
}

const recordingRow = {
  id: 'res-1',
  kind: 'class_recording',
  title: 'Class on 3 Oct 2026: Human on Streets',
  duration_seconds: 3600,
  library_video_id: null,
  source_class_id: 'src-class',
};

const call = () =>
  GET(new NextRequest('http://localhost/api/timetable/cls-1/prewatch/res-1/play', { headers: { Authorization: 'Bearer t' } }), {
    params: { classId: 'cls-1', resourceId: 'res-1' },
  });

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  access.mockReset();
  loadPrewatchRow.mockReset().mockResolvedValue(recordingRow);
  isPrewatchEnabled.mockReset().mockResolvedValue(true);
  grantVideoAccess.mockReset().mockResolvedValue({ src: '/api/media/recording?vt=abc', expiresAt: '2026-10-10T10:10:00Z' });
  isProtectedVideoEnabled.mockReset().mockResolvedValue(true);
  getSharePointStreamUrl.mockReset().mockResolvedValue('https://neram.sharepoint.com/direct');
  startedPlainBeforeRecap.mockReset().mockResolvedValue(false);
  tables.nexus_scheduled_classes = {
    id: 'src-class',
    status: 'completed',
    recording_url: 'https://neram.sharepoint.com/sites/x/rec.mp4',
    youtube_url: 'https://youtu.be/dQw4w9WgXcQ',
  };
  tables.nexus_class_video_views = { furthest_seconds: 420 };
});

describe('GET prewatch play', () => {
  it('refuses a student who is not enrolled in the target class', async () => {
    access.mockResolvedValue({ error: NextResponse.json({ error: 'Not enrolled' }, { status: 403 }) });
    expect((await call()).status).toBe(403);
    expect(grantVideoAccess).not.toHaveBeenCalled();
  });

  it('lets an enrolled student play another classroom’s recording, granted for the SOURCE class', async () => {
    grantAccess();
    const res = await call();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ mode: 'html5', src: '/api/media/recording?vt=abc', protected: true, resumeAt: 420 });
    expect(grantVideoAccess.mock.calls[0][0]).toMatchObject({ scope: 'class', refId: 'src-class', userId: 'stu-1' });
    expect(loadPrewatchRow).toHaveBeenCalledWith(expect.anything(), 'cls-1', 'res-1');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('is a 404 when the row is not a prewatch video on this class', async () => {
    grantAccess();
    loadPrewatchRow.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
    expect(grantVideoAccess).not.toHaveBeenCalled();
  });

  it('is a 404 for a student while the feature is off, or the class is a draft', async () => {
    grantAccess();
    isPrewatchEnabled.mockResolvedValue(false);
    expect((await call()).status).toBe(404);

    isPrewatchEnabled.mockResolvedValue(true);
    grantAccess(student, { publish_state: 'draft' });
    expect((await call()).status).toBe(404);
  });

  it('sends a student who missed the source class to its catch-up', async () => {
    grantAccess();
    tables.nexus_class_absences = { caught_up_at: null, excused_at: null };
    tables.nexus_class_recaps = { id: 'recap-1' };
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).catchup_url).toBe('/student/timetable/src-class/catch-up');
    expect(grantVideoAccess).not.toHaveBeenCalled();
  });

  it('falls back to the YouTube copy when SharePoint fails', async () => {
    grantAccess();
    grantVideoAccess.mockRejectedValue(new Error('MEDIA_NOT_FOUND'));
    const body = await (await call()).json();
    expect(body).toMatchObject({ mode: 'youtube', youtubeId: 'dQw4w9WgXcQ' });
  });

  it('plays a published Library video by its YouTube id, and 404s an unpublished one', async () => {
    grantAccess();
    loadPrewatchRow.mockResolvedValue({ ...recordingRow, kind: 'library_video', library_video_id: 'lib-1', source_class_id: null });
    tables.library_videos = { youtube_video_id: 'abcdefghijk', is_published: true };
    expect(await (await call()).json()).toMatchObject({ mode: 'youtube', youtubeId: 'abcdefghijk' });

    tables.library_videos = { youtube_video_id: 'abcdefghijk', is_published: false };
    expect((await call()).status).toBe(404);
  });

  it('gives staff the direct URL, even with the feature off', async () => {
    grantAccess(teacher);
    isPrewatchEnabled.mockResolvedValue(false);
    const body = await (await call()).json();
    expect(body).toMatchObject({ mode: 'html5', src: 'https://neram.sharepoint.com/direct', protected: false });
    expect(grantVideoAccess).not.toHaveBeenCalled();
  });
});

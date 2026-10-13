import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * GET/PUT /api/timetable/[classId]/prewatch. What this pins: a student sees
 * only their own progress (and nothing while switched off or on a draft), staff
 * get the roll-up over the class roster, only staff who run the class may
 * change the list, and a stale pick is a 400 a teacher can read.
 */

const access = vi.fn();
const loadPrewatch = vi.fn();
const reconcilePrewatch = vi.fn();
const isPrewatchEnabled = vi.fn();

vi.mock('@/lib/ms-verify', () => ({ verifyMsToken: async () => ({ oid: 'oid-1' }) }));
vi.mock('@neram/database', () => ({ getSupabaseAdminClient: () => ({}) }));
vi.mock('@/lib/class-staff-access', () => ({ resolveClassStaffAccess: (...a: unknown[]) => access(...a) }));
vi.mock('@/lib/prewatch-server', async () => {
  const actual = await vi.importActual<typeof import('@/lib/prewatch-server')>('@/lib/prewatch-server');
  return {
    PrewatchError: actual.PrewatchError,
    loadPrewatch: (...a: unknown[]) => loadPrewatch(...a),
    reconcilePrewatch: (...a: unknown[]) => reconcilePrewatch(...a),
    isPrewatchEnabled: () => isPrewatchEnabled(),
  };
});

import { GET, PUT } from './route';
import { PrewatchError } from '@/lib/prewatch-server';

type TestUser = { id: string; user_type: string; staff_role: string | null; can_teach: boolean };
const student: TestUser = { id: 'stu-1', user_type: 'student', staff_role: null, can_teach: false };
const teacher: TestUser = { id: 't-1', user_type: 'teacher', staff_role: 'teacher', can_teach: true };

function as(user: TestUser, canEdit: boolean, publish_state = 'published') {
  access.mockResolvedValue({ userId: user.id, user, canEdit, cls: { classroom_id: 'room-1', teacher_id: 't-1', publish_state } });
}

const ctx = { params: { classId: 'cls-1' } };
const get = (qs = '') =>
  GET(new NextRequest(`http://localhost/api/timetable/cls-1/prewatch${qs}`, { headers: { Authorization: 'Bearer t' } }), ctx);
const put = (body: unknown) =>
  PUT(
    new NextRequest('http://localhost/api/timetable/cls-1/prewatch', {
      method: 'PUT',
      headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    ctx,
  );

beforeEach(() => {
  access.mockReset();
  loadPrewatch.mockReset().mockResolvedValue({ items: [{ id: 'r1' }] });
  reconcilePrewatch.mockReset().mockResolvedValue(undefined);
  isPrewatchEnabled.mockReset().mockResolvedValue(true);
});

describe('GET', () => {
  it('gives a student their own progress', async () => {
    as(student, false);
    const body = await (await get()).json();
    expect(body.items).toEqual([{ id: 'r1' }]);
    expect(loadPrewatch).toHaveBeenCalledWith(expect.anything(), 'cls-1', { studentId: 'stu-1' });
  });

  it('shows a student nothing while switched off, or on a draft class', async () => {
    as(student, false);
    isPrewatchEnabled.mockResolvedValue(false);
    expect((await (await get()).json()).items).toEqual([]);

    isPrewatchEnabled.mockResolvedValue(true);
    as(student, false, 'draft');
    expect((await (await get()).json()).items).toEqual([]);
    expect(loadPrewatch).not.toHaveBeenCalled();
  });

  it('gives staff the roll-up over the classroom, with detail on request', async () => {
    as(teacher, true);
    await get('?detail=1');
    expect(loadPrewatch).toHaveBeenCalledWith(expect.anything(), 'cls-1', { classroomId: 'room-1', detail: true });
  });
});

describe('PUT', () => {
  it('is refused for a student', async () => {
    as(student, false);
    expect((await put({ items: [] })).status).toBe(403);
    expect(reconcilePrewatch).not.toHaveBeenCalled();
  });

  it('is refused while switched off', async () => {
    as(teacher, true);
    isPrewatchEnabled.mockResolvedValue(false);
    expect((await put({ items: [] })).status).toBe(409);
  });

  it('saves the cleaned list in order', async () => {
    as(teacher, true);
    const res = await put({ items: [{ kind: 'class_recording', id: 'c2' }, { kind: 'library_video', id: 'v1' }, { kind: 'bogus', id: 'x' }] });
    expect(res.status).toBe(200);
    expect(reconcilePrewatch).toHaveBeenCalledWith(
      expect.anything(),
      'cls-1',
      [
        { kind: 'class_recording', id: 'c2' },
        { kind: 'library_video', id: 'v1' },
      ],
      't-1',
    );
  });

  it('turns a stale pick into a 400 the teacher can read', async () => {
    as(teacher, true);
    reconcilePrewatch.mockRejectedValue(new PrewatchError('One of the Library videos is no longer available.'));
    const res = await put({ items: [{ kind: 'library_video', id: 'gone' }] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no longer available/);
  });

  it('needs an items list', async () => {
    as(teacher, true);
    expect((await put({})).status).toBe(400);
  });
});

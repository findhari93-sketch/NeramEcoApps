// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * The Remind button on the Attended tab. What matters:
 *  - only students who are enrolled, CAME, and still owe the homework are messaged,
 *    whatever list the browser sent;
 *  - the message carries the teacher's name (they pressed it) and names what is owed;
 *  - a 3-day plan starts by default, and not when the teacher switched it off;
 *  - Stop ends the plans.
 */

const mocks = vi.hoisted(() => ({
  tables: {} as Record<string, any[]>,
  sendNudge: vi.fn(),
  startPlans: vi.fn(),
  stopPlans: vi.fn(),
  record: vi.fn(),
  canUser: vi.fn(),
  loadClassWork: vi.fn(),
}));

function builder(table: string) {
  const b: any = {};
  for (const m of ['select', 'eq', 'in', 'is', 'lte', 'order', 'limit']) b[m] = () => b;
  b.maybeSingle = async () => ({ data: mocks.tables[table]?.[0] ?? null, error: null });
  b.then = (resolve: (v: unknown) => void) => resolve({ data: mocks.tables[table] ?? [], error: null });
  return b;
}

vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({ from: (t: string) => builder(t) }),
  istTodayYmd: () => '2026-09-24',
  recordAssignmentReminder: mocks.record,
}));
vi.mock('@/lib/ms-verify', () => ({ verifyMsToken: async () => ({ oid: 'oid-teacher' }) }));
vi.mock('@/lib/staff-capabilities', () => ({ canUser: mocks.canUser }));
vi.mock('@/lib/class-work', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/class-work')>()),
  loadClassWork: mocks.loadClassWork,
}));
vi.mock('@/lib/homework-reminder-store', () => ({ startPlans: mocks.startPlans, stopPlans: mocks.stopPlans }));
vi.mock('@/lib/nudge-delivery', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/nudge-delivery')>()),
  sendNudge: mocks.sendNudge,
}));

import { PATCH, POST } from './route';

const CLASS = 'class-1';
const post = (body: unknown) =>
  POST(
    new NextRequest(`http://localhost:3022/api/timetable/${CLASS}/homework-reminders`, {
      method: 'POST',
      headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: { classId: CLASS } },
  );

const HW = { id: 'hw-1', title: 'Perspective study', timing: 'homework' as const, due_at: null };

beforeEach(() => {
  mocks.tables = {
    users: [{ id: 'teacher-1', name: 'Hari', user_type: 'teacher', staff_role: 'teacher', can_teach: true }],
    nexus_scheduled_classes: [{ id: CLASS, title: 'Basic 3D shapes', scheduled_date: '2026-09-15', classroom_id: 'room-1' }],
    // came-owes and came-done are enrolled; absent-1 is enrolled but missed the class.
    nexus_enrollments: [{ user_id: 'came-owes' }, { user_id: 'came-done' }, { user_id: 'absent-1' }],
    nexus_attendance: [{ student_id: 'came-owes' }, { student_id: 'came-done' }],
  };
  mocks.canUser.mockReset().mockReturnValue(true);
  mocks.loadClassWork.mockReset().mockResolvedValue({
    assignments: [HW],
    subs: new Map([['hw-1:came-done', [{ assignment_id: 'hw-1', student_id: 'came-done', submitted_at: '2026-09-16', status: 'submitted' }]]]),
  });
  mocks.sendNudge.mockReset().mockImplementation(async (input: any) => ({
    results: input.studentIds.map((id: string) => ({ studentId: id, name: null, chat: true, teams: false, inapp: true, ok: true, channel: 'chat+inapp' })),
    counts: { total: input.studentIds.length, chat: input.studentIds.length, teams: 0, inapp: input.studentIds.length, failed: 0, skipped: 0, unreached: 0 },
  }));
  mocks.startPlans.mockReset().mockResolvedValue(undefined);
  mocks.stopPlans.mockReset().mockResolvedValue(1);
  mocks.record.mockReset().mockResolvedValue(undefined);
});

describe('POST homework-reminders', () => {
  it('messages only who came and still owes it, from the teacher, and starts the 3-day plan', async () => {
    const res = await post({ classroom_id: 'room-1', studentIds: ['came-owes', 'came-done', 'absent-1'] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ reminded: 1, skipped: 2, repeat: { everyDays: 3, nextOn: '2026-09-27' } });

    expect(mocks.sendNudge).toHaveBeenCalledTimes(1);
    const [input] = mocks.sendNudge.mock.calls[0];
    expect(input.studentIds).toEqual(['came-owes']);
    expect(input.teacher).toMatchObject({ userId: 'teacher-1' });
    expect(input.personalise).toEqual({ 'came-owes': { homework: '"Perspective study"' } });
    expect(input.plain).toContain('you came to Basic 3D shapes');
    expect(input.plain).toContain('/student/assignments/hw-1');
    expect(input.eventType).toBe('assignment_nudge');
    expect(JSON.stringify(input)).not.toMatch(/—|--/);

    expect(mocks.startPlans).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ classId: CLASS, everyDays: 3, nextOn: '2026-09-27', startedBy: 'teacher-1', sends: [{ studentId: 'came-owes', channel: 'chat+inapp' }] }),
    );
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ assignment_id: 'hw-1', student_id: 'came-owes', template: 'homework_came' }));
  });

  it('sends once without a plan when the teacher switched repeating off', async () => {
    const body = await (await post({ classroom_id: 'room-1', studentIds: ['came-owes'], repeat: false })).json();
    expect(body.repeat).toBeNull();
    expect(mocks.sendNudge).toHaveBeenCalledTimes(1);
    expect(mocks.startPlans).not.toHaveBeenCalled();
  });

  it('uses the teacher\'s own words when given', async () => {
    await post({ classroom_id: 'room-1', studentIds: ['came-owes'], message: 'Please send it tonight.' });
    expect(mocks.sendNudge.mock.calls[0][0].plain).toMatch(/^Please send it tonight\./);
  });

  it('refuses when nobody picked still owes it', async () => {
    const res = await post({ classroom_id: 'room-1', studentIds: ['came-done', 'absent-1'] });
    expect(res.status).toBe(400);
    expect(mocks.sendNudge).not.toHaveBeenCalled();
  });

  it('refuses a class with no homework, and a caller who cannot nudge', async () => {
    mocks.loadClassWork.mockResolvedValue({ assignments: [], subs: new Map() });
    expect((await post({ classroom_id: 'room-1', studentIds: ['came-owes'] })).status).toBe(400);
    mocks.canUser.mockReturnValue(false);
    expect((await post({ classroom_id: 'room-1', studentIds: ['came-owes'] })).status).toBe(403);
    expect(mocks.sendNudge).not.toHaveBeenCalled();
  });
});

describe('PATCH homework-reminders', () => {
  it('stops the class\'s running plans', async () => {
    const res = await PATCH(
      new NextRequest(`http://localhost:3022/api/timetable/${CLASS}/homework-reminders`, {
        method: 'PATCH',
        headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
        body: JSON.stringify({ classroom_id: 'room-1', action: 'stop' }),
      }),
      { params: { classId: CLASS } },
    );
    expect(await res.json()).toEqual({ stopped: 1 });
    expect(mocks.stopPlans).toHaveBeenCalledWith(expect.anything(), { classId: CLASS, studentIds: null, stoppedBy: 'teacher-1' });
  });
});

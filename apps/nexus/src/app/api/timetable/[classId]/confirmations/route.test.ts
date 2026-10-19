// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { fakeDb } from '@/lib/assistant/testing/fake-db';

/**
 * Confirm who is coming. What matters:
 *  - status is derived (away, not coming, coming, no reply, not asked), so a
 *    reason filed anywhere takes a student off the call list;
 *  - Ask messages only expected students who have not answered, from the staff
 *    member's name, links to the one-tap page, and claims the row first;
 *  - Record and Log call write what the office was told;
 *  - phone numbers only reach staff who may mark attendance.
 */

const mocks = vi.hoisted(() => ({
  db: null as any,
  roster: [] as any[],
  caps: new Set<string>(),
  sendNudge: vi.fn(),
}));

vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => mocks.db,
  istTodayYmd: () => '2026-10-19',
  loadClassroomRoster: async (_id: string, opts: any) => ({
    members: mocks.roster.map((m) => ({
      user_id: m.id,
      batch_id: null,
      enrolled_at: '2025-01-01',
      user: { id: m.id, name: m.name, avatar_url: null, ...(opts?.userColumns ? { phone: m.phone } : {}) },
    })),
  }),
}));
vi.mock('@/lib/ms-verify', () => ({ verifyMsToken: async () => ({ oid: 'oid-staff' }) }));
vi.mock('@/lib/staff-capabilities', () => ({ canUser: (_u: unknown, cap: string) => mocks.caps.has(cap) }));
vi.mock('@/lib/nudge-delivery', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/nudge-delivery')>()),
  sendNudge: mocks.sendNudge,
}));

import { GET, POST } from './route';

const CLASS = 'class-1';
const ROOM = 'room-1';
const url = `http://localhost:3012/api/timetable/${CLASS}/confirmations`;

const get = () =>
  GET(new NextRequest(`${url}?classroom_id=${ROOM}`, { headers: { Authorization: 'Bearer t' } }), {
    params: { classId: CLASS },
  });
const post = (body: Record<string, unknown>) =>
  POST(
    new NextRequest(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
      body: JSON.stringify({ classroom_id: ROOM, ...body }),
    }),
    { params: { classId: CLASS } },
  );
const confirmRow = (id: string) =>
  mocks.db.rows('nexus_attendance_confirmations').find((r: any) => r.student_id === id);

beforeEach(() => {
  mocks.roster = [
    { id: 'asha', name: 'Asha', phone: '9000000001' },
    { id: 'bala', name: 'Bala', phone: '9000000002' },
    { id: 'chitra', name: 'Chitra', phone: null },
    { id: 'dev', name: 'Dev', phone: '9000000004' },
    { id: 'esha', name: 'Esha', phone: '9000000005' },
  ];
  mocks.db = fakeDb({
    users: [
      { id: 'staff-1', ms_oid: 'oid-staff', name: 'Office Priya', user_type: 'teacher', staff_role: 'teacher', can_teach: true },
      { id: 'dev', name: 'Dev' },
      { id: 'bala', name: 'Bala' },
    ],
    nexus_scheduled_classes: [
      {
        id: CLASS,
        title: 'Building materials',
        scheduled_date: '2026-10-19',
        start_time: '19:00:00',
        end_time: '20:30:00',
        batch_id: null,
        status: 'scheduled',
        classroom_id: ROOM,
      },
    ],
    nexus_enrollments: mocks.roster.map((m) => ({ user_id: m.id, classroom_id: ROOM, role: 'student', is_active: true })),
    nexus_student_away_windows: [
      {
        id: 'w1',
        student_id: 'asha',
        starts_on: '2026-10-18',
        ends_on: '2026-10-24',
        reason_code: 'clash',
        reason_note: null,
        cancelled_at: null,
        review_on: '2026-10-24',
        source: 'student',
      },
    ],
    nexus_class_rsvp: [
      { scheduled_class_id: CLASS, student_id: 'bala', response: 'not_attending', reason_code: 'unwell', reason: null },
    ],
    nexus_attendance_confirmations: [
      {
        scheduled_class_id: CLASS,
        student_id: 'chitra',
        asked_at: '2026-10-19T05:00:00Z',
        confirmed_at: '2026-10-19T06:00:00Z',
        confirmed_by: null,
        call_count: 0,
      },
      { scheduled_class_id: CLASS, student_id: 'dev', asked_at: '2026-10-19T05:00:00Z', confirmed_at: null, call_count: 0 },
    ],
  });
  mocks.caps = new Set(['coord.attendance.view', 'teach.attendance.mark', 'coord.nudge']);
  mocks.sendNudge.mockReset().mockImplementation(async (input: any) => ({
    results: input.studentIds.map((id: string) => ({
      studentId: id,
      name: null,
      chat: true,
      teams: false,
      inapp: true,
      ok: true,
      channel: 'chat+inapp',
    })),
    counts: {
      total: input.studentIds.length,
      chat: input.studentIds.length,
      teams: 0,
      inapp: input.studentIds.length,
      failed: 0,
      skipped: 0,
      unreached: 0,
    },
  }));
});

describe('GET confirmations', () => {
  it('derives every status and counts them', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    const status = Object.fromEntries(body.students.map((s: any) => [s.id, s.status]));
    expect(status).toEqual({ asha: 'away', bala: 'not_coming', chitra: 'coming', dev: 'no_reply', esha: 'not_asked' });
    expect(body.counts).toEqual({ away: 1, not_coming: 1, coming: 1, no_reply: 1, not_asked: 1 });
    expect(body.students.find((s: any) => s.id === 'bala').reason).toBe('Feeling unwell');
    expect(body.open).toBe(true);
  });

  it('shows phone numbers only to staff who may mark attendance', async () => {
    expect((await (await get()).json()).students.find((s: any) => s.id === 'dev').phone).toBe('9000000004');
    mocks.caps.delete('teach.attendance.mark');
    const body = await (await get()).json();
    expect(body.students.every((s: any) => s.phone === null)).toBe(true);
    expect(body.can_record).toBe(false);
  });

  it('refuses a caller without the attendance view, as 403 not 500', async () => {
    mocks.caps.clear();
    expect((await get()).status).toBe(403);
  });
});

describe('POST ask', () => {
  it('messages only the unanswered, from staff, linking the one-tap page', async () => {
    const res = await post({ action: 'ask', studentIds: ['asha', 'bala', 'chitra', 'esha', 'stranger'] });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ asked: 1, skipped: 4 });

    expect(mocks.sendNudge).toHaveBeenCalledTimes(1);
    const input = mocks.sendNudge.mock.calls[0][0];
    expect(input.studentIds).toEqual(['esha']);
    expect(input.eventType).toBe('attendance_confirm');
    expect(input.teacher).toMatchObject({ userId: 'staff-1' });
    expect(input.plain).toContain('/student/rsvp/class-1?ask=1');
    expect(input.plain).toContain('{firstName}');
    expect(input.plain).toContain('today at 7 PM');

    expect(confirmRow('esha')).toMatchObject({ asked_by: 'staff-1', channel: 'chat+inapp', classroom_id: ROOM });
  });

  it('skips someone asked in the last three hours', async () => {
    confirmRow('dev').asked_at = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const res = await post({ action: 'ask', studentIds: ['dev'] });
    expect(res.status).toBe(400);
    expect(mocks.sendNudge).not.toHaveBeenCalled();
  });

  it('needs nudge permission', async () => {
    mocks.caps.delete('coord.nudge');
    expect((await post({ action: 'ask', studentIds: ['esha'] })).status).toBe(403);
  });

  it('refuses a class that is over', async () => {
    mocks.db.rows('nexus_scheduled_classes')[0].scheduled_date = '2026-10-18';
    expect((await post({ action: 'ask', studentIds: ['esha'] })).status).toBe(400);
    expect(mocks.sendNudge).not.toHaveBeenCalled();
  });
});

describe('POST record and call', () => {
  it('records a yes told on the phone, by staff, and clears an earlier opt-out', async () => {
    const res = await post({ action: 'record', studentId: 'bala', answer: 'coming' });
    expect(res.status).toBe(200);
    expect(mocks.db.rows('nexus_class_rsvp')).toHaveLength(0);
    expect(confirmRow('bala').confirmed_by).toBe('staff-1');
    const body = await (await get()).json();
    expect(body.students.find((s: any) => s.id === 'bala')).toMatchObject({
      status: 'coming',
      confirmed_by_name: 'Office Priya',
    });
  });

  it('records a reason for one class, which takes them off the call list', async () => {
    const res = await post({ action: 'record', studentId: 'dev', answer: 'not_coming', reason_code: 'family' });
    expect(res.status).toBe(200);
    const body = await (await get()).json();
    expect(body.students.find((s: any) => s.id === 'dev').status).toBe('not_coming');
    expect(body.counts.no_reply).toBe(0);
  });

  it('asks for a reason on not coming, and a note on Other', async () => {
    expect((await post({ action: 'record', studentId: 'dev', answer: 'not_coming' })).status).toBe(400);
    expect((await post({ action: 'record', studentId: 'dev', answer: 'not_coming', reason_code: 'other' })).status).toBe(400);
  });

  it('logs call attempts and counts them', async () => {
    await post({ action: 'call', studentId: 'dev', note: 'No answer' });
    await post({ action: 'call', studentId: 'dev', note: 'Switched off' });
    expect(confirmRow('dev')).toMatchObject({ call_count: 2, call_note: 'Switched off', last_called_by: 'staff-1' });
    const body = await (await get()).json();
    expect(body.students.find((s: any) => s.id === 'dev')).toMatchObject({
      status: 'no_reply',
      last_called_by_name: 'Office Priya',
    });
  });

  it('needs attendance permission to record or log a call', async () => {
    mocks.caps.delete('teach.attendance.mark');
    expect((await post({ action: 'record', studentId: 'dev', answer: 'coming' })).status).toBe(403);
    expect((await post({ action: 'call', studentId: 'dev' })).status).toBe(403);
  });
});

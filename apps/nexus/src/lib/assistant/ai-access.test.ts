// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getCatchupBacklog: vi.fn(), getStudentPrimaryClassroom: vi.fn() }));
vi.mock('@neram/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@neram/database')>()),
  getCatchupBacklog: mocks.getCatchupBacklog,
  getSupabaseAdminClient: () => ({}),
}));
vi.mock('@neram/database/queries/nexus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@neram/database/queries/nexus')>()),
  getStudentPrimaryClassroom: mocks.getStudentPrimaryClassroom,
}));
vi.mock('@/lib/upcoming-classes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/upcoming-classes')>()),
  istNow: () => ({ today: '2026-10-03', nowHHMM: '10:00' }),
}));

import { fakeDb } from './testing/fake-db';
import {
  buildAiStatus, clampDailyLimit, clearOverrides, decideAiAccess, loadAiAccess, readDailyLimit, setOverride, teacherAccessLine, type OverrideRow,
} from './ai-access';

const TODAY = '2026-10-03';
const NOW = new Date('2026-10-03T04:30:00Z');
const item = (status: string, title = 'Perspective', date = '2026-10-01') => ({ status, class: { title, scheduled_date: date } });
const backlog = (over: Record<string, unknown> = {}) => ({ journey: null, items: [], missed: [], backlog: [], totals: { total: 0, completed: 0, blocked: 0, pendingTeacher: 0 }, ...over }) as any;
const ov = (over: Partial<OverrideRow> = {}): OverrideRow => ({ id: 'o1', student_id: 's1', mode: 'off', reason: 'Misuse', set_by: 't1', set_at: '2026-10-02T10:00:00Z', ends_on: null, cleared_at: null, cleared_by: null, ...over });
const decide = (over: Partial<Parameters<typeof decideAiAccess>[0]> = {}) => decideAiAccess({ inPilot: true, classroomId: 'c1', override: null, backlog: null, today: TODAY, ...over });

describe('decideAiAccess', () => {
  it('is on when there is nothing to catch up on', () => {
    expect(decide()).toMatchObject({ on: true, reason: 'caught_up', link: null });
  });

  it('is off outside the pilot and without a classroom', () => {
    expect(decide({ inPilot: false })).toMatchObject({ on: false, reason: 'not_in_pilot' });
    expect(decide({ classroomId: null })).toMatchObject({ on: false, reason: 'no_classroom' });
  });

  it('switches off for a missed class whose catch-up is ready, naming it', () => {
    const a = decide({ backlog: backlog({ missed: [item('waiting')] }) });
    expect(a).toMatchObject({ on: false, reason: 'missed_class', missedCount: 1, link: { label: 'Catch-up', url: '/student/catch-up' } });
    expect(a.sentence).toBe('AI answers are off. Catch up on Perspective (1 Oct) to switch them back on.');
    expect(decide({ backlog: backlog({ missed: [item('active')] }) }).on).toBe(false);
  });

  it('names the first of several, with the count', () => {
    const a = decide({ backlog: backlog({ missed: [item('waiting', 'Perspective', '2026-09-29'), item('waiting', 'Shading', '2026-10-01'), item('done', 'Old')] }) });
    expect(a.sentence).toBe('AI answers are off. Catch up on 2 classes, starting with Perspective (29 Sep), to switch them back on.');
  });

  it('never counts a catch-up that is not ready, excused, blocked or done (Review Focus 3)', () => {
    for (const s of ['pending_teacher', 'blocked', 'excused', 'done']) {
      expect(decide({ backlog: backlog({ missed: [item(s)] }) })).toMatchObject({ on: true, reason: 'caught_up' });
    }
  });

  it('switches off a late joiner who is behind pace, on when on track', () => {
    // Started 3 full weeks ago at 2 a week: 6 expected, 4 done.
    const behind = backlog({ journey: { started_on: '2026-09-12', weekly_quota: 2 }, backlog: [item('waiting')], totals: { total: 20, completed: 4, blocked: 0, pendingTeacher: 0 } });
    expect(decide({ backlog: behind })).toMatchObject({ on: false, reason: 'behind_pace', deficit: 2 });
    expect(decide({ backlog: behind }).sentence).toBe('AI answers are off. You are 2 classes behind on your earlier classes. Clear them this week to switch AI answers back on.');
    const onTrack = { ...behind, totals: { ...behind.totals, completed: 6 } };
    expect(decide({ backlog: onTrack })).toMatchObject({ on: true, reason: 'caught_up' });
  });

  it('lets a teacher override either way, and the override beats the catch-up rule', () => {
    const owing = backlog({ missed: [item('waiting')] });
    expect(decide({ backlog: owing, override: ov({ mode: 'on', reason: 'Was ill' }) })).toMatchObject({ on: true, reason: 'teacher_on' });
    const off = decide({ override: ov({ mode: 'off' }) });
    expect(off).toMatchObject({ on: false, reason: 'teacher_off' });
    expect(off.sentence).toBe('AI answers are off for your account. Ask your teacher if you think this is a mistake.');
    expect(off.sentence).not.toMatch(/Misuse/);
  });
});

describe('activeOverride, setOverride, clearOverrides (via loadAiAccess)', () => {
  beforeEach(() => {
    mocks.getStudentPrimaryClassroom.mockReset().mockResolvedValue({ id: 'c1', name: 'Batch' });
    mocks.getCatchupBacklog.mockReset().mockResolvedValue(backlog({ missed: [item('waiting')] }));
  });
  const settings = { nexus_settings: [{ key: 'assistant_pilot_user_ids', value: [] }] };

  it('ignores an override that has ended or was cleared; the newest active one wins (Review Focus 3)', async () => {
    const db = fakeDb({ ...settings, nexus_assistant_ai_overrides: [
      ov({ id: 'old', mode: 'on', set_at: '2026-09-01T00:00:00Z', ends_on: '2026-10-02' }),
      ov({ id: 'gone', mode: 'on', set_at: '2026-10-01T00:00:00Z', cleared_at: '2026-10-02T00:00:00Z' }),
    ] });
    expect((await loadAiAccess(db, 's1', NOW)).reason).toBe('missed_class');
    const db2 = fakeDb({ ...settings, nexus_assistant_ai_overrides: [
      ov({ id: 'a', mode: 'off', set_at: '2026-09-30T00:00:00Z' }),
      ov({ id: 'b', mode: 'on', set_at: '2026-10-02T00:00:00Z', ends_on: TODAY }),
    ] });
    expect((await loadAiAccess(db2, 's1', NOW)).reason).toBe('teacher_on');
  });

  it('setOverride clears the active one first and keeps history (D10); clearOverrides stamps who and when', async () => {
    const db = fakeDb({ nexus_assistant_ai_overrides: [ov({ id: 'a', mode: 'off' })] });
    const row = await setOverride(db, { studentId: 's1', mode: 'on', reason: '  Was ill  ', endsOn: '2026-10-20', setBy: 't2', now: NOW });
    expect(row).toMatchObject({ mode: 'on', reason: 'Was ill', set_by: 't2', ends_on: '2026-10-20', cleared_at: null });
    expect(db.rows('nexus_assistant_ai_overrides').find((r) => r.id === 'a')).toMatchObject({ cleared_by: 't2' });
    expect(await clearOverrides(db, 's1', 't3', NOW)).toBe(1);
    expect(db.rows('nexus_assistant_ai_overrides').every((r) => r.cleared_at)).toBe(true);
  });

  it('reads the pilot list: a student outside a non-empty list is off', async () => {
    const db = fakeDb({ nexus_settings: [{ key: 'feature_flags', value: { 'student.assistant-chat': true } }, { key: 'assistant_pilot_user_ids', value: ['someone-else'] }] });
    expect((await loadAiAccess(db, 's1', NOW)).reason).toBe('not_in_pilot');
  });
});

describe('the allowance', () => {
  it('clamps to 0..50 and defaults to 10', async () => {
    expect(clampDailyLimit(undefined)).toBe(10);
    expect(clampDailyLimit('lots')).toBe(10);
    expect(clampDailyLimit(-3)).toBe(0);
    expect(clampDailyLimit(500)).toBe(50);
    expect(clampDailyLimit(7.6)).toBe(7);
    expect(await readDailyLimit(fakeDb({}))).toBe(10);
    expect(await readDailyLimit(fakeDb({ nexus_settings: [{ key: 'assistant_ai_daily_limit', value: 4 }] }))).toBe(4);
  });

  it('buildAiStatus says how many are left today', async () => {
    mocks.getStudentPrimaryClassroom.mockResolvedValue({ id: 'c1', name: 'Batch' });
    mocks.getCatchupBacklog.mockResolvedValue(null);
    const db = fakeDb({
      nexus_settings: [{ key: 'assistant_ai_daily_limit', value: 10 }],
      nexus_assistant_threads: [{ id: 't1', user_id: 's1', channel: 'nexus', last_message_at: '2026-10-03T04:00:00Z' }],
      nexus_assistant_messages: [1, 2, 3].map((i) => ({ id: `m${i}`, thread_id: 't1', role: 'assistant', llm: true, created_at: '2026-10-03T04:00:00Z' })),
    });
    expect(await buildAiStatus(db, 's1', NOW)).toEqual({ on: true, reason: 'caught_up', sentence: 'AI answers: on, 7 left today.', link: null, left_today: 7, daily_limit: 10 });
  });

  it('says paused when the allowance is 0, and none left when used up', async () => {
    mocks.getCatchupBacklog.mockResolvedValue(null);
    mocks.getStudentPrimaryClassroom.mockResolvedValue({ id: 'c1', name: 'Batch' });
    expect((await buildAiStatus(fakeDb({ nexus_settings: [{ key: 'assistant_ai_daily_limit', value: 0 }] }), 's1', NOW)).sentence).toBe('AI answers are paused right now.');
  });
});

describe('teacherAccessLine', () => {
  it('words each reason for the teacher, including the override reason and end date', () => {
    expect(teacherAccessLine(decide())).toBe('On: all caught up.');
    expect(teacherAccessLine(decide({ backlog: backlog({ missed: [item('waiting')] }) }))).toBe('Off: 1 missed class to catch up, starting with Perspective (1 Oct).');
    expect(teacherAccessLine(decide({ override: ov({ mode: 'on', reason: 'Was ill', ends_on: '2026-10-20' }) }))).toBe('On: set by a teacher until 20 Oct (Was ill).');
    expect(teacherAccessLine(decide({ override: ov({ mode: 'off', reason: 'Misuse' }) }))).toBe('Off: set by a teacher (Misuse).');
  });
});

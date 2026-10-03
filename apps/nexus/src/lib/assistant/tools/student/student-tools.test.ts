// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadBriefFacts: vi.fn(),
  loadUpcomingClasses: vi.fn(),
  loadDeclinedClassIds: vi.fn(),
  listAssignmentsForStudent: vi.fn(),
  getCatchupBacklog: vi.fn(),
  loadOwnAttendance: vi.fn(),
  loadStudentRhythm: vi.fn(),
  resolveExamCountdown: vi.fn(),
}));

vi.mock('@/lib/assistant/brief-load', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/assistant/brief-load')>()),
  loadBriefFacts: mocks.loadBriefFacts,
  istHour: () => 10,
}));
vi.mock('@/lib/upcoming-classes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/upcoming-classes')>()),
  loadUpcomingClasses: mocks.loadUpcomingClasses,
  loadDeclinedClassIds: mocks.loadDeclinedClassIds,
  istNow: () => ({ today: '2026-10-03', nowHHMM: '10:00' }),
}));
vi.mock('@neram/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@neram/database')>()),
  listAssignmentsForStudent: mocks.listAssignmentsForStudent,
  getCatchupBacklog: mocks.getCatchupBacklog,
  getSupabaseAdminClient: () => ({}),
}));
vi.mock('@/lib/student-attendance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/student-attendance')>()),
  loadOwnAttendance: mocks.loadOwnAttendance,
}));
vi.mock('@/lib/sketchbook-payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/sketchbook-payload')>()),
  loadStudentRhythm: mocks.loadStudentRhythm,
}));
vi.mock('@/lib/exam-countdown-server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/exam-countdown-server')>()),
  resolveExamCountdown: mocks.resolveExamCountdown,
}));

import { TOOLS } from '@/lib/assistant/registry';
import '@/lib/assistant/tools/student';
import type { AssistantCaller, ToolContext } from '@/lib/assistant/types';

const caller: AssistantCaller = { id: 's1', name: 'Priya S', user_type: 'student', staff_role: null, can_teach: null, impersonating: false };
const ctx = (classroomId: string | null = 'c1'): ToolContext => ({
  caller, channel: 'nexus', mode: 'general', supabase: { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { batch_id: 'b1', enrolled_at: '2026-06-01' } }) }) }) }) }) },
  classroomId, threadId: 't1', now: new Date('2026-10-03T04:30:00Z'), baseUrl: 'https://nexus.test',
});
const tool = (name: string) => TOOLS.find((t) => t.name === name)!;

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.loadDeclinedClassIds.mockResolvedValue(new Set());
});

describe('student read tools', () => {
  it('are all registered for students only, as reads', () => {
    const names = ['my_brief', 'my_schedule', 'my_assignments', 'my_catchup', 'my_attendance', 'my_sketchbook', 'exam_countdown'];
    for (const n of names) expect(tool(n)).toMatchObject({ audience: 'student', kind: 'read' });
  });

  it('every tool says so when the student has no classroom', async () => {
    for (const n of ['my_schedule', 'my_assignments', 'my_catchup', 'my_attendance', 'exam_countdown']) {
      const out = await tool(n).run(ctx(null), {});
      expect(out.ok).toBe(true);
      expect(out.reply).toMatch(/not in a classroom yet/);
    }
  });

  it('my_brief joins the brief sections into one reply with their links', async () => {
    mocks.loadBriefFacts.mockResolvedValue({
      firstName: 'Priya', today: '2026-10-03', classroomName: 'JEE', nextClass: { id: 'k', title: 'Perspective', date: '2026-10-03', startTime: '18:00', endTime: '19:30', declined: false },
      assignments: { pending: 0, nextTitle: null, nextDueOn: null }, catchup: null, reviewsBack: 0, sketchbookLine: null, exam: null, remindersToday: [],
    });
    const out = await tool('my_brief').run(ctx(), {});
    expect(out.reply).toBe('Good morning, Priya. Class today at 6:00 pm: Perspective.');
    expect(out.links).toEqual([{ label: 'Timetable', url: '/student/timetable' }]);
  });

  it('my_schedule lists the next classes and marks a declined one', async () => {
    mocks.loadUpcomingClasses.mockResolvedValue([
      { id: 'a', title: 'Perspective', scheduled_date: '2026-10-03', start_time: '18:00', end_time: '19:30' },
      { id: 'b', title: 'Shading', scheduled_date: '2026-10-05', start_time: '18:00', end_time: '19:30' },
    ]);
    mocks.loadDeclinedClassIds.mockResolvedValue(new Set(['b']));
    const out = await tool('my_schedule').run(ctx(), {});
    expect(out.reply).toBe('Your next classes:\n1. Today, 6:00 pm to 7:30 pm: Perspective.\n2. Monday 5 Oct, 6:00 pm to 7:30 pm: Shading (you said you cannot attend).');
    expect(out.links?.[0].url).toBe('/student/timetable');
    mocks.loadUpcomingClasses.mockResolvedValue([]);
    expect((await tool('my_schedule').run(ctx(), {})).reply).toBe('No classes are scheduled in the next few days.');
  });

  it('my_assignments counts pending work and names due dates', async () => {
    mocks.listAssignmentsForStudent.mockResolvedValue([
      { id: '1', title: 'Shading sheet', due_at: '2026-10-05T18:00:00Z', submission: null },
      { id: '2', title: 'Done one', due_at: null, submission: { id: 'x' } },
      { id: '3', title: 'Plan drawing', due_at: null, submission: null },
    ]);
    const out = await tool('my_assignments').run(ctx(), {});
    expect(out.reply).toBe('You have 2 assignments to submit:\n1. Shading sheet, due Monday 5 Oct.\n2. Plan drawing, no due date.');
    mocks.listAssignmentsForStudent.mockResolvedValue([{ id: '2', title: 'Done', due_at: null, submission: { id: 'x' } }]);
    expect((await tool('my_assignments').run(ctx(), {})).reply).toBe('Nothing to submit right now. All your assignments are in.');
  });

  it('my_assignments shows the IST due date for a late-evening UTC timestamp', async () => {
    mocks.listAssignmentsForStudent.mockResolvedValue([
      { id: '1', title: 'Night sheet', due_at: '2026-10-05T20:00:00Z', submission: null },
    ]);
    const out = await tool('my_assignments').run(ctx(), {});
    expect(out.reply).toBe('You have 1 assignment to submit:\n1. Night sheet, due Tuesday 6 Oct.');
  });

  it('my_catchup reports open items and the pace sentence', async () => {
    mocks.getCatchupBacklog.mockResolvedValue({
      journey: { started_on: '2026-09-01', weekly_quota: 2 },
      totals: { total: 6, completed: 4 },
      items: [
        { caught_up_at: null, excused: false, class: { title: 'Perspective', scheduled_date: '2026-09-15' } },
        { caught_up_at: '2026-09-20T00:00:00Z', excused: false, class: { title: 'Done', scheduled_date: '2026-09-10' } },
      ],
    });
    const out = await tool('my_catchup').run(ctx(), {});
    expect(out.reply).toMatch(/^1 class to catch up on: Perspective \(15 Sep\)\. You are /);
    expect(out.links?.[0].url).toBe('/student/catch-up');
    mocks.getCatchupBacklog.mockResolvedValue(null);
    expect((await tool('my_catchup').run(ctx(), {})).reply).toBe('You have nothing to catch up on.');
  });

  it('my_attendance returns the shared sentence', async () => {
    mocks.loadOwnAttendance.mockResolvedValue({ sentence: 'You attended 12 of 14 measured classes.' });
    const out = await tool('my_attendance').run(ctx(), {});
    expect(out.reply).toBe('You attended 12 of 14 measured classes.');
    expect(mocks.loadOwnAttendance).toHaveBeenCalledWith('s1', { classroom_id: 'c1', batch_id: 'b1', enrolled_at: '2026-06-01' });
  });

  it('my_sketchbook returns the rhythm line', async () => {
    mocks.loadStudentRhythm.mockResolvedValue({ rhythm: { today: '2026-10-03', week: { start: '2026-09-28', days: [], count: 1, goal: 3, met: false }, lastWeek: null, run: 0, bestRun: 0, totalDays: 4, lastPracticeDate: '2026-10-01', quietDays: 2 } });
    const out = await tool('my_sketchbook').run(ctx(), {});
    expect(out.reply).toBe('1 of 3 days this week.');
    expect(out.links?.[0].url).toBe('/student/sketchbook');
  });

  it('exam_countdown speaks the headline and detail, or says no date is set', async () => {
    mocks.resolveExamCountdown.mockResolvedValue({ exam_date: '2027-02-14', confidence: 'confirmed', source: 'exam_registry', exam_type: 'nata', phase: null, exam_year: 2027, label: 'NATA 2027', note: null, plan: null, is_personal: false, prep_started_on: null });
    const out = await tool('exam_countdown').run(ctx(), {});
    expect(out.reply).toMatch(/to go/);
    mocks.resolveExamCountdown.mockResolvedValue(null);
    expect((await tool('exam_countdown').run(ctx(), {})).reply).toBe('No exam date is set for your class yet. Your teacher will add it.');
  });
});

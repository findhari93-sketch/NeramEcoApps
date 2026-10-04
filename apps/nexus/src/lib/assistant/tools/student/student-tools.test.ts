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
  searchInspiration: vi.fn(),
  getCatchupJourney: vi.fn(),
  getStudentPrimaryClassroom: vi.fn(),
  loadReviewsBack: vi.fn(),
}));

vi.mock('@/lib/assistant/brief-load', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/assistant/brief-load')>()),
  loadBriefFacts: mocks.loadBriefFacts,
  istHour: () => 10,
}));
vi.mock('@neram/database/queries/nexus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@neram/database/queries/nexus')>()),
  searchInspiration: mocks.searchInspiration,
  getCatchupJourney: mocks.getCatchupJourney,
  getStudentPrimaryClassroom: mocks.getStudentPrimaryClassroom,
}));
vi.mock('@/lib/assistant/reviews-back', () => ({ loadReviewsBack: mocks.loadReviewsBack }));
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
  features: { sketchbook: true, attendance: true, tests: true, questionBank: true, inspiration: true },
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

  it('the sketchbook and attendance reads name the feature they lead into (Ruling 25)', () => {
    expect(tool('my_sketchbook').feature).toBe('sketchbook');
    expect(tool('my_attendance').feature).toBe('attendance');
    for (const n of ['my_brief', 'my_schedule', 'my_assignments', 'my_catchup', 'exam_countdown']) expect(tool(n).feature).toBeUndefined();
  });

  it('my_brief loads the facts with the features of the caller, so a hidden sketchbook has no line', async () => {
    mocks.loadBriefFacts.mockResolvedValue({
      firstName: 'Priya', today: '2026-10-03', classroomName: 'JEE', nextClass: null,
      assignments: { pending: 0, nextTitle: null, nextDueOn: null }, catchup: null, reviewsBack: 0, sketchbookLine: null, exam: null, remindersToday: [],
    });
    await tool('my_brief').run({ ...ctx(), features: { sketchbook: false, attendance: true, tests: true, questionBank: true, inspiration: true } }, {});
    expect(mocks.loadBriefFacts).toHaveBeenCalledWith(expect.anything(), 's1', expect.any(Date), { sketchbook: false, attendance: true, tests: true, questionBank: true, inspiration: true });
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

describe('M2 student tools', () => {
  it('my_reviews lists reviews back with links to each drawing', async () => {
    mocks.loadReviewsBack.mockResolvedValue({ count: 2, items: [
      { id: 'd1', kind: 'Homework', words: 'reviewed, 4 stars', reviewedOn: '2026-10-02' },
      { id: 'd2', kind: 'Sketch', words: 'reviewed', reviewedOn: '2026-10-01' },
    ] });
    const out = await tool('my_reviews').run(ctx(), {});
    expect(out.reply).toBe('2 drawings reviewed in the last two weeks:\n1. Homework, reviewed, 4 stars (2 Oct).\n2. Sketch, reviewed (1 Oct).');
    expect(out.links).toEqual([{ label: 'Homework review', url: '/student/sketchbook/d1' }, { label: 'Sketch review', url: '/student/sketchbook/d2' }]);
    expect(tool('my_reviews').feature).toBe('sketchbook');
  });

  it('get_inspirations shows the gallery cards as students see them, never raw rows', async () => {
    mocks.searchInspiration.mockResolvedValue({ rows: [{ id: 'i1', source_kind: 'submission_original', title_override: 'Market street', type_slugs: [], author_name: 'Harshitaa T', author_id: 'u9', score_pct: 92, is_featured: true, author_opted_out: false, image_url: 'https://img.test/i1.jpg', thumbnail_url: null, brief: null, save_count: 0, is_saved: false }], total: 1, matchKind: 'text' });
    const out = await tool('get_inspirations').run(ctx(), { query: 'street perspective' });
    expect(mocks.searchInspiration.mock.calls[0][0]).toMatchObject({ query: 'street perspective', scope: 'visible', limit: 5 });
    expect(JSON.stringify(out.data)).not.toMatch(/score_pct|author_id|92/);
    expect(out.links?.[0]).toEqual({ label: 'Market street', url: '/student/inspiration/i1' });
    expect(tool('get_inspirations').feature).toBe('inspiration');
  });

  it('new_student_welcome greets with the classroom, join date and catch-up plan', async () => {
    mocks.getStudentPrimaryClassroom.mockResolvedValue({ id: 'c1', name: 'NATA 2027 Evening' });
    mocks.getCatchupJourney.mockResolvedValue({ started_on: '2026-06-01', weekly_quota: 3 });
    const out = await tool('new_student_welcome').run(ctx(), {});
    expect(out.reply).toBe('Welcome to NATA 2027 Evening. You joined on 1 Jun. Classes held before you joined are on your catch-up list: aim for 3 a week. Start with your timetable, then your assignments.');
    expect(out.links?.map((l) => l.url)).toEqual(['/student/timetable', '/student/catch-up', '/student/assignments']);
  });
});

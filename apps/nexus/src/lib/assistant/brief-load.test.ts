// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getStudentPrimaryClassroom: vi.fn(),
  loadUpcomingClasses: vi.fn(),
  loadStudentRhythm: vi.fn(),
  resolveExamCountdown: vi.fn(),
  loadReviewsBack: vi.fn(),
}));
vi.mock('@neram/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@neram/database')>()),
  getSupabaseAdminClient: () => ({}),
  listAssignmentsForStudent: vi.fn(async () => []),
  getCatchupBacklog: vi.fn(async () => null),
}));
vi.mock('@neram/database/queries/nexus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@neram/database/queries/nexus')>()),
  getStudentPrimaryClassroom: mocks.getStudentPrimaryClassroom,
}));
vi.mock('@/lib/upcoming-classes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/upcoming-classes')>()),
  loadUpcomingClasses: mocks.loadUpcomingClasses,
}));
vi.mock('@/lib/sketchbook-payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/sketchbook-payload')>()),
  loadStudentRhythm: mocks.loadStudentRhythm,
}));
vi.mock('@/lib/exam-countdown-server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/exam-countdown-server')>()),
  resolveExamCountdown: mocks.resolveExamCountdown,
}));

vi.mock('@/lib/assistant/reviews-back', () => ({ loadReviewsBack: mocks.loadReviewsBack }));

import { fakeDb } from './testing/fake-db';
import { istDateOf, loadBriefFacts } from './brief-load';

const NOW = new Date('2026-10-03T04:30:00Z');
const RHYTHM = { rhythm: { today: '2026-10-03', week: { start: '', days: [], count: 2, goal: 3, met: false }, lastWeek: null, run: 0, bestRun: 0, totalDays: 5, lastPracticeDate: null, quietDays: 0 } };

function db() {
  return fakeDb({
    users: [{ id: 's1', name: 'Priya S' }],
    nexus_assistant_reminders: [
      { id: 'r1', user_id: 's1', due_on: '2026-10-03', text: 'bring the sketchbook', status: 'queued' },
      { id: 'r2', user_id: 's1', due_on: '2026-10-01', text: 'from two days ago', status: 'queued' },
      { id: 'r3', user_id: 's1', due_on: '2026-10-04', text: 'tomorrow', status: 'queued' },
    ],
  });
}

beforeEach(() => {
  mocks.getStudentPrimaryClassroom.mockReset().mockResolvedValue({ id: 'c1', name: 'JEE' });
  mocks.loadUpcomingClasses.mockReset().mockResolvedValue([]);
  mocks.loadStudentRhythm.mockReset().mockResolvedValue(RHYTHM);
  mocks.resolveExamCountdown.mockReset().mockResolvedValue(null);
  mocks.loadReviewsBack.mockReset().mockResolvedValue({ count: 2, items: [] });
});

describe('istDateOf', () => {
  it('reads a due time just after midnight IST as the IST date, not the UTC one', () => {
    expect(istDateOf('2026-10-05T19:00:00Z')).toBe('2026-10-06');
  });

  it('keeps a mid-day due time on its own date', () => {
    expect(istDateOf('2026-10-05T06:30:00Z')).toBe('2026-10-05');
  });
});

describe('loadBriefFacts', () => {
  it('lists only the reminders due today (Ruling 24)', async () => {
    const facts = await loadBriefFacts(db(), 's1', NOW, { sketchbook: true, attendance: true, tests: true, questionBank: true, inspiration: true });
    expect(facts.remindersToday).toEqual(['bring the sketchbook']);
  });

  it('has a sketchbook line while the sketchbook is on', async () => {
    const facts = await loadBriefFacts(db(), 's1', NOW, { sketchbook: true, attendance: true, tests: true, questionBank: true, inspiration: true });
    expect(facts.sketchbookLine).toBe('2 of 3 days this week.');
  });

  it('never reads the sketchbook, and has no line, while it is off (Ruling 25)', async () => {
    const facts = await loadBriefFacts(db(), 's1', NOW, { sketchbook: false, attendance: true, tests: true, questionBank: true, inspiration: true });
    expect(facts.sketchbookLine).toBeNull();
    expect(mocks.loadStudentRhythm).not.toHaveBeenCalled();
  });

  it('counts reviews back through the shared loader, only while the sketchbook is on', async () => {
    const database = db();
    const on = await loadBriefFacts(database, 's1', NOW, { sketchbook: true, attendance: true, tests: true, questionBank: true, inspiration: true });
    expect(on.reviewsBack).toBe(2);
    expect(mocks.loadReviewsBack).toHaveBeenCalledWith(database, 's1', new Date(NOW.getTime() - 7 * 86_400_000).toISOString());
    mocks.loadReviewsBack.mockClear();
    const off = await loadBriefFacts(db(), 's1', NOW, { sketchbook: false, attendance: true, tests: true, questionBank: true, inspiration: true });
    expect(off.reviewsBack).toBe(0);
    expect(mocks.loadReviewsBack).not.toHaveBeenCalled();
  });
});

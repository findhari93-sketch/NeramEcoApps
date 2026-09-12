import { describe, it, expect } from 'vitest';
import { createFakeDb } from './testing/fake-supabase';
import { saveExamResults } from './exams';

/**
 * The snapshot writer, and the one case where notified_at must be cleared.
 *
 * notified_at is left out of the upsert payload on purpose, so a republish
 * cannot message a student twice. That is right for everyone who was told
 * something true. It was wrong for exactly one person: the student marked
 * absent on the day, told "speak to your teacher: they can open a second
 * window for you", who then did precisely that. Their row carried day one's
 * stamp about being absent, so when their real result was written weeks later
 * notify skipped them and the teacher saw { notified: 0 } rendered as success.
 *
 * Driven through the real query function rather than a hand-rolled fake, so the
 * filters themselves are under test: it is the STORED attempt_id that decides,
 * and the clear has to happen before the upsert overwrites it.
 */

const row = (over: Record<string, unknown> = {}) => ({
  student_id: 's1',
  attempt_id: null as string | null,
  rank: null as number | null,
  sitting: 'main' as const,
  score: 0,
  total_marks: 50,
  percentage: 0,
  section_scores: [],
  is_provisional: false,
  absent: true,
  ...over,
});

const seed = (over: Record<string, unknown> = {}) => ({
  nexus_exam_results: [
    {
      id: 'r1',
      exam_id: 'ex-1',
      student_id: 's1',
      attempt_id: null,
      rank: null,
      sitting: 'main',
      score: 0,
      total_marks: 50,
      percentage: 0,
      section_scores: [],
      is_provisional: false,
      absent: true,
      notified_at: '2026-08-20T09:00:00Z',
      published_at: '2026-08-20T08:00:00Z',
      ...over,
    },
  ],
});

describe('saveExamResults and the notified_at stamp', () => {
  it('clears the stamp when a paperless row becomes a real result', async () => {
    const db = createFakeDb(seed());

    await saveExamResults(
      'ex-1',
      [row({ attempt_id: 'att-1', absent: false, rank: 1, sitting: 'second', score: 34, percentage: 68 })],
      db.client,
    );

    const stored = db.tables.nexus_exam_results[0];
    // Pending again, so the next notify reaches her with her actual rank.
    expect(stored.notified_at).toBeNull();
    expect(stored.attempt_id).toBe('att-1');
    expect(stored.absent).toBe(false);
    expect(stored.sitting).toBe('second');
  });

  it('keeps the stamp of a student who already had a paper', async () => {
    const db = createFakeDb(
      seed({ attempt_id: 'att-1', absent: false, rank: 2, percentage: 76 }),
    );

    // A republish after the drawings are marked rewrites the same row.
    await saveExamResults(
      'ex-1',
      [row({ attempt_id: 'att-1', absent: false, rank: 2, percentage: 81, is_provisional: false })],
      db.client,
    );

    const stored = db.tables.nexus_exam_results[0];
    // They were told correctly on the day. Telling them again is the mirror
    // defect and just as bad.
    expect(stored.notified_at).toBe('2026-08-20T09:00:00Z');
    expect(stored.percentage).toBe(81);
  });

  it('leaves a paperless row that is still paperless alone', async () => {
    const db = createFakeDb(seed());

    // Still absent on the republish: nothing has changed for them, so the
    // absent notice they already had must not be sent a second time.
    await saveExamResults('ex-1', [row()], db.client);

    expect(db.tables.nexus_exam_results[0].notified_at).toBe('2026-08-20T09:00:00Z');
  });

  it('never reaches across to another exam or another student', async () => {
    const db = createFakeDb({
      nexus_exam_results: [
        ...seed().nexus_exam_results,
        { ...seed().nexus_exam_results[0], id: 'r2', exam_id: 'ex-0' },
        { ...seed().nexus_exam_results[0], id: 'r3', student_id: 's2' },
      ],
    });

    await saveExamResults('ex-1', [row({ attempt_id: 'att-1', absent: false })], db.client);

    const byId = (id: string) => db.tables.nexus_exam_results.find((r: any) => r.id === id);
    expect(byId('r1').notified_at).toBeNull();
    // Same student, a different exam they were genuinely absent from.
    expect(byId('r2').notified_at).toBe('2026-08-20T09:00:00Z');
    // A classmate who is still absent from this one.
    expect(byId('r3').notified_at).toBe('2026-08-20T09:00:00Z');
  });
});

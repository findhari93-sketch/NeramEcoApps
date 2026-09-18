import { describe, it, expect } from 'vitest';
import { examSittingFor, rankExamCandidates, type ExamCandidate, type ExamBucket } from './exam-results';

const CLOSES = '2026-08-18T17:15:00.000Z';

describe('examSittingFor', () => {
  it('puts a paper started before the close in the main sitting', () => {
    expect(
      examSittingFor(
        { started_at: '2026-08-18T16:00:00.000Z', submitted_at: '2026-08-18T17:00:00.000Z' },
        CLOSES,
      ),
    ).toBe('main');
  });

  // The real production row: started 17:00, submitted 18:05, exam closed 17:15.
  // They sat on the day and overran. Reading submitted_at would call this a
  // late sitting and drop a student off the podium they earned.
  it('puts an overrun in the main sitting, because it reads started_at', () => {
    expect(
      examSittingFor(
        { started_at: '2026-08-18T17:00:00.000Z', submitted_at: '2026-08-18T18:05:35.554Z' },
        CLOSES,
      ),
    ).toBe('main');
  });

  it('puts a paper started after the close in the second sitting', () => {
    expect(
      examSittingFor(
        { started_at: '2026-09-12T04:00:00.000Z', submitted_at: '2026-09-12T05:30:00.000Z' },
        CLOSES,
      ),
    ).toBe('second');
  });

  it('treats a sitting started exactly at the close as on the day', () => {
    expect(examSittingFor({ started_at: CLOSES, submitted_at: CLOSES }, CLOSES)).toBe('main');
  });

  // started_at is nullable and production has zero submitted papers without
  // one, so this is a safety net rather than a live path. Falling back to
  // submitted_at keeps the answer deterministic instead of guessing.
  it('falls back to submitted_at when started_at is missing', () => {
    expect(examSittingFor({ started_at: null, submitted_at: '2026-08-18T17:00:00.000Z' }, CLOSES)).toBe('main');
    expect(examSittingFor({ started_at: null, submitted_at: '2026-09-12T05:00:00.000Z' }, CLOSES)).toBe('second');
  });

  it('falls back to the main sitting when neither timestamp is usable', () => {
    expect(examSittingFor({ started_at: null, submitted_at: null }, CLOSES)).toBe('main');
    expect(examSittingFor({ started_at: 'not a date', submitted_at: null }, CLOSES)).toBe('main');
  });
});

const row = (id: string, bucket: ExamBucket, percentage = 50): ExamCandidate => ({
  student_id: id,
  student_name: `S ${id}`,
  attempt_id: bucket === 'exam_day' || bucket === 'second_sitting' ? `a-${id}` : null,
  score: percentage,
  total_marks: 100,
  percentage,
  provisional: false,
  absent: bucket === 'absent',
  time_spent_seconds: 100,
  section_scores: [],
  sitting: bucket === 'exam_day' ? 'main' : bucket === 'second_sitting' ? 'second' : null,
  bucket,
  window_closes_at: bucket === 'still_to_sit' ? '2026-09-19T12:34:00.000Z' : null,
});

describe('the four buckets', () => {
  it('keeps every roster student in exactly one bucket, summing to the roster', () => {
    const input = [
      row('a', 'exam_day'),
      row('b', 'exam_day', 70),
      row('c', 'second_sitting', 90),
      row('d', 'still_to_sit'),
      row('e', 'absent'),
    ];
    const out = rankExamCandidates(input);
    expect(out).toHaveLength(input.length);

    const counts = out.reduce<Record<string, number>>((acc, r) => {
      acc[r.bucket] = (acc[r.bucket] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts).toEqual({ exam_day: 2, second_sitting: 1, still_to_sit: 1, absent: 1 });
    expect(Object.values(counts).reduce((s, n) => s + n, 0)).toBe(input.length);
  });

  it('ranks only the two sittings, never a student without a paper', () => {
    const out = rankExamCandidates([row('a', 'exam_day'), row('d', 'still_to_sit'), row('e', 'absent')]);
    expect(out.find((r) => r.student_id === 'a')!.rank).toBe(1);
    expect(out.find((r) => r.student_id === 'd')!.rank).toBeNull();
    expect(out.find((r) => r.student_id === 'e')!.rank).toBeNull();
  });
});

/**
 * 2026-09-17. Students an exam was never set for (joined after the covered
 * classes) are set aside by the publish route before bucketing can call them
 * absent. A publish made before one of them was excused may already have written
 * a paperless absent row, and this is what clears it. It must never be able to
 * remove a result somebody earned.
 */
describe('removePaperlessExamResults', () => {
  function recorder() {
    const calls: Array<[string, ...unknown[]]> = [];
    const chain: Record<string, unknown> = {};
    for (const m of ['from', 'delete', 'eq', 'in', 'is']) {
      chain[m] = (...args: unknown[]) => {
        calls.push([m, ...args]);
        return chain;
      };
    }
    (chain as any).then = (ok: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(ok);
    return { client: chain as any, calls };
  }

  it('deletes only rows that hold no paper, for the named students on this exam', async () => {
    const { removePaperlessExamResults } = await import('./exam-results');
    const { client, calls } = recorder();
    await removePaperlessExamResults('exam-1', ['joined-late'], client);

    expect(calls).toContainEqual(['from', 'nexus_exam_results']);
    expect(calls).toContainEqual(['delete']);
    expect(calls).toContainEqual(['eq', 'exam_id', 'exam-1']);
    expect(calls).toContainEqual(['in', 'student_id', ['joined-late']]);
    // The guard that makes it safe whatever the caller passes.
    expect(calls).toContainEqual(['is', 'attempt_id', null]);
  });

  it('does nothing at all when nobody is excused', async () => {
    const { removePaperlessExamResults } = await import('./exam-results');
    const { client, calls } = recorder();
    await removePaperlessExamResults('exam-1', [], client);
    expect(calls).toHaveLength(0);
  });
});

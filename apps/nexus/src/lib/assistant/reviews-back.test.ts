// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/student-drawing-payload-server', () => ({ loadManualEvaluations: vi.fn(async () => [{ id: 'e1', submission_id: 'held', intent: 'grade', released_at: null }]) }));
import { fakeDb } from './testing/fake-db';
import { loadReviewsBack } from './reviews-back';

const since = '2026-09-26T04:30:00.000Z';
const row = (over: Record<string, unknown>) => ({ student_id: 's1', source_type: 'homework', status: 'reviewed', reviewed_at: '2026-10-02T10:00:00Z', tutor_rating: null, tutor_marks: null, ...over });

describe('loadReviewsBack', () => {
  it('counts released reviews (sketches by reviewed_at), skips held ones, test papers and other students', async () => {
    const db = fakeDb({ drawing_submissions: [
      row({ id: 'r1', tutor_rating: 4 }),
      row({ id: 'sk', source_type: 'sketchbook', status: 'completed' }),
      row({ id: 'redo', status: 'redo' }),
      row({ id: 'held' }),
      row({ id: 'exam', source_type: 'exam' }),
      row({ id: 'old', reviewed_at: '2026-09-01T10:00:00Z' }),
      row({ id: 'theirs', student_id: 's2' }),
    ] });
    const out = await loadReviewsBack(db, 's1', since);
    expect(out.items.map((i) => i.id).sort()).toEqual(['r1', 'redo', 'sk']);
    expect(out.count).toBe(3);
    expect(out.items.find((i) => i.id === 'r1')).toMatchObject({ kind: 'Homework', words: 'reviewed, 4 stars', reviewedOn: '2026-10-02' });
    expect(out.items.find((i) => i.id === 'redo')?.words).toBe('redo asked');
  });
});

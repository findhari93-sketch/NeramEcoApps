import { describe, expect, it } from 'vitest';
import { attemptCountLine, presentAttempts } from './inspiration-attempts';

const row = (over: Record<string, unknown> = {}) =>
  ({
    submission_id: 'sub1', original_item_id: 'item1', image_url: 'https://x/o.jpg', thumbnail_url: 'https://x/t.jpg',
    author_first_name: 'Priya', author_last_name: 'Sharma', author_name: 'Priya Sharma', author_is_alumni: false,
    author_academic_year: '2025-26', submitted_at: '2026-09-10T10:00:00Z', status: 'completed', tutor_rating: 5,
    tutor_marks: null, reviewed_at: '2026-09-11T10:00:00Z', practised_from: true, ...over,
  }) as any;

describe('presentAttempts', () => {
  it('gives staff the submission and its review', () => {
    const view = presentAttempts({ students: 3, shown: 1, rows: [row()] }, true);
    expect(view.cards[0]).toMatchObject({ key: 'sub1', submissionId: 'sub1', itemId: 'item1', practisedFrom: true, review: { state: 'reviewed', rating: 5, marks: null } });
    expect(view.cards[0].credit).toContain('Priya S.');
  });

  it('gives a student no submission id and no review', () => {
    const view = presentAttempts({ students: 3, shown: 1, rows: [row({ submission_id: null, status: null, tutor_rating: null, reviewed_at: null })] }, false);
    expect(view.cards[0].submissionId).toBeNull();
    expect(view.cards[0].review).toBeNull();
    expect(view.cards[0].key).toBe('item1');
  });

  it('reads an unreviewed assignment attempt as waiting for staff', () => {
    const view = presentAttempts({ students: 1, shown: 1, rows: [row({ status: 'submitted', reviewed_at: null, tutor_rating: null })] }, true);
    expect(view.cards[0].review).toEqual({ state: 'waiting', rating: null, marks: null });
  });
});

describe('attemptCountLine', () => {
  it('says how many drew it and how many a student can see', () => {
    expect(attemptCountLine(14, 5, false)).toBe('14 students drew this. 5 scored 4 stars and above.');
    expect(attemptCountLine(1, 0, false)).toBe('1 student drew this. None scored 4 stars and above yet.');
    expect(attemptCountLine(14, 14, true)).toBe('14 students drew this.');
    expect(attemptCountLine(0, 0, false)).toBeNull();
  });
});

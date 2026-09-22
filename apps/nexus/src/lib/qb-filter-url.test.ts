import { describe, expect, it } from 'vitest';
import { deserializeQBFilters, serializeQBFilters } from './qb-filter-url';

/**
 * The student question list's filters in its shareable URL.
 *
 * A link a student copies (or the Back button) has to come back to the same
 * list, "Video solutions" included.
 */

describe('student question list URL', () => {
  it('keeps the video filter across a copy of the link', () => {
    const params = serializeQBFilters({ solution_filter: 'has_video' });
    expect(params.get('video')).toBe('1');
    expect(deserializeQBFilters(params).solution_filter).toBe('has_video');
  });

  it('round-trips the filters it already carried', () => {
    const filters = {
      categories: ['algebra', 'mensuration'],
      difficulty: ['EASY' as const],
      question_format: ['MCQ' as const],
      attempt_status: 'incorrect' as const,
      search_text: 'cube',
      topic_ids: ['t1'],
      solution_filter: 'has_video' as const,
    };
    expect(deserializeQBFilters(serializeQBFilters(filters))).toEqual(filters);
  });

  it('leaves the video filter off unless the link turns it on', () => {
    expect(serializeQBFilters({}).has('video')).toBe(false);
    expect(deserializeQBFilters(new URLSearchParams('video=0')).solution_filter).toBeUndefined();
  });

  it('never carries a teacher-only solution filter into a student link', () => {
    expect(serializeQBFilters({ solution_filter: 'no_solution' }).has('video')).toBe(false);
  });
});

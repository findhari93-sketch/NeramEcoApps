import { describe, it, expect } from 'vitest';
import {
  SHARED_CRITERIA,
  BRIEF_CRITERION,
  criteriaForBrief,
  overallFromBands,
  overallToStars,
  scoredCount,
  isFullyScored,
  type Band,
} from './drawing-rubric';

describe('the rubric shape', () => {
  it('is the four a teacher judges on nearly every sheet', () => {
    // From the audit of 108 completed reviews: proportion 108/108,
    // composition 108/108, tone or shading 107/108, line 100/108.
    expect(SHARED_CRITERIA.map((c) => c.key)).toEqual([
      'composition',
      'proportion',
      'tonal_quality',
      'line_quality',
    ]);
  });

  it('adds exactly one more, decided by the brief', () => {
    for (const key of Object.keys(BRIEF_CRITERION)) {
      expect(criteriaForBrief(key)).toHaveLength(5);
    }
  });

  it('gives a 3D brief perspective and a 2D brief design principle', () => {
    expect(criteriaForBrief('3d_composition.still_life').map((c) => c.key)).toContain('depth_perspective');
    expect(criteriaForBrief('2d_composition.logo').map((c) => c.key)).toContain('design_principle');
  });

  it('falls back to the shared four when the brief is unknown', () => {
    // Most assignment drawings resolve to no brief type at all, and a teacher
    // still has to be able to score them.
    expect(criteriaForBrief(null)).toEqual(SHARED_CRITERIA);
    expect(criteriaForBrief('something.nobody.seeded')).toEqual(SHARED_CRITERIA);
  });

  it('never shows more than five rows', () => {
    const every = [null, ...Object.keys(BRIEF_CRITERION), 'unknown.brief'];
    every.forEach((key) => expect(criteriaForBrief(key).length).toBeLessThanOrEqual(5));
  });

  it('gives every criterion a title a teacher would recognise', () => {
    criteriaForBrief('3d_composition.still_life').forEach((c) => {
      expect(c.title.length).toBeGreaterThan(3);
      expect(c.key).toMatch(/^[a-z_]+$/);
    });
  });
});

describe('overallFromBands', () => {
  const four = criteriaForBrief(null);

  it('has no answer until something is scored', () => {
    expect(overallFromBands({}, four)).toBeNull();
  });

  it('averages what has been scored so far', () => {
    expect(overallFromBands({ composition: 4, proportion: 2 }, four)).toBe(3);
  });

  it('rounds to one decimal, because 2.8 means something and 2.7777 does not', () => {
    expect(overallFromBands({ composition: 3, proportion: 3, tonal_quality: 2 }, four)).toBe(2.7);
  });

  it('ignores a score for a criterion this brief does not use', () => {
    expect(overallFromBands({ composition: 4, depth_perspective: 1 }, four)).toBe(4);
  });

  it('stays inside 1 to 5 at both ends', () => {
    const all = (b: Band) => Object.fromEntries(four.map((c) => [c.key, b]));
    expect(overallFromBands(all(1), four)).toBe(1);
    expect(overallFromBands(all(5), four)).toBe(5);
  });
});

describe('overallToStars', () => {
  it('keeps the old one-to-five star field meaningful', () => {
    // tutor_rating is read by the queue, the gallery, the roster and the
    // student's own page. The rubric has to keep feeding it or all four go dark.
    expect(overallToStars(1)).toBe(1);
    expect(overallToStars(2.4)).toBe(2);
    expect(overallToStars(2.5)).toBe(3);
    expect(overallToStars(5)).toBe(5);
  });

  it('never rounds its way out of the range the column allows', () => {
    expect(overallToStars(0.2)).toBe(1);
    expect(overallToStars(9)).toBe(5);
    expect(overallToStars(null)).toBeNull();
  });
});

describe('counting what is done', () => {
  const five = criteriaForBrief('3d_composition.still_life');

  it('counts only the criteria this brief actually uses', () => {
    expect(scoredCount({ composition: 3, design_principle: 4 }, five)).toBe(1);
  });

  it('knows when the teacher still owes a score', () => {
    expect(isFullyScored({ composition: 3 }, five)).toBe(false);
  });

  it('knows when they do not', () => {
    const all = Object.fromEntries(five.map((c) => [c.key, 3 as Band]));
    expect(isFullyScored(all, five)).toBe(true);
    expect(scoredCount(all, five)).toBe(5);
  });

  it('treats a missing score and a zero the same way, as not scored', () => {
    expect(scoredCount({ composition: 0 as unknown as Band }, five)).toBe(0);
  });
});

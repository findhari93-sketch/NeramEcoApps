import { describe, it, expect } from 'vitest';
import { assignSectionOrders } from './qb-collision-renumber';

describe('assignSectionOrders', () => {
  it('appends after the current max for that section', () => {
    const result = assignSectionOrders(
      { aptitude: 50 },
      [{ question_id: 'q1', section: 'aptitude' }],
    );
    expect(result).toEqual([{ question_id: 'q1', section: 'aptitude', display_order: 51 }]);
  });

  it('starts at 1 for a section with no existing questions', () => {
    const result = assignSectionOrders({}, [{ question_id: 'q1', section: 'math_numerical' }]);
    expect(result).toEqual([{ question_id: 'q1', section: 'math_numerical', display_order: 1 }]);
  });

  it('gives two candidates moving into the same section distinct, increasing numbers', () => {
    const result = assignSectionOrders(
      { aptitude: 50 },
      [
        { question_id: 'q1', section: 'aptitude' },
        { question_id: 'q2', section: 'aptitude' },
      ],
    );
    expect(result).toEqual([
      { question_id: 'q1', section: 'aptitude', display_order: 51 },
      { question_id: 'q2', section: 'aptitude', display_order: 52 },
    ]);
  });

  it('keeps each target section counting independently', () => {
    const result = assignSectionOrders(
      { aptitude: 50, math_mcq: 20 },
      [
        { question_id: 'q1', section: 'aptitude' },
        { question_id: 'q2', section: 'math_mcq' },
      ],
    );
    expect(result).toEqual([
      { question_id: 'q1', section: 'aptitude', display_order: 51 },
      { question_id: 'q2', section: 'math_mcq', display_order: 21 },
    ]);
  });

  it('returns an empty list for an empty input without touching maxBySection', () => {
    const maxBySection = { aptitude: 50 };
    const result = assignSectionOrders(maxBySection, []);
    expect(result).toEqual([]);
    expect(maxBySection).toEqual({ aptitude: 50 });
  });
});

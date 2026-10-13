import { describe, expect, it } from 'vitest';
import { evaluationStatus, isDrawingGrade, nextEvaluatedAt } from './drawing-grade';

const NOW = '2026-10-10T08:00:00.000Z';
const EARLIER = '2026-10-01T08:00:00.000Z';

describe('nextEvaluatedAt: grade AND reaction make a drawing evaluated', () => {
  const fresh = { reaction: null, drawing_grade: null, evaluated_at: null };

  it('a grade alone or a reaction alone is not evaluated', () => {
    expect(nextEvaluatedAt(fresh, { reaction: null, drawing_grade: 'mid' }, NOW)).toBeNull();
    expect(nextEvaluatedAt(fresh, { reaction: 'wow', drawing_grade: null }, NOW)).toBeNull();
  });

  it('both together are evaluated now', () => {
    expect(nextEvaluatedAt(fresh, { reaction: 'wow', drawing_grade: 'top' }, NOW)).toBe(NOW);
  });

  it('keeps the first evaluated time when either changes', () => {
    const done = { reaction: 'wow' as const, drawing_grade: 'top' as const, evaluated_at: EARLIER };
    expect(nextEvaluatedAt(done, { reaction: 'heart', drawing_grade: 'mid' }, NOW)).toBe(EARLIER);
  });

  it('clearing the grade or the reaction un-evaluates it', () => {
    const done = { reaction: 'wow' as const, drawing_grade: 'top' as const, evaluated_at: EARLIER };
    expect(nextEvaluatedAt(done, { reaction: 'wow', drawing_grade: null }, NOW)).toBeNull();
    expect(nextEvaluatedAt(done, { reaction: null, drawing_grade: 'top' }, NOW)).toBeNull();
  });

  it('a drawing answered before grades existed stays evaluated when re-saved', () => {
    const legacy = { reaction: 'fire' as const, drawing_grade: null, evaluated_at: EARLIER };
    expect(nextEvaluatedAt(legacy, { reaction: 'fire', drawing_grade: null }, NOW)).toBe(EARLIER);
    expect(nextEvaluatedAt(legacy, { reaction: 'wow', drawing_grade: null }, NOW)).toBe(EARLIER);
    // ...but not once its reaction is taken away.
    expect(nextEvaluatedAt(legacy, { reaction: null, drawing_grade: null }, NOW)).toBeNull();
  });
});

describe('evaluationStatus', () => {
  it('names what is missing', () => {
    expect(evaluationStatus({ reaction: null, drawing_grade: null })).toBe('not_started');
    expect(evaluationStatus({ reaction: 'wow', drawing_grade: null })).toBe('needs_grade');
    expect(evaluationStatus({ reaction: null, drawing_grade: 'mid' })).toBe('needs_reaction');
    expect(evaluationStatus({ reaction: 'wow', drawing_grade: 'mid' })).toBe('evaluated');
    expect(evaluationStatus({ reaction: 'wow', drawing_grade: null, evaluated_at: EARLIER })).toBe('evaluated');
  });
});

describe('isDrawingGrade', () => {
  it('accepts the three grades only', () => {
    expect(['top', 'mid', 'needs_practice'].every(isDrawingGrade)).toBe(true);
    expect(isDrawingGrade('great')).toBe(false);
    expect(isDrawingGrade(null)).toBe(false);
  });
});

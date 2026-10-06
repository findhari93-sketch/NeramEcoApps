import { describe, expect, it } from 'vitest';
import { applyEvidence, stateOf, type MasteryRow } from './mastery';
import type { Evidence } from './engine';

const chain = (evs: Array<{ evidence: Evidence; errorCode?: any; hard?: boolean }>) =>
  evs.reduce<MasteryRow | null>((row, e) => applyEvidence(row, { errorCode: null, ...e }), null)!;

describe('mastery', () => {
  it('one correct answer is never mastery', () => {
    const r = chain([{ evidence: 'independent', hard: true }]);
    expect(r.state).toBe('INTRODUCED');
  });

  it('the spec example: hint, correct, wrong, independent, harder independent is strong, not mastered', () => {
    const r = chain([
      { evidence: 'hint_light' },
      { evidence: 'independent' },
      { evidence: 'wrong', errorCode: 'CONCEPT_MISUNDERSTANDING' },
      { evidence: 'independent' },
      { evidence: 'independent', hard: true },
    ]);
    expect(r.independent_n).toBe(3);
    expect(['STRONG', 'PRACTICING']).toContain(r.state);
    expect(r.state).not.toBe('MASTERED');
  });

  it('mastery needs three independent answers including a hard one, and a last answer that was right', () => {
    const base = Array.from({ length: 6 }, () => ({ evidence: 'independent' as const }));
    expect(chain(base).state).toBe('STRONG');
    const withHard = chain([...base, { evidence: 'independent', hard: true }]);
    expect(withHard.state).toBe('MASTERED');
    expect(applyEvidence(withHard, { evidence: 'wrong', errorCode: 'SIGN_ERROR' }).state).not.toBe('MASTERED');
  });

  it('a slip costs less than a misunderstanding', () => {
    const start = chain([{ evidence: 'independent' }, { evidence: 'independent' }, { evidence: 'independent' }]);
    const slip = applyEvidence(start, { evidence: 'wrong', errorCode: 'ARITHMETIC_ERROR' });
    const gap = applyEvidence(start, { evidence: 'wrong', errorCode: 'CONCEPT_MISUNDERSTANDING' });
    expect(slip.score).toBeGreaterThan(gap.score);
    expect(slip.last_error_code).toBe('ARITHMETIC_ERROR');
  });

  it('revealed solutions alone keep a concept low', () => {
    const r = chain([{ evidence: 'revealed' }, { evidence: 'revealed' }, { evidence: 'revealed' }]);
    expect(r.state).toBe('DEVELOPING');
  });

  it('reads UNKNOWN with no evidence and stays within 0..1', () => {
    expect(stateOf({ score: 0, evidence_n: 0, independent_n: 0, hard_independent_n: 0, last_result: null, last_error_code: null })).toBe('UNKNOWN');
    const many = chain(Array.from({ length: 50 }, () => ({ evidence: 'independent' as const })));
    expect(many.score).toBeLessThanOrEqual(1);
  });
});

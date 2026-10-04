import { describe, it, expect } from 'vitest';
import { cutoffTotal, convertBoardMarks, parseCutoffDemoInput, calculateBestNataScore } from './cutoff-formula';

describe('cutoff formula (shared by demo and full calculator)', () => {
  it('scales board marks to 200 and adds the NATA score', () => {
    expect(convertBoardMarks(450, 500)).toBe(180);
    expect(cutoffTotal({ marksSecured: 450, maxMarks: 500, partA: 50, partB: 70 })).toMatchObject({
      boardOutOf200: 180,
      nataOutOf200: 120,
      total: 300,
      boardPercent: 90,
      boardEligible: true,
    });
  });

  it('flags board marks under 45%', () => {
    expect(cutoffTotal({ marksSecured: 260, maxMarks: 600, partA: 40, partB: 40 }).boardEligible).toBe(false);
    expect(cutoffTotal({ marksSecured: 270, maxMarks: 600, partA: 40, partB: 40 }).boardEligible).toBe(true);
  });

  it('keeps the best attempt in the full calculator', () => {
    const r = calculateBestNataScore([{ partA: '40', partB: '60' }, { partA: '50', partB: '70' }], false, 0);
    expect(r.bestScore).toBe(120);
  });

  it('parses only safe demo input', () => {
    expect(parseCutoffDemoInput({ board: 'TN_STATE', maxMarks: 600, marksSecured: 540, partA: 'x', partB: -3 })).toEqual({
      board: 'TN_STATE',
      maxMarks: 600,
      marksSecured: 540,
      partA: undefined,
      partB: undefined,
    });
    expect(parseCutoffDemoInput({ board: 'NOPE' })?.board).toBeUndefined();
  });
});

import { describe, it, expect } from 'vitest';
import {
  BOARD_CONFIG,
  calculateBestNataScore,
  checkBoardEligibility,
  convertBoardMarks,
  cutoffPrefillFromSearch,
  cutoffPrefillQuery,
  cutoffTotal,
  parseCutoffDemoInput,
} from './cutoff-formula';

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

describe('calculator deep links', () => {
  it('round-trips what the student typed', () => {
    const input = { board: 'TN_STATE', maxMarks: 600, marksSecured: 540, partA: 60, partB: 68 };
    const q = cutoffPrefillQuery(input);
    expect(q).toBe('board=TN_STATE&max=600&marks=540&a=60&b=68');
    expect(cutoffPrefillFromSearch(`?${q}`)).toEqual(input);
  });

  it('fills the board maximum when only the board is given', () => {
    expect(cutoffPrefillFromSearch('board=MAHARASHTRA_HSC&marks=500')).toMatchObject({ maxMarks: 650, marksSecured: 500 });
  });

  it('drops unknown boards and out-of-range scores, and ignores links with no marks', () => {
    expect(cutoffPrefillFromSearch('board=XYZ&marks=400&a=900')).toEqual({
      board: undefined,
      maxMarks: undefined,
      marksSecured: 400,
      partA: undefined,
      partB: undefined,
    });
    expect(cutoffPrefillFromSearch('utm_source=chatgpt')).toBeNull();
    expect(cutoffPrefillQuery({})).toBe('');
  });
});

describe('every board converts to 200 with its own maximum', () => {
  it.each(Object.entries(BOARD_CONFIG))('%s', (_board, { maxMarks }) => {
    expect(convertBoardMarks(maxMarks, maxMarks)).toBe(200);
    expect(convertBoardMarks(maxMarks / 2, maxMarks)).toBe(100);
    expect(checkBoardEligibility(Math.ceil(maxMarks * 0.45), maxMarks)).toBe(true);
    expect(checkBoardEligibility(Math.floor(maxMarks * 0.45) - 1, maxMarks)).toBe(false);
  });
});

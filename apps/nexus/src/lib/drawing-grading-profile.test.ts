import { describe, it, expect } from 'vitest';
import { harvestBandSentences, summariseProfile, type CorrectionRow } from './drawing-grading-profile';

const row = (over: Partial<CorrectionRow> = {}): CorrectionRow => ({
  criterion_key: 'proportion', reference_band: 4, final_band: 2, reference_kind: 'previous_attempt',
  reason_code: 'work_changed', reason_text: null, corrected_at: '2026-09-13T10:00:00Z', ...over,
});

describe('summariseProfile', () => {
  it('says plainly when nothing has been learned, never 0%', () => {
    const p = summariseProfile([]);
    expect(p.total).toBe(0);
    expect(p.criteria).toEqual([]);
    expect(p.headline).not.toMatch(/%/);
    expect(p.headline).toMatch(/Nothing learned yet/);
  });

  it('ignores rows that were never actually corrected', () => {
    expect(summariseProfile([row({ corrected_at: null })]).total).toBe(0);
  });

  it('counts corrections and which way they lean, per criterion', () => {
    const p = summariseProfile([
      row(),
      row({ final_band: 5, reference_band: 3, corrected_at: '2026-09-13T11:00:00Z' }),
      row({ final_band: 1, reference_band: 3 }),
      row({ criterion_key: 'composition', final_band: 5, reference_band: 3 }),
    ]);
    expect(p.headline).toBe('Learned from 4 of your corrections.');
    expect(p.criteria[0]).toMatchObject({ criterion_key: 'proportion', title: 'Proportion and scale', corrections: 3, higher: 1, lower: 2 });
    expect(p.criteria[0].lean).toBe('You scored above the reference once and below it twice.');
    expect(p.criteria[1].lean).toBe('You scored above the reference once, never below.');
  });

  it('never shows a percentage anywhere', () => {
    const p = summariseProfile(Array.from({ length: 12 }, () => row()));
    expect(JSON.stringify(p)).not.toMatch(/%/);
  });

  it('keeps the newest typed sentences, skipping taps with no text', () => {
    const p = summariseProfile([
      row({ reason_text: 'old', corrected_at: '2026-09-01T00:00:00Z' }),
      row({ reason_text: 'new', corrected_at: '2026-09-10T00:00:00Z' }),
      row({ reason_text: null }),
    ]);
    expect(p.criteria[0].sentences).toEqual(['new', 'old']);
  });
});

describe('harvestBandSentences', () => {
  it('files each typed sentence under the band it was written for, once', () => {
    const out = harvestBandSentences([
      row({ final_band: 2, reason_text: 'Walls lean' }),
      row({ final_band: 2, reason_text: 'Walls lean' }),
      row({ final_band: 4, reason_text: 'Sizes hold across the sheet' }),
      row({ final_band: 3, reason_text: null }),
    ]);
    expect(out).toEqual({ proportion: { 2: ['Walls lean'], 4: ['Sizes hold across the sheet'] } });
  });
});

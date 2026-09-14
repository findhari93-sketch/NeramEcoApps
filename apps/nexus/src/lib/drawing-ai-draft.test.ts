import { describe, it, expect } from 'vitest';
import {
  SHADOW_MIN_SHEETS, completeLabel, feedbackPrefill, prefillBands, rowMode, shadowAgreement, unreadDraftsGate,
  type AiDraft, type ScorePair,
} from './drawing-ai-draft';

const draft: AiDraft = {
  evaluation_id: 'e1',
  created_at: '2026-09-13T10:00:00Z',
  overall_comment: 'Strong convergence; the stair treads drift.',
  criteria: {
    proportion: { ai_band: 4, confidence: 'high', reasoning: 'Blocks hold size' },
    composition: { ai_band: 3, confidence: 'medium', reasoning: 'Crowded left' },
    line_quality: { ai_band: 2, confidence: 'low', reasoning: null },
  },
  marks: [],
  tags: [],
};

describe('prefillBands', () => {
  it('fills only confident draft bands', () => {
    expect(prefillBands(draft, {})).toEqual({ proportion: 4 });
  });

  it('never overrides a score the teacher already saved', () => {
    expect(prefillBands(draft, { proportion: 2 })).toEqual({ proportion: 2 });
  });

  it('does nothing without a draft, the state today', () => {
    expect(prefillBands(null, { composition: 3 })).toEqual({ composition: 3 });
  });
});

describe('rowMode', () => {
  it('shows a confident draft band as confirmed until the teacher takes it over', () => {
    expect(rowMode('proportion', draft, 4, false)).toBe('confirmed');
    expect(rowMode('proportion', draft, 4, true)).toBe('input');
    expect(rowMode('proportion', draft, 3, false)).toBe('input');
  });

  it('shows an unsure draft only as a suggestion', () => {
    expect(rowMode('composition', draft, undefined, false)).toBe('suggested');
    expect(rowMode('line_quality', draft, undefined, false)).toBe('suggested');
  });

  it('is an ordinary input with no draft for that criterion', () => {
    expect(rowMode('tonal_quality', draft, undefined, false)).toBe('input');
    expect(rowMode('proportion', null, 4, false)).toBe('input');
  });
});

describe('completeLabel and feedbackPrefill', () => {
  it('says Approve only when there is a draft', () => {
    expect(completeLabel({ hasDraft: true, alreadyReviewed: false })).toBe('Approve');
    expect(completeLabel({ hasDraft: false, alreadyReviewed: false })).toBe('Complete');
    expect(completeLabel({ hasDraft: true, alreadyReviewed: true })).toBe('Save');
  });

  it("opens with the draft's comment only when the teacher has written nothing", () => {
    expect(feedbackPrefill('', draft)).toBe('Strong convergence; the stair treads drift.');
    expect(feedbackPrefill('My own words', draft)).toBeNull();
    expect(feedbackPrefill('', null)).toBeNull();
  });
});

const pairs = (sheets: number, gap: number, key = 'proportion'): ScorePair[] =>
  Array.from({ length: sheets }, (_, i) => ({ submission_id: `s${i}`, criterion_key: key, ai_band: 3, final_band: 3 + gap }));

describe('shadowAgreement and the unread drafts gate', () => {
  it('stays shut with nothing compared, and says how far there is to go', () => {
    const gate = unreadDraftsGate(shadowAgreement([]));
    expect(gate.ready).toBe(false);
    expect(gate.reason).toContain(`0 of ${SHADOW_MIN_SHEETS} so far`);
  });

  it('counts sheets, not criterion rows', () => {
    const a = shadowAgreement([...pairs(10, 0), ...pairs(10, 0, 'composition')]);
    expect(a.sheets).toBe(10);
    expect(a.pairs).toBe(20);
  });

  it('stays shut below the sheet floor even with perfect agreement', () => {
    expect(unreadDraftsGate(shadowAgreement(pairs(SHADOW_MIN_SHEETS - 1, 0))).ready).toBe(false);
  });

  it('stays shut when a criterion is too often more than a band off', () => {
    const mixed = [...pairs(45, 0), ...pairs(10, 2).map((p, i) => ({ ...p, submission_id: `x${i}` }))];
    const gate = unreadDraftsGate(shadowAgreement(mixed));
    expect(gate.ready).toBe(false);
    expect(gate.reason).toContain('proportion (45 of 55 within one band)');
  });

  it('opens at the floor with every criterion close', () => {
    expect(unreadDraftsGate(shadowAgreement(pairs(SHADOW_MIN_SHEETS, 1))).ready).toBe(true);
  });

  it('ignores pairs that are not real bands', () => {
    expect(shadowAgreement([{ submission_id: 's', criterion_key: 'x', ai_band: 0, final_band: 3 }]).pairs).toBe(0);
  });
});

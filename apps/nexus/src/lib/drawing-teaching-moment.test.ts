import { describe, it, expect } from 'vitest';
import { parseCorrection, promptFor, referenceFor, ruleTextFor, shouldAsk } from './drawing-teaching-moment';

describe('referenceFor', () => {
  it('prefers the AI draft over everything else', () => {
    expect(referenceFor({ aiBand: 3, previousAttemptBand: 5, studentLastBand: 1, classBands: [2, 2, 2] }))
      .toMatchObject({ band: 3, kind: 'ai' });
  });

  it('then the previous attempt, then the last drawing', () => {
    expect(referenceFor({ previousAttemptBand: 4, studentLastBand: 2 })).toMatchObject({ band: 4, kind: 'previous_attempt' });
    expect(referenceFor({ studentLastBand: 2, classBands: [5, 5, 5] })).toMatchObject({ band: 2, kind: 'student_last' });
  });

  it('uses the class only once three classmates are scored', () => {
    expect(referenceFor({ classBands: [4, 4] })).toBeNull();
    const ref = referenceFor({ classBands: [3, 4, 4] });
    expect(ref).toMatchObject({ band: 4, kind: 'class_average' });
    expect(ref!.sentence).toBe('The class averages 3.7 here, across 3 drawings.');
  });

  it('ignores anything that is not a band', () => {
    expect(referenceFor({ aiBand: 0, previousAttemptBand: 7, studentLastBand: 2.5, classBands: [9, 0, -1] })).toBeNull();
  });
});

describe('shouldAsk', () => {
  const previous = referenceFor({ previousAttemptBand: 4 });
  const ai = referenceFor({ aiBand: 4 });

  it('does not ask about one band of ordinary drift', () => {
    expect(shouldAsk(3, previous)).toBe(false);
    expect(shouldAsk(5, previous)).toBe(false);
    expect(shouldAsk(4, previous)).toBe(false);
  });

  it('asks at two bands apart, either way', () => {
    expect(shouldAsk(2, previous)).toBe(true);
    expect(shouldAsk(1, referenceFor({ previousAttemptBand: 3 }))).toBe(true);
  });

  it('asks about any override of the AI', () => {
    expect(shouldAsk(3, ai)).toBe(true);
    expect(shouldAsk(4, ai)).toBe(false);
  });

  it('never asks with nothing to compare against', () => {
    expect(shouldAsk(1, null)).toBe(false);
    expect(shouldAsk(null, previous)).toBe(false);
  });
});

describe('promptFor', () => {
  it('reads as a sentence, never a bare number', () => {
    expect(promptFor(2, referenceFor({ previousAttemptBand: 4 })!)).toBe('You gave 2. Their previous attempt scored 4 here.');
  });
});

describe('parseCorrection', () => {
  const base = { criterion_key: 'proportion', final_band: 2, reference_band: 4, reference_kind: 'previous_attempt' };

  it('accepts a tapped reason', () => {
    const r = parseCorrection({ ...base, reason_code: 'work_changed' });
    expect(r).toEqual({ ok: true, value: { ...base, reason_code: 'work_changed', reason_text: null, remember: false } });
  });

  it('files a typed sentence with no tap as other, tidied', () => {
    const r = parseCorrection({ ...base, reason_text: '  Wall heights   drift left to right  ' });
    expect(r.ok && r.value).toMatchObject({ reason_code: 'other', reason_text: 'Wall heights drift left to right' });
  });

  it('refuses a correction with no reason at all', () => {
    expect(parseCorrection({ ...base })).toEqual({ ok: false, error: 'Pick a reason or type one' });
    expect(parseCorrection({ ...base, reason_code: 'other', reason_text: 'x' })).toEqual({ ok: false, error: 'Type the reason' });
  });

  it('refuses bands out of range, unknown references and runaway text', () => {
    expect(parseCorrection({ ...base, final_band: 6, reason_code: 'too_small' }).ok).toBe(false);
    expect(parseCorrection({ ...base, reference_kind: 'vibes', reason_code: 'too_small' }).ok).toBe(false);
    expect(parseCorrection({ ...base, reason_text: 'a'.repeat(401) }).ok).toBe(false);
    expect(parseCorrection({ ...base, criterion_key: 'DROP TABLE', reason_code: 'too_small' }).ok).toBe(false);
  });

  it('only keeps a rule when asked to, explicitly', () => {
    const r = parseCorrection({ ...base, reason_code: 'too_small', remember: 'yes' });
    expect(r.ok && r.value.remember).toBe(false);
  });
});

describe('ruleTextFor', () => {
  it('keeps what the teacher typed, else the reason they tapped', () => {
    expect(ruleTextFor({ reason_code: 'other', reason_text: 'Shadows fall one way' })).toBe('Shadows fall one way');
    expect(ruleTextFor({ reason_code: 'too_small', reason_text: null })).toBe('The error is real, but not worth a whole band');
  });
});

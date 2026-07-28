/**
 * Unit tests for the pre-class reason vocabulary. Mirrors rsvp-reasons.test.ts.
 *
 * The array and the CHECK constraint in the migration have to stay in step, so
 * the shape tests here are the cheap guard against them drifting apart.
 */
import { describe, it, expect } from 'vitest';
import {
  PREWORK_REASON_CODES,
  PREWORK_REASONS,
  isPreworkReasonCode,
  preworkReasonRequiresNote,
  describePreworkReason,
  preworkReasonShortLabel,
  tallyPreworkReasons,
  dominantPreworkReason,
} from './prework-reasons';

describe('the reason set', () => {
  it('has an entry for every code and a code for every entry', () => {
    expect(PREWORK_REASONS.map((r) => r.code).sort()).toEqual([...PREWORK_REASON_CODES].sort());
    expect(PREWORK_REASONS).toHaveLength(PREWORK_REASON_CODES.length);
  });

  it('every entry has both a label and a short label', () => {
    for (const r of PREWORK_REASONS) {
      expect(r.label.trim().length).toBeGreaterThan(0);
      expect(r.shortLabel.trim().length).toBeGreaterThan(0);
    }
  });

  it('no label contains an em dash or a double dash', () => {
    for (const r of PREWORK_REASONS) {
      expect(`${r.label} ${r.shortLabel}`).not.toContain('—');
      expect(`${r.label} ${r.shortLabel}`).not.toContain('--');
    }
  });

  it('fits a bottom sheet at 375px: five rows at 52px is 260px', () => {
    expect(PREWORK_REASONS.length).toBeLessThanOrEqual(5);
  });

  it('is not the RSVP set, which answers a different question', () => {
    expect(PREWORK_REASON_CODES).toContain('not_understood');
    expect(PREWORK_REASON_CODES).toContain('materials');
    expect(PREWORK_REASON_CODES).not.toContain('family');
    expect(PREWORK_REASON_CODES).not.toContain('clash');
  });
});

describe('isPreworkReasonCode', () => {
  it('accepts every real code', () => {
    for (const code of PREWORK_REASON_CODES) expect(isPreworkReasonCode(code)).toBe(true);
  });

  it('rejects anything else, including near misses', () => {
    expect(isPreworkReasonCode(null)).toBe(false);
    expect(isPreworkReasonCode(undefined)).toBe(false);
    expect(isPreworkReasonCode('')).toBe(false);
    expect(isPreworkReasonCode('NO_TIME')).toBe(false);
    expect(isPreworkReasonCode('no_time ')).toBe(false);
    expect(isPreworkReasonCode('family')).toBe(false);
    expect(isPreworkReasonCode(42)).toBe(false);
  });
});

describe('preworkReasonRequiresNote', () => {
  it('is true only for "other", which is not specific enough on its own', () => {
    expect(preworkReasonRequiresNote('other')).toBe(true);
    expect(preworkReasonRequiresNote('not_understood')).toBe(false);
    expect(preworkReasonRequiresNote('no_time')).toBe(false);
    expect(preworkReasonRequiresNote('materials')).toBe(false);
    expect(preworkReasonRequiresNote('unwell')).toBe(false);
  });

  it('does not demand a note for an unknown code', () => {
    expect(preworkReasonRequiresNote('nope')).toBe(false);
  });
});

describe('describePreworkReason', () => {
  it('prefers the note, which always says more than the category', () => {
    expect(describePreworkReason('materials', 'Printer at home is broken')).toBe('Printer at home is broken');
  });

  it('falls back to the label when there is no note', () => {
    expect(describePreworkReason('no_time', null)).toBe('I ran out of time');
    expect(describePreworkReason('no_time', '   ')).toBe('I ran out of time');
  });

  it('renders a row with no usable code', () => {
    expect(describePreworkReason(null, null)).toBe('No reason given');
  });
});

describe('preworkReasonShortLabel', () => {
  it('gives the teacher tag', () => {
    expect(preworkReasonShortLabel('not_understood')).toBe('Stuck');
    expect(preworkReasonShortLabel('materials')).toBe('Blocked');
  });

  it('folds anything unknown into Other', () => {
    expect(preworkReasonShortLabel('mystery')).toBe('Other');
    expect(preworkReasonShortLabel(null)).toBe('Other');
  });
});

describe('tallyPreworkReasons', () => {
  it('counts per code', () => {
    const t = tallyPreworkReasons([
      { reason_code: 'no_time' },
      { reason_code: 'no_time' },
      { reason_code: 'unwell' },
    ]);
    expect(t.no_time).toBe(2);
    expect(t.unwell).toBe(1);
    expect(t.materials).toBe(0);
  });

  it('folds unknown codes into other so the totals still add up', () => {
    const rows = [{ reason_code: 'legacy' }, { reason_code: null }, { reason_code: 'no_time' }];
    const t = tallyPreworkReasons(rows);
    expect(t.other).toBe(2);
    expect(Object.values(t).reduce((a, b) => a + b, 0)).toBe(rows.length);
  });
});

describe('dominantPreworkReason', () => {
  it('names the most common reason for the teacher queue row', () => {
    expect(
      dominantPreworkReason([{ reason_code: 'no_time' }, { reason_code: 'no_time' }, { reason_code: 'unwell' }]),
    ).toBe('ran out of time');
  });

  it('returns null when there is nothing to report', () => {
    expect(dominantPreworkReason([])).toBeNull();
  });
});

/**
 * Unit tests for the RSVP reason registry.
 *
 * These codes cross a trust boundary (student input) and a schema boundary (a
 * Postgres CHECK constraint), so validation has to reject anything the database
 * would refuse, and the display helpers have to survive legacy rows written
 * before reason codes existed.
 */
import { describe, it, expect } from 'vitest';
import {
  RSVP_REASONS,
  RSVP_REASON_CODES,
  describeReason,
  isRsvpReasonCode,
  reasonRequiresNote,
  reasonShortLabel,
  tallyReasons,
} from './rsvp-reasons';

describe('registry integrity', () => {
  it('exposes one entry per code', () => {
    expect(RSVP_REASONS.map((r) => r.code).sort()).toEqual([...RSVP_REASON_CODES].sort());
  });

  it('requires a note only for "other"', () => {
    const requiring = RSVP_REASONS.filter((r) => r.requiresNote).map((r) => r.code);
    expect(requiring).toEqual(['other']);
  });

  it('gives every reason a label and a short label', () => {
    for (const r of RSVP_REASONS) {
      expect(r.label.length).toBeGreaterThan(0);
      expect(r.shortLabel.length).toBeGreaterThan(0);
    }
  });
});

describe('isRsvpReasonCode', () => {
  it('accepts every known code', () => {
    for (const code of RSVP_REASON_CODES) expect(isRsvpReasonCode(code)).toBe(true);
  });

  it('rejects anything the CHECK constraint would reject', () => {
    // A value that slipped past here would fail at the database instead.
    expect(isRsvpReasonCode('network')).toBe(false);
    expect(isRsvpReasonCode('OTHER')).toBe(false);
    expect(isRsvpReasonCode('')).toBe(false);
    expect(isRsvpReasonCode(null)).toBe(false);
    expect(isRsvpReasonCode(undefined)).toBe(false);
    expect(isRsvpReasonCode(3)).toBe(false);
    expect(isRsvpReasonCode({ code: 'unwell' })).toBe(false);
  });
});

describe('reasonRequiresNote', () => {
  it('is true only for other', () => {
    expect(reasonRequiresNote('other')).toBe(true);
    expect(reasonRequiresNote('unwell')).toBe(false);
    expect(reasonRequiresNote('family')).toBe(false);
    expect(reasonRequiresNote('clash')).toBe(false);
  });

  it('is false for junk rather than throwing', () => {
    expect(reasonRequiresNote('nonsense')).toBe(false);
    expect(reasonRequiresNote(null)).toBe(false);
  });
});

describe('describeReason', () => {
  it('prefers the student note, which says more than the category', () => {
    expect(describeReason('family', 'Cousin wedding in Madurai')).toBe('Cousin wedding in Madurai');
  });

  it('falls back to the code label when there is no note', () => {
    expect(describeReason('unwell', null)).toBe('Feeling unwell');
    expect(describeReason('clash', '   ')).toBe('School or exam clash');
  });

  it('handles a legacy row with free text but no code', () => {
    expect(describeReason(null, 'Had a fever')).toBe('Had a fever');
  });

  it('handles a row with neither', () => {
    expect(describeReason(null, null)).toBe('No reason given');
    expect(describeReason(undefined, undefined)).toBe('No reason given');
  });

  it('trims surrounding whitespace from the note', () => {
    expect(describeReason('other', '  Power cut  ')).toBe('Power cut');
  });
});

describe('reasonShortLabel', () => {
  it('maps known codes', () => {
    expect(reasonShortLabel('unwell')).toBe('Unwell');
    expect(reasonShortLabel('clash')).toBe('Exam clash');
  });

  it('folds unknown and missing codes into Other', () => {
    expect(reasonShortLabel(null)).toBe('Other');
    expect(reasonShortLabel('network')).toBe('Other');
  });
});

describe('tallyReasons', () => {
  it('counts each code', () => {
    expect(
      tallyReasons([
        { reason_code: 'unwell' },
        { reason_code: 'unwell' },
        { reason_code: 'clash' },
      ]),
    ).toEqual({ unwell: 2, family: 0, clash: 1, other: 0 });
  });

  it('always returns every key, so a chart has no holes', () => {
    expect(Object.keys(tallyReasons([])).sort()).toEqual([...RSVP_REASON_CODES].sort());
  });

  it('folds unknown and missing codes into other so the totals still add up', () => {
    const rows = [{ reason_code: null }, { reason_code: 'network' }, { reason_code: 'unwell' }];
    const tally = tallyReasons(rows);
    expect(tally.other).toBe(2);
    const sum = Object.values(tally).reduce((a, b) => a + b, 0);
    expect(sum).toBe(rows.length);
  });
});

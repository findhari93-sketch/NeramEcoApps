import { describe, expect, it } from 'vitest';
import {
  TEST_REASON_CODES,
  describeTestReason,
  dominantTestReason,
  isTestReasonCode,
  looksBroken,
  tallyTestReasons,
  testReasonBlamesTest,
  testReasonRequiresNote,
  testReasonShortLabel,
} from './test-reasons';
import { PREWORK_REASON_CODES } from './prework-reasons';

describe('the vocabulary itself', () => {
  /**
   * The whole reason this is a third list rather than a reuse of prework's.
   * If someone later "simplifies" by importing PREWORK_REASON_CODES here, the
   * two codes that make the feature work disappear and this turns red.
   */
  it('carries the two codes prework cannot express', () => {
    expect(TEST_REASON_CODES).toContain('technical_problem');
    expect(TEST_REASON_CODES).toContain('too_hard');
    expect(PREWORK_REASON_CODES).not.toContain('technical_problem');
    expect(PREWORK_REASON_CODES).not.toContain('too_hard');
  });

  it('keeps the shared codes spelled exactly as prework spells them', () => {
    for (const shared of ['not_understood', 'no_time', 'unwell', 'other'] as const) {
      expect(TEST_REASON_CODES).toContain(shared);
      expect(PREWORK_REASON_CODES).toContain(shared);
    }
  });

  // "Something went wrong" is unactionable. "Question 12 never loaded" is a bug
  // report, and that difference is the point of the whole stream.
  it('demands a note for the two codes that are useless without one', () => {
    expect(testReasonRequiresNote('technical_problem')).toBe(true);
    expect(testReasonRequiresNote('other')).toBe(true);
    expect(testReasonRequiresNote('too_hard')).toBe(false);
    expect(testReasonRequiresNote('no_time')).toBe(false);
  });

  it('marks only technical_problem as an accusation against the paper', () => {
    expect(testReasonBlamesTest('technical_problem')).toBe(true);
    for (const code of ['too_hard', 'not_understood', 'no_time', 'unwell', 'other']) {
      expect(testReasonBlamesTest(code)).toBe(false);
    }
  });
});

describe('isTestReasonCode', () => {
  it('accepts every real code and nothing else', () => {
    for (const code of TEST_REASON_CODES) expect(isTestReasonCode(code)).toBe(true);
    expect(isTestReasonCode('materials')).toBe(false); // a prework code, not ours
    expect(isTestReasonCode(null)).toBe(false);
    expect(isTestReasonCode(42)).toBe(false);
    expect(isTestReasonCode('')).toBe(false);
  });
});

describe('describeTestReason', () => {
  it('prefers the student note, because it is always more specific', () => {
    expect(describeTestReason('technical_problem', 'question 12 never loaded')).toBe(
      'question 12 never loaded',
    );
  });

  it('falls back to the code label when there is no note', () => {
    expect(describeTestReason('too_hard', null)).toBe('It was too hard for me');
    expect(describeTestReason('too_hard', '   ')).toBe('It was too hard for me');
  });

  // A row written before a code existed still has to render.
  it('never returns a blank for an unknown code', () => {
    expect(describeTestReason('from_the_future', null)).toBe('No reason given');
    expect(describeTestReason(null, null)).toBe('No reason given');
  });
});

describe('testReasonShortLabel', () => {
  it('gives the compact tag', () => {
    expect(testReasonShortLabel('technical_problem')).toBe('Broken');
    expect(testReasonShortLabel('no_time')).toBe('No time');
  });

  it('folds an unknown code into Other rather than showing the raw slug', () => {
    expect(testReasonShortLabel('nonsense')).toBe('Other');
    expect(testReasonShortLabel(null)).toBe('Other');
  });
});

describe('tallyTestReasons', () => {
  it('counts per code', () => {
    const tally = tallyTestReasons([
      { reason_code: 'no_time' },
      { reason_code: 'no_time' },
      { reason_code: 'too_hard' },
    ]);
    expect(tally.no_time).toBe(2);
    expect(tally.too_hard).toBe(1);
    expect(tally.technical_problem).toBe(0);
  });

  // Totals that do not add up are worse than useless on a dashboard.
  it('folds unknown and missing codes into other so the totals add up', () => {
    const rows = [{ reason_code: 'ancient_code' }, { reason_code: null }, {}];
    const tally = tallyTestReasons(rows);
    expect(tally.other).toBe(3);
    expect(Object.values(tally).reduce((a, b) => a + b, 0)).toBe(rows.length);
  });

  it('handles an empty or missing list', () => {
    expect(Object.values(tallyTestReasons([])).reduce((a, b) => a + b, 0)).toBe(0);
    expect(() => tallyTestReasons(undefined as any)).not.toThrow();
  });
});

describe('looksBroken', () => {
  /**
   * One report is enough. A test that fails to load fails silently for everyone
   * who did not bother to say so, and checking a working paper is far cheaper
   * than leaving a broken one in front of a class.
   */
  it('flags a paper on a single technical report among many', () => {
    expect(
      looksBroken([
        { reason_code: 'too_hard' },
        { reason_code: 'no_time' },
        { reason_code: 'technical_problem' },
        { reason_code: 'unwell' },
      ]),
    ).toBe(true);
  });

  it('does not flag a paper that is merely hard', () => {
    expect(looksBroken([{ reason_code: 'too_hard' }, { reason_code: 'not_understood' }])).toBe(false);
  });

  it('does not flag a paper nobody has complained about', () => {
    expect(looksBroken([])).toBe(false);
    expect(looksBroken(undefined as any)).toBe(false);
  });
});

describe('dominantTestReason', () => {
  it('phrases the most common reason for a queue row', () => {
    expect(
      dominantTestReason([{ reason_code: 'no_time' }, { reason_code: 'no_time' }, { reason_code: 'unwell' }]),
    ).toBe('ran out of time');
  });

  it('strips the leading first person so it reads inside a sentence', () => {
    expect(dominantTestReason([{ reason_code: 'unwell' }])).toBe('was unwell');
  });

  it('returns null when there is nothing to report', () => {
    expect(dominantTestReason([])).toBeNull();
    expect(dominantTestReason(undefined as any)).toBeNull();
  });
});

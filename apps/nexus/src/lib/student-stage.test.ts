import { describe, expect, it } from 'vitest';
import { TIER_COLOR } from './inactivity-score';
import {
  DEFAULT_SEGMENT,
  SEGMENT_ORDER,
  SEGMENT_LABEL,
  SEGMENT_TOOLTIP,
  STAGE_COLOR,
  STAGE_COLOR_DARK,
  STAGE_GROUP,
  STAGE_ICON,
  STAGE_LABEL,
  STAGE_MEANING,
  STAGE_ORDER,
  STAGE_RING_STYLE,
  STAGE_TOOLTIP,
  describeClassificationChange,
  isExamThisYear,
  matchesSegment,
  segmentCounts,
  stageCounts,
  stageKeyOf,
  type StageFacts,
  type StageKey,
  type StudentSegment,
} from './student-stage';

describe('stageKeyOf', () => {
  it('maps each valid DB value to itself', () => {
    expect(stageKeyOf('gap_year')).toBe('gap_year');
    expect(stageKeyOf('12th')).toBe('12th');
    expect(stageKeyOf('11th')).toBe('11th');
    expect(stageKeyOf('10th')).toBe('10th');
  });

  it('treats every absence or surprise as unset, never as a default stage', () => {
    expect(stageKeyOf(null)).toBe('unset');
    expect(stageKeyOf(undefined)).toBe('unset');
    expect(stageKeyOf('')).toBe('unset');
    expect(stageKeyOf('9th')).toBe('unset');
    expect(stageKeyOf('GAP_YEAR')).toBe('unset');
  });
});

describe('token records', () => {
  const records: Record<string, Record<string, unknown>> = {
    STAGE_LABEL,
    STAGE_MEANING,
    STAGE_TOOLTIP,
    STAGE_COLOR,
    STAGE_COLOR_DARK,
    STAGE_ICON,
    STAGE_RING_STYLE,
    STAGE_GROUP,
  };

  // This is the test that catches "added a stage, forgot the colour".
  it.each(Object.keys(records))('%s covers exactly STAGE_ORDER', (name) => {
    expect(Object.keys(records[name]).sort()).toEqual([...STAGE_ORDER].sort());
  });

  it('SEGMENT_LABEL and SEGMENT_TOOLTIP cover exactly SEGMENT_ORDER', () => {
    expect(Object.keys(SEGMENT_LABEL).sort()).toEqual([...SEGMENT_ORDER].sort());
    expect(Object.keys(SEGMENT_TOOLTIP).sort()).toEqual([...SEGMENT_ORDER].sort());
  });

  it('lands on the exam-this-year cohort by default', () => {
    expect(DEFAULT_SEGMENT).toBe('exam_this_year');
    expect(SEGMENT_ORDER).toContain(DEFAULT_SEGMENT);
  });
});

describe('colour hygiene', () => {
  it('gives every stage its own hex, in both modes', () => {
    expect(new Set(Object.values(STAGE_COLOR)).size).toBe(STAGE_ORDER.length);
    expect(new Set(Object.values(STAGE_COLOR_DARK)).size).toBe(STAGE_ORDER.length);
  });

  // Stage chips and watchlist tier chips can appear on the same row, so no
  // SIGNALLING colour may be shared: two different meanings in one hue is how a
  // teacher learns to distrust the colour entirely.
  //
  // `unset` is exempt and shares TIER_COLOR.new's neutral grey on purpose. Both
  // mean "we have no information yet", so one grey for one idea is right.
  it('does not reuse a watchlist tier colour for any signalling stage', () => {
    const tiers = new Set(Object.values(TIER_COLOR));
    for (const [stage, hex] of Object.entries(STAGE_COLOR)) {
      if (stage === 'unset') continue;
      expect(tiers.has(hex), `${stage} (${hex}) collides with a TIER_COLOR`).toBe(false);
    }
  });

  it('shares exactly one neutral grey with the watchlist, and only for unset', () => {
    expect(STAGE_COLOR.unset).toBe(TIER_COLOR.new);
  });
});

describe('isExamThisYear', () => {
  it('is true for break-year and Class 12 only', () => {
    expect(isExamThisYear('gap_year')).toBe(true);
    expect(isExamThisYear('12th')).toBe(true);
    expect(isExamThisYear('11th')).toBe(false);
    expect(isExamThisYear('10th')).toBe(false);
    expect(isExamThisYear('unset')).toBe(false);
  });
});

describe('matchesSegment', () => {
  const stages: StageKey[] = ['gap_year', '12th', '11th', '10th', 'unset'];

  it('puts an active student in exactly the segments they belong to', () => {
    const expected: Record<StageKey, StudentSegment[]> = {
      gap_year: ['exam_this_year', 'all_active'],
      '12th': ['exam_this_year', 'all_active'],
      '11th': ['all_active', '11th'],
      '10th': ['all_active', 'lower'],
      unset: ['all_active', 'unset'],
    };
    for (const stage of stages) {
      for (const segment of SEGMENT_ORDER) {
        expect(
          matchesSegment({ stage, dormant: false }, segment),
          `active ${stage} in ${segment}`,
        ).toBe(expected[stage].includes(segment));
      }
    }
  });

  // The invariant the whole feature rests on.
  it('puts a dormant student in the dormant segment and nowhere else', () => {
    for (const stage of stages) {
      for (const segment of SEGMENT_ORDER) {
        expect(
          matchesSegment({ stage, dormant: true }, segment),
          `dormant ${stage} in ${segment}`,
        ).toBe(segment === 'dormant');
      }
    }
  });

  it('keeps a dormant Class 12 student out of exam_this_year and all_active', () => {
    const facts: StageFacts = { stage: '12th', dormant: true };
    expect(matchesSegment(facts, 'exam_this_year')).toBe(false);
    expect(matchesSegment(facts, 'all_active')).toBe(false);
    expect(matchesSegment(facts, 'dormant')).toBe(true);
  });
});

describe('counts over the live production shape', () => {
  // JEE B.Arch Session 1, 2026-27: 4 x 11th, 5 x 12th, 19 unset, 0 gap_year.
  // Three of the unset students are marked dormant here to exercise both axes.
  const rows: StageFacts[] = [
    ...Array.from({ length: 4 }, () => ({ stage: '11th' as StageKey, dormant: false })),
    ...Array.from({ length: 5 }, () => ({ stage: '12th' as StageKey, dormant: false })),
    ...Array.from({ length: 16 }, () => ({ stage: 'unset' as StageKey, dormant: false })),
    ...Array.from({ length: 3 }, () => ({ stage: 'unset' as StageKey, dormant: true })),
  ];

  it('totals 28 students', () => {
    expect(rows).toHaveLength(28);
  });

  it('derives the segment counts', () => {
    const counts = segmentCounts(rows);
    expect(counts.exam_this_year).toBe(5); // no break-year students recorded yet
    expect(counts['11th']).toBe(4);
    expect(counts.lower).toBe(0);
    expect(counts.unset).toBe(16); // dormant students leave the unset segment
    expect(counts.dormant).toBe(3);
    expect(counts.all_active).toBe(25);
  });

  it('partitions every student into exactly one of all_active or dormant', () => {
    const counts = segmentCounts(rows);
    expect(counts.all_active + counts.dormant).toBe(rows.length);
  });

  it('derives exam_this_year as break-year plus Class 12, never stored', () => {
    const stages = stageCounts(rows);
    const segments = segmentCounts(rows);
    const dormantExam = rows.filter((r) => r.dormant && isExamThisYear(r.stage)).length;
    expect(segments.exam_this_year).toBe(stages.gap_year + stages['12th'] - dormantExam);
  });

  it('counts dormant students under their own stage in stageCounts', () => {
    expect(stageCounts(rows).unset).toBe(19);
  });

  it('returns a zeroed record for an empty classroom', () => {
    const counts = segmentCounts([]);
    for (const segment of SEGMENT_ORDER) expect(counts[segment]).toBe(0);
  });
});

describe('describeClassificationChange', () => {
  it('names a single class edit', () => {
    expect(describeClassificationChange({ studyStage: '11th' })).toBe('Class set');
    expect(describeClassificationChange({ studyStage: null })).toBe('Cleared class');
  });

  it('names a single exam year edit', () => {
    expect(describeClassificationChange({ academicYear: '2027-28' })).toBe('Exam year set');
    expect(describeClassificationChange({ academicYear: null })).toBe('Cleared exam year');
  });

  it('names a single language edit by what it now says', () => {
    expect(describeClassificationChange({ homeLanguage: 'tamil' })).toBe('Marked Tamil');
    expect(describeClassificationChange({ homeLanguage: 'kannada' })).toBe('Marked Kannada');
    expect(describeClassificationChange({ homeLanguage: 'english' })).toBe('Marked English');
    // Only Undo sends null, because the sheet offers no way to clear a language.
    expect(describeClassificationChange({ homeLanguage: null })).toBe('Cleared language');
  });

  it('names the English fluency tick on its own', () => {
    expect(describeClassificationChange({ limitedEnglish: true })).toBe('Marked limited English');
    expect(describeClassificationChange({ limitedEnglish: false })).toBe('Cleared limited English');
  });

  it('calls both halves of the language one field, because they are one gesture', () => {
    expect(describeClassificationChange({ homeLanguage: 'hindi', limitedEnglish: true })).toBe(
      'Language set',
    );
  });

  it('lists every field when several changed at once', () => {
    expect(describeClassificationChange({ studyStage: '12th', academicYear: '2026-27' })).toBe(
      'Class and exam year set',
    );
    expect(describeClassificationChange({ studyStage: '12th', homeLanguage: 'tamil' })).toBe(
      'Class and language set',
    );
    expect(describeClassificationChange({ academicYear: null, limitedEnglish: true })).toBe(
      'Exam year and language set',
    );
    expect(
      describeClassificationChange({
        studyStage: '10th',
        academicYear: '2028-29',
        homeLanguage: 'malayalam',
      }),
    ).toBe('Class, exam year and language set');
  });

  it('treats a key that is present but undefined as untouched', () => {
    expect(describeClassificationChange({ studyStage: '11th', homeLanguage: undefined })).toBe(
      'Class set',
    );
  });

  it('falls back to a neutral word when nothing was touched', () => {
    expect(describeClassificationChange({})).toBe('Updated');
  });
});

import { describe, it, expect } from 'vitest';
import {
  ACADEMIC_YEAR_REGEX,
  academicYearOptions,
  addAcademicYears,
  currentAcademicYear,
  deriveAcademicYearFromExamYear,
  examYearFromAcademicYear,
  expectedYearForStage,
  pairStatus,
  parseExamYearAnswer,
  startYearOf,
  yearTier,
} from './academic-year';

describe('startYearOf', () => {
  it('reads the start year out of a well-formed code', () => {
    expect(startYearOf('2026-27')).toBe(2026);
    expect(startYearOf('2099-00')).toBe(2099);
  });

  it('rejects anything that is not YYYY-YY', () => {
    expect(startYearOf(null)).toBeNull();
    expect(startYearOf(undefined)).toBeNull();
    expect(startYearOf('')).toBeNull();
    expect(startYearOf('2026')).toBeNull();
    expect(startYearOf('2026-2027')).toBeNull();
    expect(startYearOf('26-27')).toBeNull();
  });
});

describe('currentAcademicYear', () => {
  it('treats April as the start of the academic year (India)', () => {
    // Local-component dates avoid timezone parsing drift
    expect(currentAcademicYear(new Date(2026, 2, 31))).toBe('2025-26'); // March
    expect(currentAcademicYear(new Date(2026, 3, 1))).toBe('2026-27'); // April
  });

  it('returns the YYYY-YY format for the current date', () => {
    expect(currentAcademicYear()).toMatch(ACADEMIC_YEAR_REGEX);
  });
});

describe('examYearFromAcademicYear', () => {
  it('is the start year plus one, which is what the batch registry labels', () => {
    // academic_batches seeds '2026-27' with the label 'NATA/JEE 2027'.
    expect(examYearFromAcademicYear('2026-27')).toBe(2027);
    expect(examYearFromAcademicYear('2027-28')).toBe(2028);
  });

  it('returns null for a malformed code', () => {
    expect(examYearFromAcademicYear('nonsense')).toBeNull();
    expect(examYearFromAcademicYear(null)).toBeNull();
  });
});

describe('deriveAcademicYearFromExamYear', () => {
  it('maps an exam year to the preparing academic year', () => {
    expect(deriveAcademicYearFromExamYear(2026)).toBe('2025-26');
    expect(deriveAcademicYearFromExamYear(2027)).toBe('2026-27');
    expect(deriveAcademicYearFromExamYear(2030)).toBe('2029-30');
  });

  it('pads the trailing two digits across a century boundary', () => {
    expect(deriveAcademicYearFromExamYear(2100)).toBe('2099-00');
  });

  it('returns null for missing or out-of-range input', () => {
    expect(deriveAcademicYearFromExamYear(null)).toBeNull();
    expect(deriveAcademicYearFromExamYear(undefined)).toBeNull();
    expect(deriveAcademicYearFromExamYear(1999)).toBeNull();
    expect(deriveAcademicYearFromExamYear(2.5 as unknown as number)).toBeNull();
  });

  it('returns null for NaN, which is how an unparsed form value arrives', () => {
    // The apply form emits '2026-27'; Number('2026-27') is NaN. Letting that
    // through is what stamped every applicant with the current cohort.
    expect(deriveAcademicYearFromExamYear(Number('2026-27'))).toBeNull();
  });

  it('round-trips against examYearFromAcademicYear', () => {
    for (let y = 2024; y <= 2032; y++) {
      const code = deriveAcademicYearFromExamYear(y);
      expect(code).toMatch(ACADEMIC_YEAR_REGEX);
      expect(examYearFromAcademicYear(code)).toBe(y);
    }
  });
});

describe('addAcademicYears', () => {
  it('shifts by whole years', () => {
    expect(addAcademicYears('2026-27', 1)).toBe('2027-28');
    expect(addAcademicYears('2026-27', 2)).toBe('2028-29');
    expect(addAcademicYears('2026-27', -1)).toBe('2025-26');
    expect(addAcademicYears('2026-27', 0)).toBe('2026-27');
  });

  it('returns null rather than a bogus code for bad input', () => {
    expect(addAcademicYears(null, 1)).toBeNull();
    expect(addAcademicYears('2026', 1)).toBeNull();
  });
});

describe('academicYearOptions', () => {
  it('runs from two years ahead down to 2022-23, newest first', () => {
    const options = academicYearOptions(new Date(2026, 6, 30));
    expect(options[0]).toBe('2028-29');
    expect(options[options.length - 1]).toBe('2022-23');
    expect(options).toContain('2026-27');
  });

  it('produces only well-formed codes', () => {
    for (const code of academicYearOptions()) {
      expect(code).toMatch(ACADEMIC_YEAR_REGEX);
    }
  });
});

describe('parseExamYearAnswer', () => {
  it('reads the apply form\'s academic-year dropdown value', () => {
    // This is the case every intake route got wrong: Number('2026-27') is NaN.
    expect(parseExamYearAnswer('2026-27')).toEqual({ examYear: 2027, academicYear: '2026-27' });
    expect(parseExamYearAnswer('2027-28')).toEqual({ examYear: 2028, academicYear: '2027-28' });
  });

  it('reads an integer calendar exam year, which is what admin writes', () => {
    expect(parseExamYearAnswer(2027)).toEqual({ examYear: 2027, academicYear: '2026-27' });
    expect(parseExamYearAnswer('2027')).toEqual({ examYear: 2027, academicYear: '2026-27' });
  });

  it('returns nulls rather than a guess for an unusable answer', () => {
    // Persisting the nulls is the point: a missing exam year is visibly missing
    // and gets fixed, whereas a confidently wrong one does not.
    for (const bad of [null, undefined, '', 'next year', 'soon', {}, [], NaN, 0]) {
      expect(parseExamYearAnswer(bad)).toEqual({ examYear: null, academicYear: null });
    }
  });

  it('rejects an out-of-range year', () => {
    expect(parseExamYearAnswer(1999)).toEqual({ examYear: null, academicYear: null });
    expect(parseExamYearAnswer(3000)).toEqual({ examYear: null, academicYear: null });
  });

  it('agrees with itself: the two outputs always describe the same exam', () => {
    for (const input of ['2025-26', '2026-27', '2027-28', 2026, 2027, 2030]) {
      const { examYear, academicYear } = parseExamYearAnswer(input);
      expect(examYearFromAcademicYear(academicYear)).toBe(examYear);
    }
  });
});

describe('yearTier', () => {
  const C = '2026-27';

  it('classifies relative to the current cohort', () => {
    expect(yearTier('2026-27', C)).toBe('this_year');
    expect(yearTier('2027-28', C)).toBe('next_year');
    expect(yearTier('2028-29', C)).toBe('later');
    expect(yearTier('2029-30', C)).toBe('later');
    expect(yearTier('2025-26', C)).toBe('past');
    expect(yearTier('2024-25', C)).toBe('past');
  });

  it('reports unset for a missing or malformed year', () => {
    expect(yearTier(null, C)).toBe('unset');
    expect(yearTier('garbage', C)).toBe('unset');
    expect(yearTier('2026-27', 'garbage')).toBe('unset');
  });
});

describe('expectedYearForStage', () => {
  const C = '2026-27';

  it('puts Break Year and Class 12 in the current cohort', () => {
    // Both sit the exam this year, which is exactly why gap_year is the top
    // priority group rather than a lapsed one.
    expect(expectedYearForStage('gap_year', C)).toBe('2026-27');
    expect(expectedYearForStage('12th', C)).toBe('2026-27');
  });

  it('pushes each lower class out by one year', () => {
    expect(expectedYearForStage('11th', C)).toBe('2027-28');
    expect(expectedYearForStage('10th', C)).toBe('2028-29');
  });

  it('has no opinion when the class is unknown', () => {
    expect(expectedYearForStage('unset', C)).toBeNull();
    expect(expectedYearForStage(null, C)).toBeNull();
    expect(expectedYearForStage(undefined, C)).toBeNull();
  });

  it('returns null rather than echoing a malformed current cohort', () => {
    expect(expectedYearForStage('12th', 'garbage')).toBeNull();
    expect(expectedYearForStage('11th', 'garbage')).toBeNull();
  });
});

describe('pairStatus', () => {
  const C = '2026-27';

  it('flags the exact production bug: a Class 11 student on the current cohort', () => {
    // Humaira, YahulKishore and Abhitha all looked like this. The public apply
    // form stamped them with the current cohort regardless of their class.
    expect(pairStatus('11th', '2026-27', C)).toBe('mismatch');
  });

  it('accepts the corrected pairing', () => {
    expect(pairStatus('11th', '2027-28', C)).toBe('ok');
  });

  it('accepts both exam-this-year classes on the current cohort', () => {
    expect(pairStatus('12th', '2026-27', C)).toBe('ok');
    expect(pairStatus('gap_year', '2026-27', C)).toBe('ok');
  });

  it('flags an exam-this-year class parked on a future cohort', () => {
    expect(pairStatus('12th', '2027-28', C)).toBe('mismatch');
    expect(pairStatus('gap_year', '2025-26', C)).toBe('mismatch');
  });

  it('accepts Class 10 two years out and flags it one year out', () => {
    expect(pairStatus('10th', '2028-29', C)).toBe('ok');
    expect(pairStatus('10th', '2027-28', C)).toBe('mismatch');
  });

  it('distinguishes the three incomplete states, because each has its own fix', () => {
    expect(pairStatus(null, null, C)).toBe('unknown');
    expect(pairStatus('unset', null, C)).toBe('unknown');
    expect(pairStatus(null, '2026-27', C)).toBe('no_stage');
    expect(pairStatus('unset', '2026-27', C)).toBe('no_stage');
    // Chetana AjayKumar: Break Year set, no exam year.
    expect(pairStatus('gap_year', null, C)).toBe('no_year');
  });

  it('never manufactures a mismatch from a malformed current cohort', () => {
    expect(pairStatus('11th', '2026-27', 'garbage')).toBe('ok');
  });

  it('treats a malformed stored year as missing, not as a mismatch', () => {
    expect(pairStatus('11th', '2026', C)).toBe('no_year');
  });
});

describe('the classroom in the screenshots', () => {
  const C = '2026-27';
  // Exactly the six rows the stakeholder pointed at.
  const roster = [
    { name: 'Humaira safrin', stage: '11th' as const, year: '2026-27' },
    { name: 'YahulKishore Nandhakumar', stage: '11th' as const, year: '2026-27' },
    { name: 'Abhitha SR SARAVANAN', stage: '11th' as const, year: '2026-27' },
    { name: 'Aryakumar Amitkumar', stage: '11th' as const, year: '2027-28' },
    { name: 'Bavishiya Senthilkumar', stage: 'gap_year' as const, year: '2026-27' },
    { name: 'Chetana AjayKumar', stage: 'gap_year' as const, year: null },
  ];

  it('finds three mismatches and one missing year', () => {
    const statuses = roster.map((r) => ({ name: r.name, status: pairStatus(r.stage, r.year, C) }));

    expect(statuses.filter((s) => s.status === 'mismatch').map((s) => s.name)).toEqual([
      'Humaira safrin',
      'YahulKishore Nandhakumar',
      'Abhitha SR SARAVANAN',
    ]);
    expect(statuses.filter((s) => s.status === 'no_year').map((s) => s.name)).toEqual([
      'Chetana AjayKumar',
    ]);
    expect(statuses.filter((s) => s.status === 'ok')).toHaveLength(2);
  });

  it('suggests 2027-28 as the fix for each mismatched Class 11 student', () => {
    const broken = roster.filter((r) => pairStatus(r.stage, r.year, C) === 'mismatch');
    for (const student of broken) {
      expect(expectedYearForStage(student.stage, C)).toBe('2027-28');
    }
  });
});

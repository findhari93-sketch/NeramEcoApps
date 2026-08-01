import { describe, it, expect } from 'vitest';
import {
  APPLICANT_CATEGORY_LABEL,
  BOARD_LABEL,
  CASTE_CATEGORY_LABEL,
  EMPTY_SENTENCE,
  LEARNING_MODE_LABEL,
  LOCATION_SOURCE_LABEL,
  NOT_RECORDED,
  SCHOOL_TYPE_LABEL,
  absent,
  describeAcademicData,
  formatCurrencyINR,
  formatDateIN,
  formatDateTimeIN,
  formatPercent,
  formatPhone,
  humanise,
  labelFor,
  maskAadhaar,
  yesNo,
} from './student-profile-fields';

describe('absent', () => {
  it('turns every flavour of empty into one string', () => {
    expect(absent(null)).toBe(NOT_RECORDED);
    expect(absent(undefined)).toBe(NOT_RECORDED);
    expect(absent('')).toBe(NOT_RECORDED);
    expect(absent('   ')).toBe(NOT_RECORDED);
  });

  it('passes real values through, including zero and false', () => {
    // 0 marks and "not accepted" are facts, not absences.
    expect(absent(0)).toBe('0');
    expect(absent(false)).toBe('false');
    expect(absent('Chennai')).toBe('Chennai');
  });
});

describe('academic_data: the four shapes', () => {
  it('renders a school student from applicant_category', () => {
    const view = describeAcademicData('school_student', {
      current_class: '12',
      school_name: 'DAV Higher Secondary',
      board: 'cbse',
      school_type: 'private_school',
      previous_percentage: 87.5,
    });

    expect(view.shape).toBe('school');
    expect(view.fellBack).toBe(false);
    expect(view.rows).toEqual([
      { label: 'Class', value: '12' },
      { label: 'School', value: 'DAV Higher Secondary' },
      { label: 'Board', value: 'CBSE' },
      { label: 'School type', value: 'Private school' },
      { label: 'Previous percentage', value: '87.5%' },
    ]);
  });

  it('renders a diploma student', () => {
    const view = describeAcademicData('diploma_student', {
      college_name: 'Government Polytechnic',
      department: 'Civil Engineering',
      completed_grade: '10th',
      marks: 72,
    });

    expect(view.shape).toBe('diploma');
    expect(view.fellBack).toBe(false);
    expect(view.rows.map((r) => r.label)).toEqual([
      'College',
      'Department',
      'Completed before diploma',
      'Marks',
    ]);
    expect(view.rows[3].value).toBe('72.0%');
  });

  it('renders a college student', () => {
    const view = describeAcademicData('college_student', {
      college_name: 'Anna University',
      department: 'Architecture',
      year_of_study: 2,
      twelfth_year: 2023,
      twelfth_percentage: 91,
      reason_for_exam: 'Wants to switch to a five year B.Arch',
    });

    expect(view.shape).toBe('college');
    expect(view.fellBack).toBe(false);
    expect(view.rows).toHaveLength(6);
    expect(view.rows[2]).toEqual({ label: 'Year of study', value: '2' });
  });

  it('renders a working professional', () => {
    const view = describeAcademicData('working_professional', {
      twelfth_year: 2016,
      occupation: 'Site supervisor',
      company: 'Larsen and Toubro',
    });

    expect(view.shape).toBe('working');
    expect(view.fellBack).toBe(false);
    expect(view.rows).toHaveLength(3);
  });
});

describe('academic_data: it must never throw or blank the section', () => {
  it('falls back to a raw list when the payload does not match its category', () => {
    // A real hazard: the column is not revalidated when the category changes.
    const view = describeAcademicData('working_professional', {
      some_legacy_key: 'a value',
      another: 42,
    });

    expect(view.shape).toBeNull();
    expect(view.fellBack).toBe(true);
    expect(view.rows).toEqual([
      { label: 'Some legacy key', value: 'a value' },
      { label: 'Another', value: '42' },
    ]);
  });

  it('recognises the payload on its own when the category is wrong', () => {
    // Category says working professional, payload is plainly a school student.
    // Trust the payload, and flag that the two disagree.
    const view = describeAcademicData('working_professional', {
      current_class: '11',
      school_name: 'Vidya Mandir',
      board: 'state_tn',
    });

    expect(view.shape).toBe('school');
    expect(view.fellBack).toBe(true);
    expect(view.rows[0]).toEqual({ label: 'Class', value: '11' });
  });

  it('handles a category that is null or unknown', () => {
    const view = describeAcademicData(null, {
      current_class: '10',
      school_name: 'St Johns',
      board: 'icse',
    });
    expect(view.shape).toBe('school');

    const unknown = describeAcademicData('astronaut', { occupation: 'Pilot' });
    expect(unknown.shape).toBe('working');
  });

  it('parses a payload stored as a JSON string', () => {
    const view = describeAcademicData(
      'school_student',
      JSON.stringify({ current_class: '9', school_name: 'PSBB', board: 'cbse' }),
    );
    expect(view.shape).toBe('school');
    expect(view.rows[1].value).toBe('PSBB');
  });

  it('renders the empty state for null, {}, [] and unparseable JSON', () => {
    for (const input of [null, undefined, {}, [], 'not json at all', '']) {
      const view = describeAcademicData('school_student', input);
      expect(view.rows).toEqual([]);
      expect(view.shape).toBeNull();
    }
  });

  it('shows NOT_RECORDED for optional fields rather than dropping the row', () => {
    // The row must survive: "we asked and they left it blank" is information.
    const view = describeAcademicData('school_student', {
      current_class: '12',
      school_name: 'Kendriya Vidyalaya',
      board: 'cbse',
    });

    expect(view.rows).toHaveLength(5);
    expect(view.rows[3].value).toBe(NOT_RECORDED); // school_type
    expect(view.rows[4].value).toBe(NOT_RECORDED); // previous_percentage
  });
});

describe('formatters handle null without producing a misleading zero', () => {
  it('formatCurrencyINR', () => {
    expect(formatCurrencyINR(null)).toBe(NOT_RECORDED);
    expect(formatCurrencyINR(undefined)).toBe(NOT_RECORDED);
    expect(formatCurrencyINR(NaN)).toBe(NOT_RECORDED);
    // A real zero balance is a fact and must still render as money.
    expect(formatCurrencyINR(0)).toContain('0');
    expect(formatCurrencyINR(45000)).toContain('45,000');
  });

  it('formatPercent', () => {
    expect(formatPercent(null)).toBe(NOT_RECORDED);
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(87.456, 1)).toBe('87.5%');
  });

  it('formatDateIN and formatDateTimeIN', () => {
    expect(formatDateIN(null)).toBe(NOT_RECORDED);
    expect(formatDateIN('not a date')).toBe(NOT_RECORDED);
    expect(formatDateIN('2026-03-15T00:00:00Z')).toContain('2026');
    expect(formatDateTimeIN(null)).toBe(NOT_RECORDED);
    expect(formatDateTimeIN('nonsense')).toBe(NOT_RECORDED);
  });

  it('renders dates in IST, so a late-evening UTC stamp is not shown a day early', () => {
    // 19:00 UTC on 15 March is 00:30 IST on 16 March. Rendering in UTC would
    // print "15 Mar" and put an event on the wrong day for every user we have.
    expect(formatDateIN('2026-03-15T19:00:00Z')).toContain('16 Mar');
    // Still the 15th in IST at 23:30, so the pin must not over-correct either.
    expect(formatDateIN('2026-03-15T18:00:00Z')).toContain('15 Mar');
  });

  it('formatPhone', () => {
    expect(formatPhone(null)).toBe(NOT_RECORDED);
    expect(formatPhone('9876543210')).toBe('98765 43210');
    expect(formatPhone('+919876543210')).toBe('+91 98765 43210');
    expect(formatPhone('044-2345-6789')).toBe('044-2345-6789');
  });

  it('yesNo distinguishes false from unknown', () => {
    expect(yesNo(true)).toBe('Yes');
    expect(yesNo(false)).toBe('No');
    expect(yesNo(null)).toBe(NOT_RECORDED);
  });
});

describe('maskAadhaar', () => {
  it('shows only the last four digits', () => {
    expect(maskAadhaar('123456789012')).toBe('XXXX XXXX 9012');
    expect(maskAadhaar('1234 5678 9012')).toBe('XXXX XXXX 9012');
  });

  it('never leaks the full number for any input', () => {
    const full = '123456789012';
    expect(maskAadhaar(full)).not.toContain('12345678');
  });

  it('handles missing and malformed values', () => {
    expect(maskAadhaar(null)).toBe(NOT_RECORDED);
    expect(maskAadhaar('')).toBe(NOT_RECORDED);
    expect(maskAadhaar('12')).toBe('Not a valid Aadhaar number');
  });
});

describe('labelFor and humanise', () => {
  it('falls back to a readable form for an unmapped value', () => {
    expect(labelFor(BOARD_LABEL, 'cbse')).toBe('CBSE');
    expect(labelFor(BOARD_LABEL, 'some_new_board')).toBe('Some new board');
    expect(labelFor(BOARD_LABEL, null)).toBe(NOT_RECORDED);
  });

  it('humanises snake_case and kebab-case', () => {
    expect(humanise('working_professional')).toBe('Working professional');
    expect(humanise('dead-lead')).toBe('Dead lead');
  });
});

describe('house style', () => {
  const BANNED = /—|--|&mdash;/;

  it('no user-visible string uses an em dash or a double dash', () => {
    const strings: string[] = [
      NOT_RECORDED,
      ...Object.values(EMPTY_SENTENCE),
      ...Object.values(APPLICANT_CATEGORY_LABEL),
      ...Object.values(CASTE_CATEGORY_LABEL),
      ...Object.values(LEARNING_MODE_LABEL),
      ...Object.values(SCHOOL_TYPE_LABEL),
      ...Object.values(LOCATION_SOURCE_LABEL),
      ...Object.values(BOARD_LABEL),
    ];

    for (const s of strings) {
      expect(s, `banned punctuation in: ${s}`).not.toMatch(BANNED);
    }
  });

  it('no academic_data label uses banned punctuation', () => {
    const payloads: Array<[string, Record<string, unknown>]> = [
      ['school_student', { current_class: '12', school_name: 'X', board: 'cbse' }],
      ['diploma_student', { college_name: 'X', department: 'Y', completed_grade: '10th' }],
      ['college_student', { college_name: 'X', department: 'Y', year_of_study: 1 }],
      ['working_professional', { twelfth_year: 2015, occupation: 'Z' }],
    ];

    for (const [category, payload] of payloads) {
      for (const r of describeAcademicData(category, payload).rows) {
        expect(r.label).not.toMatch(BANNED);
      }
    }
  });
});

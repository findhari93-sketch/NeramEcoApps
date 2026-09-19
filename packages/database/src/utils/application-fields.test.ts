import { describe, it, expect } from 'vitest';
import { ACADEMIC_YEAR_REGEX } from './academic-year';
import {
  examYearOptions,
  validateApplicationAnswers,
  toUserUpdates,
  toLeadUpdates,
  APPLICATION_CLASS_OPTIONS,
} from './application-fields';

/** A school student's answers with nothing wrong, so each test can break one thing. */
const good = {
  first_name: 'Ooveya',
  father_name: 'Velmurugan',
  date_of_birth: '2009-10-06',
  applicant_category: 'school_student',
  current_class: '12',
  target_exam_year: '2026-27',
  city: 'Chennai',
  state: 'Tamil Nadu',
};

function errorsFor(patch: Record<string, unknown>) {
  const result = validateApplicationAnswers({ ...good, ...patch });
  return result.ok ? [] : result.errors.map((e) => e.field);
}

describe('validateApplicationAnswers accepts', () => {
  it('a complete school student', () => {
    const result = validateApplicationAnswers(good);
    expect(result.ok).toBe(true);
  });

  it('a college student who gave a college instead of a class', () => {
    const result = validateApplicationAnswers({
      ...good,
      applicant_category: 'college_student',
      current_class: undefined,
      college_name: 'Anna University',
    });
    expect(result.ok).toBe(true);
  });

  it('a working professional with neither class nor college', () => {
    const result = validateApplicationAnswers({
      ...good,
      applicant_category: 'working_professional',
      current_class: undefined,
    });
    expect(result.ok).toBe(true);
  });

  it('optional fields left out entirely', () => {
    expect(validateApplicationAnswers(good).ok).toBe(true);
  });
});

describe('validateApplicationAnswers refuses', () => {
  it('a payload that is not an object', () => {
    for (const raw of [null, undefined, 'x', 42, []]) {
      expect(validateApplicationAnswers(raw).ok).toBe(false);
    }
  });

  it('any key the form does not own, rather than dropping it silently', () => {
    // A dropped key is how a caller quietly writes a field it should not.
    const result = validateApplicationAnswers({ ...good, final_fee: 0, status: 'approved' });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors[0].message).toMatch(/not a field on this form/);
  });

  it('a blank name, a placeholder name, or an overlong one', () => {
    expect(errorsFor({ first_name: '' })).toContain('first_name');
    expect(errorsFor({ first_name: '   ' })).toContain('first_name');
    expect(errorsFor({ first_name: 'User' })).toContain('first_name');
    expect(errorsFor({ first_name: 'N/A' })).toContain('first_name');
    expect(errorsFor({ first_name: 'x'.repeat(81) })).toContain('first_name');
  });

  it('a date of birth that is malformed, in the future, or implausible', () => {
    expect(errorsFor({ date_of_birth: '06-10-2009' })).toContain('date_of_birth');
    expect(errorsFor({ date_of_birth: '2099-01-01' })).toContain('date_of_birth');
    expect(errorsFor({ date_of_birth: '1890-01-01' })).toContain('date_of_birth');
    expect(errorsFor({ date_of_birth: '' })).toContain('date_of_birth');
  });

  it('a school student with no class, but not a college student', () => {
    expect(errorsFor({ current_class: undefined })).toContain('current_class');
    expect(
      errorsFor({ applicant_category: 'college_student', current_class: undefined, college_name: 'X' }),
    ).not.toContain('current_class');
  });

  it('a college student with no college', () => {
    expect(
      errorsFor({ applicant_category: 'college_student', current_class: undefined }),
    ).toContain('college_name');
  });

  it('a value that is not one of the offered options', () => {
    expect(errorsFor({ applicant_category: 'astronaut' })).toContain('applicant_category');
    expect(errorsFor({ current_class: '13' })).toContain('current_class');
    expect(errorsFor({ gender: 'yes' })).toContain('gender');
    expect(errorsFor({ interest_course: 'medicine' })).toContain('interest_course');
  });

  it('an exam year given as a calendar year, which the old forms sent', () => {
    // Only cohort codes are accepted, so the two conventions cannot drift again.
    expect(errorsFor({ target_exam_year: '2027' })).toContain('target_exam_year');
    expect(errorsFor({ target_exam_year: 'next year' })).toContain('target_exam_year');
    expect(errorsFor({ target_exam_year: '' })).toContain('target_exam_year');
  });

  it('a pincode that is not six digits', () => {
    expect(errorsFor({ pincode: '6000' })).toContain('pincode');
    expect(errorsFor({ pincode: 'abcdef' })).toContain('pincode');
    expect(errorsFor({ pincode: '600001' })).not.toContain('pincode');
  });

  it('a phone number that could not be one', () => {
    expect(errorsFor({ phone: '123' })).toContain('phone');
    expect(errorsFor({ parent_phone: 'call me' })).toContain('parent_phone');
    expect(errorsFor({ phone: '+91 79044 79062' })).not.toContain('phone');
  });

  it('a blank city or state', () => {
    expect(errorsFor({ city: '' })).toContain('city');
    expect(errorsFor({ state: '  ' })).toContain('state');
  });

  it('and reports every problem at once, not just the first', () => {
    const result = validateApplicationAnswers({});
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors.length).toBeGreaterThan(4);
  });
});

describe('error messages', () => {
  it('read as a person speaking, with no em dash or double dash', () => {
    const result = validateApplicationAnswers({});
    if (result.ok) throw new Error('expected errors');
    for (const error of result.errors) {
      expect(error.message).not.toMatch(/—|--/);
      expect(error.message.length).toBeGreaterThan(5);
    }
  });
});

describe('toLeadUpdates', () => {
  it('turns a cohort code into an exam year, never NaN', () => {
    const { fields } = toLeadUpdates({ target_exam_year: '2026-27' });
    expect(fields.target_exam_year).toBe(2027);
    expect(Number.isNaN(fields.target_exam_year as number)).toBe(false);
  });

  it('omits the exam year entirely when it cannot be read', () => {
    const { fields } = toLeadUpdates({ target_exam_year: 'rubbish' });
    expect('target_exam_year' in fields).toBe(false);
  });

  it('nests the class inside the academic data patch, never at the top level', () => {
    const { fields, academicDataPatch } = toLeadUpdates({ current_class: '12', school_name: 'A School' });
    expect(academicDataPatch).toEqual({ current_class: '12', school_name: 'A School' });
    expect('current_class' in fields).toBe(false);
  });

  it('returns an empty patch when nothing academic was answered, so a merge is a no-op', () => {
    const { academicDataPatch } = toLeadUpdates({ city: 'Chennai' });
    expect(academicDataPatch).toEqual({});
  });

  it('never emits a key for an answer that was not given', () => {
    const { fields } = toLeadUpdates({ city: 'Chennai' });
    expect(Object.keys(fields)).toEqual(['city']);
  });
});

describe('toUserUpdates', () => {
  it('carries date of birth and gender to the users row', () => {
    expect(toUserUpdates({ date_of_birth: '2009-10-06', gender: 'female' })).toEqual({
      date_of_birth: '2009-10-06',
      gender: 'female',
    });
  });

  it('leaves the name and phone to the caller, which applies the only-if-empty rule', () => {
    const updates = toUserUpdates({ first_name: 'Ooveya', phone: '+917904479062' });
    expect(updates).toEqual({});
  });
});

describe('examYearOptions', () => {
  it('offers four cohort codes that all parse', () => {
    const options = examYearOptions(new Date('2026-09-18T00:00:00Z'));
    expect(options).toHaveLength(4);
    for (const option of options) {
      expect(option.value).toMatch(ACADEMIC_YEAR_REGEX);
    }
  });

  it('starts from the current academic year, which turns over in April', () => {
    expect(examYearOptions(new Date('2026-09-18T00:00:00Z'))[0].value).toBe('2026-27');
    // Before April the academic year is still the previous one.
    expect(examYearOptions(new Date('2026-02-01T00:00:00Z'))[0].value).toBe('2025-26');
  });

  it('spells the exam year out, because the code alone has been misread', () => {
    expect(examYearOptions(new Date('2026-09-18T00:00:00Z'))[0].label).toContain('exam in 2027');
  });
});

describe('APPLICATION_CLASS_OPTIONS', () => {
  it('offers finishing Class 12, which the exam cohort is full of', () => {
    expect(APPLICATION_CLASS_OPTIONS.map((o) => o.value)).toContain('12_completed');
  });
});

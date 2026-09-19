import { describe, it, expect } from 'vitest';
import {
  REQUIRED_APPLICATION_FIELDS,
  assessApplication,
  isApplicationComplete,
} from './application-completeness';

/** A lead row that passes every check, so each test can blank exactly one field. */
const fullLead = {
  first_name: 'Ooveya',
  father_name: 'Velmurugan',
  date_of_birth: '2009-10-06',
  applicant_category: 'school_student',
  academic_data: { current_class: '12', school_name: 'A School', board: 'cbse' },
  target_exam_year: 2027,
  city: 'Chennai',
  state: 'Tamil Nadu',
};

describe('assessApplication: no form at all', () => {
  it('is missing, not partial, and lists every field', () => {
    const result = assessApplication({ lead: null, user: { name: 'Ooveya' } });
    expect(result.state).toBe('missing');
    expect(result.missing).toEqual([...REQUIRED_APPLICATION_FIELDS]);
  });

  it('is missing when lead is undefined or the input is empty', () => {
    expect(assessApplication({}).state).toBe('missing');
    expect(assessApplication({ lead: undefined, user: undefined }).state).toBe('missing');
  });

  it('never reports missing for a student who simply has no row', () => {
    // Regression guard: 'missing' is the chase list. Collapsing it into 'partial'
    // would bury the 28 students who have given us nothing at all.
    expect(assessApplication({ lead: null }).state).not.toBe('partial');
  });
});

describe('assessApplication: a full form', () => {
  it('is complete with nothing missing and an empty summary', () => {
    const result = assessApplication({ lead: fullLead, user: {} });
    expect(result.state).toBe('complete');
    expect(result.missing).toEqual([]);
    expect(result.summary).toBe('');
    expect(isApplicationComplete({ lead: fullLead, user: {} })).toBe(true);
  });
});

describe('assessApplication: fields that live on both tables', () => {
  it('accepts a date of birth from users when the lead has none', () => {
    const result = assessApplication({
      lead: { ...fullLead, date_of_birth: null },
      user: { date_of_birth: '2009-10-06' },
    });
    expect(result.state).toBe('complete');
  });

  it('accepts a date of birth from the lead when users has none', () => {
    const result = assessApplication({
      lead: fullLead,
      user: { date_of_birth: null },
    });
    expect(result.state).toBe('complete');
  });

  it('reports it missing only when neither table has one', () => {
    const result = assessApplication({
      lead: { ...fullLead, date_of_birth: null },
      user: { date_of_birth: null },
    });
    expect(result.missing).toContain('date_of_birth');
  });

  it('accepts a first name from users.first_name or users.name', () => {
    const lead = { ...fullLead, first_name: null };
    expect(assessApplication({ lead, user: { first_name: 'Ooveya' } }).state).toBe('complete');
    expect(assessApplication({ lead, user: { name: 'Ooveya Velmurugan' } }).state).toBe('complete');
  });
});

describe('assessApplication: placeholder names', () => {
  it('does not accept the apply form placeholder as a real name', () => {
    // A phone sign-in creates a users row literally called "User".
    const lead = { ...fullLead, first_name: null };
    const result = assessApplication({ lead, user: { name: 'User' } });
    expect(result.missing).toContain('first_name');
  });

  it('rejects the placeholder whatever its casing or padding', () => {
    const lead = { ...fullLead, first_name: null };
    for (const name of ['user', '  USER  ', 'Student', 'Unnamed Student']) {
      expect(assessApplication({ lead, user: { name } }).missing).toContain('first_name');
    }
  });

  it('accepts a real name that merely starts with the placeholder letters', () => {
    const lead = { ...fullLead, first_name: null };
    expect(assessApplication({ lead, user: { name: 'Usha' } }).missing).not.toContain('first_name');
  });
});

describe('assessApplication: the academic detail is category aware', () => {
  it('requires a class from a school student', () => {
    const result = assessApplication({
      lead: { ...fullLead, applicant_category: 'school_student', academic_data: { school_name: 'A School' } },
    });
    expect(result.missing).toContain('academic_detail');
    expect(result.summary).toContain('class');
  });

  it('requires a college name from a college or diploma student, and says "college"', () => {
    for (const category of ['college_student', 'diploma_student']) {
      const result = assessApplication({
        lead: { ...fullLead, applicant_category: category, academic_data: {} },
      });
      expect(result.missing).toContain('academic_detail');
      expect(result.summary).toContain('college');
    }
  });

  it('accepts a college student who gave a college but no class', () => {
    const result = assessApplication({
      lead: {
        ...fullLead,
        applicant_category: 'college_student',
        academic_data: { college_name: 'Anna University', department: 'Architecture' },
      },
    });
    expect(result.state).toBe('complete');
  });

  it('asks a working professional for no academic detail at all', () => {
    for (const category of ['working_professional', 'professional']) {
      const result = assessApplication({
        lead: { ...fullLead, applicant_category: category, academic_data: null },
      });
      expect(result.missing).not.toContain('academic_detail');
      expect(result.state).toBe('complete');
    }
  });

  it('does not accuse a student of hiding a class when no category was given', () => {
    // Missing category is already reported; reporting both reads as two faults
    // for one blank answer.
    const result = assessApplication({
      lead: { ...fullLead, applicant_category: null, academic_data: null },
    });
    expect(result.missing).toContain('applicant_category');
    expect(result.missing).not.toContain('academic_detail');
  });
});

describe('assessApplication: the exam year goes through the shared parser', () => {
  it('accepts a cohort code, which Number() would turn into NaN', () => {
    const result = assessApplication({ lead: { ...fullLead, target_exam_year: '2026-27' } });
    expect(result.missing).not.toContain('target_exam_year');
  });

  it('accepts a calendar exam year as a number or a numeric string', () => {
    expect(assessApplication({ lead: { ...fullLead, target_exam_year: 2027 } }).missing)
      .not.toContain('target_exam_year');
    expect(assessApplication({ lead: { ...fullLead, target_exam_year: '2027' } }).missing)
      .not.toContain('target_exam_year');
  });

  it('reports a blank or unusable year as missing', () => {
    for (const raw of [null, undefined, '', 'next year', 0]) {
      expect(assessApplication({ lead: { ...fullLead, target_exam_year: raw as any } }).missing)
        .toContain('target_exam_year');
    }
  });
});

describe('assessApplication: blank handling', () => {
  it('treats whitespace as blank', () => {
    const result = assessApplication({
      lead: { ...fullLead, city: '   ', state: '\t' },
      user: {},
    });
    expect(result.missing).toContain('city');
    expect(result.missing).toContain('state');
  });

  it('is partial, never missing, once a form exists', () => {
    const result = assessApplication({
      lead: { father_name: 'Velmurugan' },
      user: { name: 'User' },
    });
    expect(result.state).toBe('partial');
  });
});

describe('assessApplication: the summary sentence', () => {
  it('names a single missing field without a list', () => {
    const result = assessApplication({ lead: { ...fullLead, city: null } });
    expect(result.summary).toBe('Missing city.');
  });

  it('joins two with "and"', () => {
    const result = assessApplication({ lead: { ...fullLead, city: null, state: null } });
    expect(result.summary).toBe('Missing city and state.');
  });

  it('joins three or more with commas and a final "and"', () => {
    const result = assessApplication({
      lead: { ...fullLead, date_of_birth: null, city: null, state: null },
      user: {},
    });
    expect(result.summary).toBe('Missing date of birth, city and state.');
  });

  it('reports missing fields in the order a person would ask for them', () => {
    const result = assessApplication({ lead: { father_name: null }, user: {} });
    expect(result.missing).toEqual([...REQUIRED_APPLICATION_FIELDS].filter((f) => f !== 'academic_detail'));
  });

  it('carries no em dash or double dash, which read as machine written', () => {
    const result = assessApplication({ lead: { ...fullLead, city: null, state: null } });
    expect(result.summary).not.toMatch(/—|--/);
    expect(assessApplication({ lead: null }).summary).not.toMatch(/—|--/);
  });
});

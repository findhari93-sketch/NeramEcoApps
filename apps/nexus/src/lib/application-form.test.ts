import { describe, it, expect } from 'vitest';
import { assessApplication } from '@neram/database';
import {
  formClassLabel,
  formExamYear,
  isApplicationForm,
  maskEmail,
  maskPhone,
  pickApplicationForm,
  planApplicationFill,
  type ApplicationForm,
  type FillInput,
} from './application-form';

const TODAY = new Date('2026-09-11T06:00:00Z');
const BATCH = '2026-27';

function form(over: Partial<ApplicationForm> = {}): ApplicationForm {
  return {
    user_id: 'u1',
    application_number: 'NRM-1',
    academic_data: { current_class: '12' },
    applicant_category: 'school_student',
    target_exam_year: 2027,
    created_at: '2026-08-01T10:00:00Z',
    ...over,
  };
}

function plan(over: Partial<FillInput> = {}) {
  return planApplicationFill({
    stage: null,
    academicYear: null,
    form: form(),
    currentBatch: BATCH,
    today: TODAY,
    ...over,
  });
}

describe('isApplicationForm and pickApplicationForm', () => {
  it("does not count a row with only an exam year or a father's name", () => {
    const mirror = form({ application_number: null, academic_data: null, applicant_category: null });
    expect(isApplicationForm(mirror)).toBe(false);
    expect(isApplicationForm({ ...mirror, father_name: 'Raghu' })).toBe(false);
    expect(isApplicationForm({ ...mirror, applicant_category: 'college_student' })).toBe(true);
    expect(isApplicationForm({ ...mirror, application_number: 'NRM-9' })).toBe(true);
  });

  it('prefers the real form over a newer row the profile page made', () => {
    const real = form({ id: 'real', created_at: '2026-08-22T00:00:00Z' });
    const profileRow = form({
      id: 'profile',
      application_number: null,
      academic_data: null,
      applicant_category: null,
      father_name: 'Raghu',
      created_at: '2026-09-01T00:00:00Z',
    });
    expect(pickApplicationForm([profileRow, real])?.id).toBe('real');
  });

  it('prefers an older real form over a newer blank row', () => {
    const real = form({ id: 'real', created_at: '2026-07-01T00:00:00Z' });
    const blank = form({
      id: 'blank',
      application_number: null,
      academic_data: null,
      applicant_category: null,
      created_at: '2026-09-01T00:00:00Z',
    });
    expect(pickApplicationForm([blank, real])?.id).toBe('real');
    expect(pickApplicationForm([blank])).toBeNull();
    expect(pickApplicationForm(null)).toBeNull();
  });
});

describe('formClassLabel and formExamYear', () => {
  it('reads the class, then the category', () => {
    expect(formClassLabel(form())).toBe('Class 12');
    expect(formClassLabel(form({ academic_data: null, applicant_category: 'college_student' }))).toBe(
      'College student',
    );
    expect(formClassLabel(form({ academic_data: null, applicant_category: null }))).toBeNull();
  });

  it('accepts a calendar year as a number or a string and nothing else', () => {
    expect(formExamYear(form())).toBe(2027);
    expect(formExamYear(form({ target_exam_year: '2028' }))).toBe(2028);
    expect(formExamYear(form({ target_exam_year: '2026-27' }))).toBeNull();
    expect(formExamYear(form({ target_exam_year: null }))).toBeNull();
  });
});

describe('planApplicationFill', () => {
  it('fills both from a current form whose class and year agree', () => {
    expect(plan()).toEqual({ studyStage: '12th', academicYear: '2026-27', held: [] });
  });

  it('fills only what is missing', () => {
    expect(plan({ stage: '12th' })).toEqual({ studyStage: null, academicYear: '2026-27', held: [] });
  });

  it('changes nothing for a student with both set', () => {
    expect(plan({ stage: '11th', academicYear: '2027-28' })).toEqual({
      studyStage: null,
      academicYear: null,
      held: [],
    });
  });

  it('never copies an exam year that is already over', () => {
    const result = plan({
      form: form({
        academic_data: null,
        applicant_category: 'college_student',
        target_exam_year: 2026,
        created_at: '2026-08-22T00:00:00Z',
      }),
    });
    expect(result.studyStage).toBe('gap_year');
    expect(result.academicYear).toBeNull();
    expect(result.held).toEqual(['The form says the 2026 exam, which is already over.']);
  });

  it('holds back a class and year that disagree, whichever side came from the form', () => {
    const onForm = plan({ form: form({ academic_data: { current_class: '11' } }) });
    expect(onForm.studyStage).toBeNull();
    expect(onForm.academicYear).toBeNull();
    expect(onForm.held[0]).toMatch(/do not fit together/);

    const alreadySet = plan({ academicYear: '2026-27', form: form({ academic_data: { current_class: '11' } }) });
    expect(alreadySet.studyStage).toBeNull();
  });

  it('copies an old form\'s class only when it fits the exam year', () => {
    const lastYear = form({ academic_data: { current_class: '11' }, target_exam_year: null, created_at: '2026-03-01T00:00:00Z' });
    expect(plan({ academicYear: '2027-28', form: lastYear }).studyStage).toBe('11th');

    const unknownYear = plan({ form: lastYear });
    expect(unknownYear.studyStage).toBeNull();
    expect(unknownYear.held).toEqual(['The form was filled in during 2025-26, so the class on it may be out of date.']);
  });

  it('never copies an exam year without a class to check it against', () => {
    const result = plan({ form: form({ academic_data: null, applicant_category: 'school_student' }) });
    expect(result.academicYear).toBeNull();
    expect(result.held).toEqual(['The form gives an exam year but no class, so the two cannot be checked together.']);
  });

  it('copies only a current class when the batch registry has no current batch', () => {
    expect(plan({ currentBatch: null })).toEqual({ studyStage: '12th', academicYear: null, held: [] });
  });

  it('does nothing without a form', () => {
    expect(plan({ form: null })).toEqual({ studyStage: null, academicYear: null, held: [] });
  });

  it('never uses a dash as punctuation in what it tells staff', () => {
    const sentences = [
      ...plan({ form: form({ target_exam_year: 2026, academic_data: null, applicant_category: 'college_student' }) }).held,
      ...plan({ form: form({ academic_data: { current_class: '11' } }) }).held,
      ...plan({ form: form({ created_at: '2025-06-01T00:00:00Z', target_exam_year: null }) }).held,
      ...plan({ form: form({ academic_data: null }) }).held,
    ];
    expect(sentences.length).toBeGreaterThan(0);
    for (const sentence of sentences) expect(sentence).not.toMatch(/—|--/);
  });
});

describe('masking contact detail', () => {
  it('keeps the last four digits, which is what a person checks against', () => {
    expect(maskPhone('+91 98765 43210')).toBe('XXXXX 3210');
  });

  it('returns null rather than a misleading stub when there is nothing to mask', () => {
    expect(maskPhone(null)).toBeNull();
    expect(maskPhone('12')).toBeNull();
    expect(maskEmail(null)).toBeNull();
    expect(maskEmail('not-an-address')).toBeNull();
  });

  it('leaves the domain readable, because that is the recognisable part', () => {
    expect(maskEmail('ayana.khan@gmail.com')).toBe('aXXX@gmail.com');
  });
});

/**
 * The boundary between the two questions, which look alike and are not.
 *
 * isApplicationForm asks "is this a real form, worth proposing as a merge candidate
 * and trusting for class and exam year". assessApplication asks "do we have the
 * facts". They are allowed to disagree, and they MUST keep disagreeing about a thin
 * row: counting one as a form once hid a student's real form sitting on their other
 * record, and then won as the newest after linking.
 *
 * This test exists so a future refactor cannot quietly merge the two rules.
 */
describe('isApplicationForm and assessApplication answer different questions', () => {
  const thin: ApplicationForm = {
    user_id: 'u1',
    father_name: 'Velmurugan',
    target_exam_year: 2027,
    created_at: '2026-09-01T00:00:00Z',
  };

  it('does not count a row holding only a father name and an exam year as a form', () => {
    expect(isApplicationForm(thin)).toBe(false);
  });

  it('still grades that row, because grading is a different question', () => {
    expect(assessApplication({ lead: thin as any, user: { name: 'Ooveya' } }).state).toBe('partial');
  });

  it('counts a row as a form once it says what the student is studying', () => {
    expect(isApplicationForm({ ...thin, applicant_category: 'school_student' })).toBe(true);
    expect(isApplicationForm({ ...thin, academic_data: { current_class: '12' } })).toBe(true);
    expect(isApplicationForm({ ...thin, application_number: 'NRM-1' })).toBe(true);
  });

  it('reports a student with no row at all as missing, not partial', () => {
    expect(assessApplication({ lead: null }).state).toBe('missing');
  });
});

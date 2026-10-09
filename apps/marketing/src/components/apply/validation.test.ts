import { describe, it, expect } from 'vitest';
import { DEFAULT_FORM_DATA, type ApplicationFormData } from './types';
import {
  validateAboutYou,
  validateYourCourse,
  validateReview,
  validateStep,
  buildDraftPayload,
  buildSubmitPayload,
  remapSavedStep,
  submitRequest,
  SAVED_STATE_VERSION,
} from './validation';

function complete(): ApplicationFormData {
  return {
    ...DEFAULT_FORM_DATA,
    personal: {
      firstName: 'Arun',
      fatherName: 'Rajendran',
      email: '',
      phone: '9876543210',
      phoneCountry: 'IN',
      parentPhone: '',
      phoneVerified: true,
      phoneVerifiedAt: '2026-09-26T10:00:00.000Z',
      dateOfBirth: '2008-03-12',
      gender: '',
    },
    location: { ...DEFAULT_FORM_DATA.location, pincode: '625001', city: 'Madurai', state: 'Tamil Nadu' },
    academic: {
      ...DEFAULT_FORM_DATA.academic,
      applicantCategory: 'school_student',
      targetExamYear: '2027-28',
      schoolStudentData: { current_class: '11', school_name: 'TVS School', board: 'CBSE' },
    },
    course: {
      ...DEFAULT_FORM_DATA.course,
      interestCourse: 'nata',
      feeStructureId: 'fs-1',
      feeStructureLabel: 'NATA 1 Year',
      programType: 'year_long',
    },
    termsAccepted: true,
  };
}

describe('validateAboutYou', () => {
  it('passes a complete step with optional fields empty', () => {
    expect(validateAboutYou(complete())).toEqual({ isValid: true, errors: [] });
  });

  it('does not require email or gender', () => {
    const data = complete();
    data.personal.email = '';
    data.personal.gender = '';
    expect(validateAboutYou(data).isValid).toBe(true);
  });

  it('rejects a malformed email when one is given', () => {
    const data = complete();
    data.personal.email = 'not-an-email';
    expect(validateAboutYou(data).errors.map((e) => e.field)).toEqual(['email']);
  });

  it('requires the phone to be verified', () => {
    const data = complete();
    data.personal.phoneVerified = false;
    expect(validateAboutYou(data).errors.map((e) => e.field)).toContain('phoneVerified');
  });

  it("requires name, father name, I'm currently in and the PIN", () => {
    const data = complete();
    data.personal.firstName = 'A';
    data.personal.fatherName = '';
    data.location.pincode = '';
    data.academic = { ...DEFAULT_FORM_DATA.academic };
    const fields = validateAboutYou(data).errors.map((e) => e.field);
    expect(fields).toEqual(['firstName', 'fatherName', 'currentlyIn', 'pincode']);
  });

  it('in India, a PIN with no place found or typed asks for the city', () => {
    const data = complete();
    data.location.city = ' ';
    data.location.state = '';
    expect(validateAboutYou(data).errors.map((e) => e.field)).toEqual(['city']);
  });

  it('abroad needs a country and a city, never a PIN or state', () => {
    const data = complete();
    data.location = { ...DEFAULT_FORM_DATA.location, country: 'AE', city: 'Dubai' };
    expect(validateAboutYou(data).isValid).toBe(true);
    data.location.city = '';
    expect(validateAboutYou(data).errors.map((e) => e.field)).toEqual(['city']);
  });

  it('"Other country" needs the country name', () => {
    const data = complete();
    data.location = { ...DEFAULT_FORM_DATA.location, country: 'OTHER', countryName: '', city: 'London' };
    expect(validateAboutYou(data).errors.map((e) => e.field)).toEqual(['countryName']);
  });

  it('checks the mobile against its own country, not where the student lives', () => {
    const data = complete();
    data.personal = { ...data.personal, phone: '501234567', phoneCountry: 'AE', phoneVerified: false };
    expect(validateAboutYou(data).errors.map((e) => e.field)).toEqual(['phoneVerified']);
  });

  it('leaves date of birth to Review', () => {
    const data = complete();
    data.personal.dateOfBirth = '';
    expect(validateAboutYou(data).isValid).toBe(true);
  });

  it('accepts "Other" with no category yet (Your studies asks it next)', () => {
    const data = complete();
    data.academic = { ...DEFAULT_FORM_DATA.academic, currentlyIn: 'other' };
    expect(validateAboutYou(data).isValid).toBe(true);
  });

  it('uses i18n keys as messages', () => {
    const data = complete();
    data.personal.firstName = '';
    expect(validateAboutYou(data).errors[0].message).toBe('errors.firstName');
  });
});

describe('validateYourCourse', () => {
  it('passes a complete step', () => {
    expect(validateYourCourse(complete()).isValid).toBe(true);
  });

  it('requires a programme once a course is chosen', () => {
    const data = complete();
    data.course.feeStructureId = null;
    expect(validateYourCourse(data).errors.map((e) => e.field)).toEqual(['programme']);
  });

  it('does not require a programme for not-sure-yet', () => {
    const data = complete();
    data.course.interestCourse = 'not_sure';
    data.course.feeStructureId = null;
    expect(validateYourCourse(data).isValid).toBe(true);
  });

  it('requires the category and its fields, and the exam year, but not caste', () => {
    const data = complete();
    data.academic.casteCategory = null;
    expect(validateYourCourse(data).isValid).toBe(true);
    data.academic.schoolStudentData = { current_class: '', school_name: '', board: '' };
    data.academic.targetExamYear = '';
    expect(validateYourCourse(data).errors.map((e) => e.field)).toEqual([
      'examYear',
      'currentClass',
      'schoolName',
      'board',
    ]);
  });

  it('stops at the category when none is chosen', () => {
    const data = complete();
    data.academic.applicantCategory = null;
    expect(validateYourCourse(data).errors.map((e) => e.field)).toEqual(['category']);
  });
});

describe('validateReview and validateStep', () => {
  it('requires the terms', () => {
    const data = complete();
    data.termsAccepted = false;
    expect(validateReview(data).errors.map((e) => e.field)).toEqual(['terms']);
  });

  it('asks only the date of birth from the personal details (the rest is optional)', () => {
    const data = complete();
    data.personal.dateOfBirth = '';
    data.location.address = '';
    data.personal.parentPhone = '';
    expect(validateReview(data).errors.map((e) => e.field)).toEqual(['dateOfBirth']);
  });

  it('the pay step is always valid', () => {
    expect(validateStep(3, DEFAULT_FORM_DATA).isValid).toBe(true);
  });
});

describe('payloads', () => {
  it('the draft payload after step 0 carries the contact fields', () => {
    const p = buildDraftPayload(complete(), 0);
    expect(p).toMatchObject({
      status: 'draft',
      form_step_completed: 1,
      first_name: 'Arun',
      father_name: 'Rajendran',
      phone: '9876543210',
      date_of_birth: '2008-03-12',
      pincode: '625001',
    });
    expect(p).not.toHaveProperty('interest_course');
    expect(p.email).toBeUndefined();
    expect(p.gender).toBeUndefined();
    // "I'm currently in" already set the class, so an abandoned step-1 lead keeps it.
    expect(p).toMatchObject({ applicant_category: 'school_student', academic_data: { current_class: '11' } });
  });

  it('the draft payload after step 0 sends no studies when the class is not known yet', () => {
    const data = complete();
    data.academic = { ...DEFAULT_FORM_DATA.academic, currentlyIn: 'other' };
    expect(buildDraftPayload(data, 0)).not.toHaveProperty('applicant_category');
  });

  it('the draft payload after step 1 carries studies, course and programme', () => {
    const p = buildDraftPayload(complete(), 1);
    expect(p).toMatchObject({
      form_step_completed: 2,
      applicant_category: 'school_student',
      target_exam_year: '2027-28',
      interest_course: 'nata',
      fee_structure_id: 'fs-1',
      learning_mode: 'hybrid',
    });
    expect(p.academic_data).toEqual({ current_class: '11', school_name: 'TVS School', board: 'CBSE' });
  });

  it('the submit payload carries every collected field and the click ids', () => {
    const data = complete();
    data.personal.email = 'arun@example.com';
    data.personal.gender = 'male';
    data.personal.parentPhone = '9123456789';
    data.gclid = 'g-1';
    data.wbraid = 'w-1';
    const p = buildSubmitPayload(data);
    expect(p).toMatchObject({
      status: 'submitted',
      first_name: 'Arun',
      father_name: 'Rajendran',
      email: 'arun@example.com',
      phone: '9876543210',
      parent_phone: '9123456789',
      date_of_birth: '2008-03-12',
      gender: 'male',
      phone_verified: true,
      fee_structure_id: 'fs-1',
      fee_source: 'standard',
      gclid: 'g-1',
      wbraid: 'w-1',
    });
  });

  it('a mobile from another country is sent with its code, an Indian one as 10 digits', () => {
    const data = complete();
    data.personal = { ...data.personal, phone: '501234567', phoneCountry: 'AE', parentPhone: '509876543' };
    data.location = { ...DEFAULT_FORM_DATA.location, country: 'IN', pincode: '600001', city: 'Chennai' };
    expect(buildSubmitPayload(data)).toMatchObject({ phone: '+971501234567', parent_phone: '+971509876543', country: 'IN' });
  });

  it('"Other country" is saved by its typed name', () => {
    const data = complete();
    data.location = { ...DEFAULT_FORM_DATA.location, country: 'OTHER', countryName: 'Singapore', city: 'Singapore' };
    expect(buildSubmitPayload(data)).toMatchObject({ country: 'Singapore', city: 'Singapore' });
  });

  it('the submit payload has no fee_source when no programme was chosen', () => {
    const data = complete();
    data.course.interestCourse = 'not_sure';
    data.course.feeStructureId = null;
    const p = buildSubmitPayload(data);
    expect(p.fee_structure_id).toBeNull();
    expect(p.fee_source).toBeUndefined();
  });
});

describe('remapSavedStep', () => {
  it('maps the old four-step wizard onto the new steps', () => {
    expect(remapSavedStep({ activeStep: 0 })).toBe(0);
    expect(remapSavedStep({ activeStep: 1 })).toBe(1);
    expect(remapSavedStep({ activeStep: 2 })).toBe(1);
    expect(remapSavedStep({ activeStep: 3 })).toBe(2);
  });

  it('keeps a current-version step, but never restores onto the pay step', () => {
    expect(remapSavedStep({ activeStep: 2, version: SAVED_STATE_VERSION })).toBe(2);
    expect(remapSavedStep({ activeStep: 3, version: SAVED_STATE_VERSION })).toBe(2);
  });

  it('clamps garbage', () => {
    expect(remapSavedStep({ activeStep: 9, version: SAVED_STATE_VERSION })).toBe(2);
    expect(remapSavedStep({ activeStep: -1 })).toBe(0);
  });
});

describe('submitRequest', () => {
  it('POSTs a new application', () => {
    expect(submitRequest({ returnUserMode: null, draftId: null, submittedId: null })).toEqual({ method: 'POST', url: '/api/application' });
  });
  it('PATCHes the application being edited', () => {
    expect(submitRequest({ returnUserMode: 'edit', draftId: 'lead-1', submittedId: null })).toEqual({ method: 'PATCH', url: '/api/application?id=lead-1' });
  });
  it('PATCHes an application already submitted in this visit, so Change details never makes a second one', () => {
    expect(submitRequest({ returnUserMode: null, draftId: 'lead-2', submittedId: 'lead-2' })).toEqual({ method: 'PATCH', url: '/api/application?id=lead-2' });
  });
});

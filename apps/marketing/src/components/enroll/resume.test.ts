import { describe, it, expect } from 'vitest';
import { DEFAULT_FORM_DATA } from '@/components/apply/types';
import { applySavedForm, planResume, resumeMessage } from './resume';

const SAVED = {
  firstName: 'haribabu',
  fatherName: 'Manoharan',
  dateOfBirth: '2008-04-12',
  gender: 'male',
  country: 'IN',
  state: 'Tamil Nadu',
  city: 'Madurai',
  district: 'Madurai',
  pincode: '625001',
  address: '12 North Street',
  applicantCategory: 'school_student',
  academicData: { current_class: '12', school_name: 'TVS', board: 'cbse' },
  casteCategory: 'obc',
  targetExamYear: 2027,
  schoolType: 'private_school',
  parentPhone: '+919876543210',
  studentPhone: '+916380194614',
  phoneVerifiedAt: '2026-10-20T17:00:00.000Z',
};

const LABELS = ['Your details', 'Your studies', 'Choose plan', 'Pay'];

describe('applySavedForm', () => {
  it('puts every saved answer back in its wizard field, academic data in the slot for the category', () => {
    const f = applySavedForm(DEFAULT_FORM_DATA, SAVED, 'full');
    expect(f.personal.firstName).toBe('haribabu');
    expect(f.personal.fatherName).toBe('Manoharan');
    expect(f.personal.dateOfBirth).toBe('2008-04-12');
    expect(f.personal.gender).toBe('male');
    expect(f.personal.parentPhone).toBe('+919876543210');
    expect(f.personal.phone).toBe('+916380194614');
    expect(f.location).toMatchObject({ country: 'IN', state: 'Tamil Nadu', city: 'Madurai', district: 'Madurai', pincode: '625001', address: '12 North Street' });
    expect(f.academic.applicantCategory).toBe('school_student');
    expect(f.academic.schoolStudentData).toEqual({ current_class: '12', school_name: 'TVS', board: 'cbse' });
    expect(f.academic.diplomaStudentData).toBeNull();
    expect(f.academic.casteCategory).toBe('obc');
    expect(f.academic.targetExamYear).toBe('2027');
    expect(f.academic.schoolType).toBe('private_school');
    expect(f.payment.paymentType).toBe('full');
  });

  it('never blanks what the page already has', () => {
    const prev = { ...DEFAULT_FORM_DATA, personal: { ...DEFAULT_FORM_DATA.personal, phone: '+911111111111', email: 'me@x.in' } };
    const f = applySavedForm(prev, { ...SAVED, fatherName: null, dateOfBirth: '' }, 'installment');
    expect(f.personal.phone).toBe('+911111111111');
    expect(f.personal.email).toBe('me@x.in');
    expect(f.personal.fatherName).toBe('');
    expect(f.payment.paymentType).toBe('installment');
  });

  it('routes academic data for a college student to the college slot', () => {
    const f = applySavedForm(DEFAULT_FORM_DATA, { ...SAVED, applicantCategory: 'college_student', academicData: { college_name: 'Anna' } }, null);
    expect(f.academic.collegeStudentData).toEqual({ college_name: 'Anna' });
    expect(f.academic.schoolStudentData).toBeNull();
  });
});

describe('planResume', () => {
  const server = {
    saved: { form: SAVED, scheme: 'full' as const, savedAt: '2026-10-20T17:20:52.000Z' },
    draft: { form: { personal: { firstName: 'harib' } }, step: 0, savedAt: '2026-10-20T17:10:00.000Z' },
  };

  it('on a new device with a saved application, opens the Pay step with the plan preselected', () => {
    const plan = planResume({ local: null, server, base: DEFAULT_FORM_DATA });
    expect(plan?.source).toBe('saved');
    expect(plan?.step).toBe(3);
    expect(plan?.formData.personal.firstName).toBe('haribabu');
    expect(plan?.formData.payment.paymentType).toBe('full');
    expect(plan?.termsAccepted).toBe(false);
  });

  it('opens the plan step when the details were saved without a plan', () => {
    const plan = planResume({ local: null, server: { ...server, saved: { ...server.saved, scheme: null } }, base: DEFAULT_FORM_DATA });
    expect(plan?.step).toBe(2);
  });

  it('prefers a newer draft and lays it over the saved details', () => {
    const newer = { ...server, draft: { form: { personal: { firstName: 'Hari B', fatherName: 'Mano' } }, step: 1, savedAt: '2026-10-20T18:00:00.000Z' } };
    const plan = planResume({ local: null, server: newer, base: DEFAULT_FORM_DATA });
    expect(plan?.source).toBe('draft');
    expect(plan?.step).toBe(1);
    expect(plan?.formData.personal.firstName).toBe('Hari B');
    expect(plan?.formData.location.city).toBe('Madurai');
  });

  it('prefers this browser\'s own copy when it is the newest', () => {
    const local = {
      currentStep: 2,
      formData: { ...DEFAULT_FORM_DATA, personal: { ...DEFAULT_FORM_DATA.personal, firstName: 'Local' } } as unknown as Record<string, unknown>,
      phoneVerified: true,
      phoneVerifiedAt: null,
      termsAccepted: true,
      savedAt: '2026-10-20T19:00:00.000Z',
    };
    const plan = planResume({ local, server, base: DEFAULT_FORM_DATA });
    expect(plan?.source).toBe('local');
    expect(plan?.step).toBe(2);
    expect(plan?.formData.personal.firstName).toBe('Local');
    expect(plan?.termsAccepted).toBe(true);
  });

  it('is null when there is nothing to resume', () => {
    expect(planResume({ local: null, server: { saved: null, draft: null }, base: DEFAULT_FORM_DATA })).toBeNull();
    expect(planResume({ local: null, server: null, base: DEFAULT_FORM_DATA })).toBeNull();
  });

  it('never resumes past the last step', () => {
    const plan = planResume({ local: null, server: { saved: null, draft: { form: {}, step: 7, savedAt: '2026-10-20T18:00:00.000Z' } }, base: DEFAULT_FORM_DATA });
    expect(plan?.step).toBe(3);
  });
});

describe('resumeMessage', () => {
  it('says what was kept and where the student is, without an em dash', () => {
    const plan = planResume({ local: null, server: { saved: { form: SAVED, scheme: 'full', savedAt: '2026-10-20T17:20:52.000Z' }, draft: null }, base: DEFAULT_FORM_DATA })!;
    const msg = resumeMessage(plan, LABELS);
    expect(msg).toMatch(/Welcome back/);
    expect(msg).toMatch(/20 Oct/);
    expect(msg).toMatch(/step 4 of 4: Pay/);
    expect(msg).not.toMatch(/—|--/);
  });
});

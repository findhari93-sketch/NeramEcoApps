/**
 * The rules of the apply form, with no React in them: which step is valid,
 * what a draft or a submission sends, and how an old saved draft maps onto
 * the four new steps. Messages are i18n keys (apply.errors.*), so the same
 * rule reads right in Tamil.
 */
import type { ApplicationFormData, FormStep, StepValidation, ValidationError } from './types';
import { getCountryConfig } from './countryConfig';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function err(field: string, key: string): ValidationError {
  return { field, message: `errors.${key}` };
}

export function validateAboutYou(data: ApplicationFormData): StepValidation {
  const errors: ValidationError[] = [];
  const { personal, location } = data;
  const country = getCountryConfig(location.country);

  if (!personal.firstName || personal.firstName.trim().length < 2) errors.push(err('firstName', 'firstName'));
  if (!personal.fatherName || personal.fatherName.trim().length < 2) errors.push(err('fatherName', 'fatherName'));
  if (personal.email && !EMAIL.test(personal.email)) errors.push(err('email', 'email'));
  if (!personal.phoneVerified) {
    if (!personal.phone || !country.phonePattern.test(personal.phone)) errors.push(err('phone', 'phone'));
    errors.push(err('phoneVerified', 'phoneVerified'));
  }
  if (!personal.dateOfBirth) errors.push(err('dateOfBirth', 'dateOfBirth'));

  if (country.postalCode.required) {
    const format = country.postalCode.format;
    if (!location.pincode || (format && !format.test(location.pincode))) errors.push(err('pincode', 'pincode'));
  }
  if (country.locationFields.cityRequired && !location.city) errors.push(err('city', 'city'));
  if (country.locationFields.stateRequired && !location.state) errors.push(err('state', 'state'));

  return { isValid: errors.length === 0, errors };
}

export function validateYourCourse(data: ApplicationFormData): StepValidation {
  const errors: ValidationError[] = [];
  const { course, academic } = data;

  if (!course.interestCourse) errors.push(err('course', 'course'));
  else if (course.interestCourse !== 'not_sure' && !course.feeStructureId) errors.push(err('programme', 'programme'));

  if (!academic.applicantCategory) {
    errors.push(err('category', 'category'));
    return { isValid: false, errors };
  }
  if (!academic.targetExamYear) errors.push(err('examYear', 'examYear'));

  switch (academic.applicantCategory) {
    case 'school_student':
      if (!academic.schoolStudentData?.current_class) errors.push(err('currentClass', 'currentClass'));
      if (!academic.schoolStudentData?.school_name) errors.push(err('schoolName', 'schoolName'));
      if (!academic.schoolStudentData?.board) errors.push(err('board', 'board'));
      break;
    case 'diploma_student':
      if (!academic.diplomaStudentData?.college_name) errors.push(err('collegeName', 'collegeName'));
      if (!academic.diplomaStudentData?.department) errors.push(err('department', 'department'));
      if (!academic.diplomaStudentData?.completed_grade) errors.push(err('completedGrade', 'completedGrade'));
      break;
    case 'college_student':
      if (!academic.collegeStudentData?.college_name) errors.push(err('collegeName', 'collegeName'));
      if (!academic.collegeStudentData?.department) errors.push(err('department', 'department'));
      if (!academic.collegeStudentData?.year_of_study) errors.push(err('yearOfStudy', 'yearOfStudy'));
      if (!academic.collegeStudentData?.twelfth_year) errors.push(err('twelfthYear', 'twelfthYear'));
      break;
    case 'working_professional':
      if (!academic.workingProfessionalData?.twelfth_year) errors.push(err('twelfthYear', 'twelfthYear'));
      break;
  }

  return { isValid: errors.length === 0, errors };
}

export function validateReview(data: ApplicationFormData): StepValidation {
  const errors: ValidationError[] = [];
  if (!data.termsAccepted) errors.push(err('terms', 'terms'));
  return { isValid: errors.length === 0, errors };
}

export function validateStep(step: FormStep, data: ApplicationFormData): StepValidation {
  switch (step) {
    case 0:
      return validateAboutYou(data);
    case 1:
      return validateYourCourse(data);
    case 2:
      return validateReview(data);
    default:
      return { isValid: true, errors: [] };
  }
}

function academicDataFor(data: ApplicationFormData) {
  switch (data.academic.applicantCategory) {
    case 'school_student':
      return data.academic.schoolStudentData;
    case 'diploma_student':
      return data.academic.diplomaStudentData;
    case 'college_student':
      return data.academic.collegeStudentData;
    case 'working_professional':
      return data.academic.workingProfessionalData;
    default:
      return null;
  }
}

const orUndefined = (value: string | null | undefined) => (value ? value : undefined);

function contactFields(data: ApplicationFormData): Record<string, unknown> {
  const { personal } = data;
  return {
    first_name: orUndefined(personal.firstName),
    father_name: orUndefined(personal.fatherName),
    email: orUndefined(personal.email),
    phone: orUndefined(personal.phone),
    parent_phone: orUndefined(personal.parentPhone),
    date_of_birth: orUndefined(personal.dateOfBirth),
    gender: orUndefined(personal.gender),
    phone_verified: personal.phoneVerified,
    phone_verified_at: orUndefined(personal.phoneVerifiedAt),
  };
}

function locationFields(data: ApplicationFormData): Record<string, unknown> {
  const { location } = data;
  return {
    country: location.country || 'IN',
    city: orUndefined(location.city),
    state: orUndefined(location.state),
    district: orUndefined(location.district),
    pincode: orUndefined(location.pincode),
    address: orUndefined(location.address),
    latitude: location.latitude ?? undefined,
    longitude: location.longitude ?? undefined,
    location_source: orUndefined(location.locationSource),
    detected_location: location.detectedLocation || undefined,
  };
}

function studiesFields(data: ApplicationFormData): Record<string, unknown> {
  const { academic } = data;
  const academicData = academicDataFor(data);
  return {
    applicant_category: orUndefined(academic.applicantCategory),
    caste_category: orUndefined(academic.casteCategory),
    target_exam_year: orUndefined(academic.targetExamYear),
    school_type: orUndefined(academic.schoolType),
    ...(academicData ? { academic_data: academicData } : {}),
  };
}

function courseFields(data: ApplicationFormData): Record<string, unknown> {
  const { course } = data;
  return {
    interest_course: orUndefined(course.interestCourse),
    selected_course_id: orUndefined(course.selectedCourseId),
    selected_center_id: orUndefined(course.selectedCenterId),
    hybrid_learning_accepted: course.hybridLearningAccepted,
    learning_mode: course.learningMode || 'hybrid',
    fee_structure_id: course.feeStructureId,
    ...(course.feeStructureId ? { fee_source: 'standard' } : {}),
  };
}

function attributionFields(data: ApplicationFormData): Record<string, unknown> {
  return {
    utm_source: orUndefined(data.utmSource),
    utm_medium: orUndefined(data.utmMedium),
    utm_campaign: orUndefined(data.utmCampaign),
    referral_code: orUndefined(data.referralCode),
    gclid: orUndefined(data.gclid),
    wbraid: orUndefined(data.wbraid),
  };
}

/** What "Save and continue" sends after `stepCompleted` (0 = About you, 1 = Your course). */
export function buildDraftPayload(formData: ApplicationFormData, stepCompleted: number): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    status: 'draft',
    form_step_completed: stepCompleted + 1,
    ...contactFields(formData),
    ...locationFields(formData),
    ...attributionFields(formData),
  };
  if (stepCompleted >= 1) {
    Object.assign(payload, studiesFields(formData), courseFields(formData));
  }
  return payload;
}

/** What Review sends. Every field, status submitted. */
export function buildSubmitPayload(formData: ApplicationFormData): Record<string, unknown> {
  return {
    status: 'submitted',
    form_step_completed: 3,
    ...contactFields(formData),
    ...locationFields(formData),
    ...studiesFields(formData),
    ...courseFields(formData),
    ...attributionFields(formData),
  };
}

export const SAVED_STATE_VERSION = 2;

/**
 * Where a saved draft reopens. Version 1 drafts came from the four-step
 * wizard (Personal, Academic, Course, Review). Academic and Course both fold
 * into the new "Your course", and nothing ever reopens on the pay step: a
 * submitted application is reached through the dashboard instead.
 */
export function remapSavedStep(saved: { activeStep: number; version?: number }): FormStep {
  const step = Number.isFinite(saved.activeStep) ? Math.trunc(saved.activeStep) : 0;
  if (saved.version === SAVED_STATE_VERSION) {
    return Math.min(Math.max(step, 0), 2) as FormStep;
  }
  const legacy: Record<number, FormStep> = { 0: 0, 1: 1, 2: 1, 3: 2 };
  return legacy[Math.min(Math.max(step, 0), 3)] ?? 0;
}

/**
 * Where Review writes the application. An application already written in
 * this visit (Change details from Pay) or one being edited is PATCHed, so
 * going back to Review never creates a second application.
 */
export function submitRequest(input: {
  returnUserMode: string | null;
  draftId: string | null;
  submittedId: string | null;
}): { method: 'POST' | 'PATCH'; url: string } {
  const id = input.submittedId || (input.returnUserMode === 'edit' ? input.draftId : null);
  return id ? { method: 'PATCH', url: `/api/application?id=${id}` } : { method: 'POST', url: '/api/application' };
}

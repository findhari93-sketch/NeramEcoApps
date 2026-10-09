/**
 * Application Form Types
 *
 * Type definitions for the multi-step application form
 */

import type {
  ApplicantCategory,
  CasteCategory,
  CourseType,
  LocationSource,
  SchoolType,
  SchoolStudentAcademicData,
  DiplomaStudentAcademicData,
  CollegeStudentAcademicData,
  WorkingProfessionalAcademicData,
} from '@neram/database';

// ============================================
// FORM DATA TYPES
// ============================================

/**
 * Personal information step data
 */
export interface PersonalInfoData {
  firstName: string;
  fatherName: string;
  email: string;
  /** The mobile's national digits; its country code is phoneCountry. */
  phone: string;
  /** The mobile's country (IN, AE, ...), separate from where the student lives. */
  phoneCountry: string;
  parentPhone: string;
  phoneVerified: boolean;
  phoneVerifiedAt: string | null;
  dateOfBirth: string;
  /** Optional. Empty string means not given. */
  gender: 'male' | 'female' | 'other' | '';
}

/**
 * Location data
 */
export interface DetectedLocation {
  pincode: string | null;
  city: string | null;
  state: string | null;
  district: string | null;
  country: string | null;
}

export interface LocationData {
  /** Where the student lives: IN (PIN code), a listed Gulf code, or OTHER with countryName. */
  country: string;
  /** The typed country when country is OTHER. */
  countryName: string;
  pincode: string;
  city: string;
  state: string;
  district: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  locationSource: LocationSource | null;
  detectedLocation: DetectedLocation | null;
}

/**
 * Academic data (category-specific)
 */
/** The "I'm currently in" answer on About you. '' means not answered yet. */
export type CurrentlyIn = '' | '11' | '12' | 'repeater' | 'other';

export interface AcademicDetailsData {
  /**
   * What the applicant tapped on About you. Read it through currentlyInOf(),
   * which prefers what Your studies says once a category is chosen there.
   */
  currentlyIn: CurrentlyIn;
  applicantCategory: ApplicantCategory | null;
  casteCategory: CasteCategory | null;
  targetExamYear: string | null;

  // School type (only for school_student category)
  schoolType: SchoolType | null;

  // School student fields
  schoolStudentData: SchoolStudentAcademicData | null;

  // Diploma student fields
  diplomaStudentData: DiplomaStudentAcademicData | null;

  // College student fields
  collegeStudentData: CollegeStudentAcademicData | null;

  // Working professional fields
  workingProfessionalData: WorkingProfessionalAcademicData | null;
}

/**
 * Payment details data (for direct enrollment)
 */
export interface PaymentDetailsData {
  paymentDate: string;
  paymentType: 'full' | 'installment';
  installmentNumber: number;
  paymentMethod: string;
  transactionReference: string;
  paymentProofUrl: string | null;
  paymentProofFileName: string | null;
}

/**
 * Course selection data
 */
export interface CourseSelectionData {
  interestCourse: CourseType | null;
  selectedCourseId: string | null;
  selectedCenterId: string | null;
  selectedCenterName: string | null;
  hybridLearningAccepted: boolean;
  learningMode: 'hybrid' | 'online_only';
  /** The fee_structures row the applicant picked on "Your course". */
  feeStructureId: string | null;
  feeStructureLabel: string | null;
  programType: 'year_long' | 'crash_course' | null;
}

/**
 * Complete form data
 */
export interface ApplicationFormData {
  // Step 1: Personal Info
  personal: PersonalInfoData;
  location: LocationData;

  // Step 2: Academic Details
  academic: AcademicDetailsData;

  // Step 3: Course Selection
  course: CourseSelectionData;

  // Payment details (direct enrollment)
  payment: PaymentDetailsData;

  // Terms
  termsAccepted: boolean;

  // Source tracking
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  referralCode: string | null;
  gclid: string | null;
  wbraid: string | null;
}

/**
 * Initial/default form data
 */
export const DEFAULT_FORM_DATA: ApplicationFormData = {
  personal: {
    firstName: '',
    fatherName: '',
    email: '',
    phone: '',
    phoneCountry: 'IN',
    parentPhone: '',
    phoneVerified: false,
    phoneVerifiedAt: null,
    dateOfBirth: '',
    gender: '',
  },
  location: {
    country: 'IN',
    countryName: '',
    pincode: '',
    city: '',
    state: '',
    district: '',
    address: '',
    latitude: null,
    longitude: null,
    locationSource: null,
    detectedLocation: null,
  },
  academic: {
    currentlyIn: '',
    applicantCategory: null,
    casteCategory: null,
    targetExamYear: '',
    schoolType: null,
    schoolStudentData: null,
    diplomaStudentData: null,
    collegeStudentData: null,
    workingProfessionalData: null,
  },
  course: {
    interestCourse: null,
    selectedCourseId: null,
    selectedCenterId: null,
    selectedCenterName: null,
    hybridLearningAccepted: false,
    learningMode: 'hybrid',
    feeStructureId: null,
    feeStructureLabel: null,
    programType: null,
  },
  payment: {
    paymentDate: new Date().toISOString().split('T')[0],
    paymentType: 'full',
    installmentNumber: 1,
    paymentMethod: '',
    transactionReference: '',
    paymentProofUrl: null,
    paymentProofFileName: null,
  },
  termsAccepted: false,
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  referralCode: null,
  gclid: null,
  wbraid: null,
};

/**
 * The "I'm currently in" answer, derived from Your studies when a category is
 * set there (so the two never disagree), else the tap stored on About you.
 */
export function currentlyInOf(academic: AcademicDetailsData): CurrentlyIn {
  const { applicantCategory, schoolStudentData } = academic;
  if (!applicantCategory) return academic.currentlyIn === 'other' ? 'other' : '';
  if (applicantCategory !== 'school_student') return 'other';
  const cls = schoolStudentData?.current_class;
  if (cls === '11') return '11';
  if (cls === '12') return '12';
  if (cls === '12_completed') return 'repeater';
  if (cls) return 'other';
  return academic.currentlyIn || '';
}

// ============================================
// FORM STEP TYPES
// ============================================

/** 0 About you, 1 Your course (with Your studies), 2 Review, 3 Pay and enrol. */
export type FormStep = 0 | 1 | 2 | 3;

/** i18n keys under apply.steps.* , in step order. */
export const STEP_KEYS = ['aboutYou', 'yourCourse', 'review', 'pay'] as const;
export type StepKey = (typeof STEP_KEYS)[number];
export const STEP_COUNT = STEP_KEYS.length;

// ============================================
// VALIDATION TYPES
// ============================================

export interface ValidationError {
  field: string;
  message: string;
}

export interface StepValidation {
  isValid: boolean;
  errors: ValidationError[];
}

// ============================================
// DROPDOWN OPTIONS
// ============================================

export const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
] as const;

export const CLASS_OPTIONS = [
  { value: '8', label: 'Class 8' },
  { value: '9', label: 'Class 9' },
  { value: '10', label: 'Class 10' },
  { value: '11', label: 'Class 11' },
  { value: '12', label: 'Class 12' },
  { value: '12_completed', label: '12th Completed' },
] as const;

export const YEAR_OF_STUDY_OPTIONS = [
  { value: 1, label: '1st Year' },
  { value: 2, label: '2nd Year' },
  { value: 3, label: '3rd Year' },
  { value: 4, label: '4th Year' },
  { value: 5, label: '5th Year' },
] as const;

export const COMPLETED_GRADE_OPTIONS = [
  { value: '10th', label: 'Completed 10th Standard' },
  { value: '12th', label: 'Completed 12th Standard' },
] as const;

/**
 * Generate exam year options in academic year format (e.g., "2026-27").
 * Shows 4 options starting from the current academic year.
 * Rolls forward after September 1st each year.
 */
export function getExamYearOptions() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0=Jan, 8=Sep
  const baseYear = month >= 8 ? year + 1 : year;
  const years = [];
  for (let i = -1; i < 4; i++) {
    const startYear = baseYear + i;
    const endYear = startYear + 1;
    const value = `${startYear}-${String(endYear).slice(2)}`;
    years.push({ value, label: value });
  }
  return years;
}

/**
 * Generate 12th completion year options (last 10 years)
 */
export function get12thYearOptions() {
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let i = 0; i <= 10; i++) {
    const year = currentYear - i;
    years.push({ value: year, label: `${year}` });
  }
  return years;
}

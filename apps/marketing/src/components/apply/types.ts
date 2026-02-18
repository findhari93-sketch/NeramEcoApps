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
  phone: string;
  phoneVerified: boolean;
  phoneVerifiedAt: string | null;
  dateOfBirth: string;
  gender: 'male' | 'female' | 'other';
}

/**
 * Location data
 */
export interface LocationData {
  country: string;
  pincode: string;
  city: string;
  state: string;
  district: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  locationSource: LocationSource | null;
}

/**
 * Academic data (category-specific)
 */
export interface AcademicDetailsData {
  applicantCategory: ApplicantCategory | null;
  casteCategory: CasteCategory | null;
  targetExamYear: number | null;

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
 * Course selection data
 */
export interface CourseSelectionData {
  interestCourse: CourseType | null;
  selectedCourseId: string | null;
  selectedCenterId: string | null;
  selectedCenterName: string | null;
  hybridLearningAccepted: boolean;
  learningMode: 'hybrid' | 'online_only';
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

  // Terms
  termsAccepted: boolean;

  // Source tracking
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  referralCode: string | null;
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
    phoneVerified: false,
    phoneVerifiedAt: null,
    dateOfBirth: '',
    gender: 'male',
  },
  location: {
    country: 'IN',
    pincode: '',
    city: '',
    state: '',
    district: '',
    address: '',
    latitude: null,
    longitude: null,
    locationSource: null,
  },
  academic: {
    applicantCategory: null,
    casteCategory: null,
    targetExamYear: new Date().getFullYear() + 1,
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
  },
  termsAccepted: false,
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  referralCode: null,
};

// ============================================
// FORM STEP TYPES
// ============================================

export type FormStep = 0 | 1 | 2 | 3;

export const STEP_LABELS = [
  'Personal Information',
  'Academic Details',
  'Course Selection',
  'Review & Submit',
] as const;

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
 * Generate exam year options (current year + 5 years)
 */
export function getExamYearOptions() {
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let i = 0; i <= 5; i++) {
    const year = currentYear + i;
    years.push({ value: year, label: `${year}` });
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

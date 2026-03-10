/**
 * Application Form Types (Tools App)
 *
 * Matches Marketing app's 4-step structure exactly.
 * Types imported from @neram/database for DB-level types.
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

export interface PersonalInfoData {
  firstName: string;
  fatherName: string;
  email: string;
  phone: string;
  parentPhone: string;
  phoneVerified: boolean;
  phoneVerifiedAt: string | null;
  dateOfBirth: string;
  gender: 'male' | 'female' | 'other';
}

export interface DetectedLocation {
  pincode: string | null;
  city: string | null;
  state: string | null;
  district: string | null;
  country: string | null;
}

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
  detectedLocation: DetectedLocation | null;
}

export interface AcademicDetailsData {
  applicantCategory: ApplicantCategory | null;
  casteCategory: CasteCategory | null;
  targetExamYear: string | null;
  schoolType: SchoolType | null;
  schoolStudentData: SchoolStudentAcademicData | null;
  diplomaStudentData: DiplomaStudentAcademicData | null;
  collegeStudentData: CollegeStudentAcademicData | null;
  workingProfessionalData: WorkingProfessionalAcademicData | null;
}

export interface CourseSelectionData {
  interestCourse: CourseType | null;
  selectedCourseId: string | null;
  selectedCenterId: string | null;
  selectedCenterName: string | null;
  hybridLearningAccepted: boolean;
  learningMode: 'hybrid' | 'online_only';
}

export interface ApplicationFormData {
  personal: PersonalInfoData;
  location: LocationData;
  academic: AcademicDetailsData;
  course: CourseSelectionData;
  termsAccepted: boolean;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  referralCode: string | null;
}

export const DEFAULT_FORM_DATA: ApplicationFormData = {
  personal: {
    firstName: '',
    fatherName: '',
    email: '',
    phone: '',
    parentPhone: '',
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
    detectedLocation: null,
  },
  academic: {
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

export function getExamYearOptions() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const baseYear = month >= 8 ? year + 1 : year;
  const years = [];
  for (let i = 0; i < 4; i++) {
    const startYear = baseYear + i;
    const endYear = startYear + 1;
    const value = `${startYear}-${String(endYear).slice(2)}`;
    years.push({ value, label: value });
  }
  return years;
}

export function get12thYearOptions() {
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let i = 0; i <= 10; i++) {
    const year = currentYear - i;
    years.push({ value: year, label: `${year}` });
  }
  return years;
}

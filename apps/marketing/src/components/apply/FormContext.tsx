'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { ApplicationFormData, FormStep, StepValidation, ValidationError } from './types';
import { DEFAULT_FORM_DATA, STEP_LABELS } from './types';
import { useFirebaseAuth } from '@neram/auth';
import { getCountryConfig } from './countryConfig';

// ============================================
// LOCAL STORAGE PERSISTENCE
// ============================================

const STORAGE_KEY = 'neram_application_draft';

interface SavedFormState {
  formData: ApplicationFormData;
  activeStep: FormStep;
  savedAt: string;
}

function saveToStorage(formData: ApplicationFormData, activeStep: FormStep): void {
  try {
    const state: SavedFormState = { formData, activeStep, savedAt: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage full or unavailable
  }
}

function loadFromStorage(): SavedFormState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const state: SavedFormState = JSON.parse(raw);
    // Expire after 7 days
    if (state.savedAt) {
      const age = Date.now() - new Date(state.savedAt).getTime();
      if (age > 7 * 24 * 60 * 60 * 1000) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
    }
    return state;
  } catch {
    return null;
  }
}

function clearStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// ============================================
// CONTEXT TYPE
// ============================================

interface FormContextType {
  // Form data
  formData: ApplicationFormData;
  setFormData: React.Dispatch<React.SetStateAction<ApplicationFormData>>;
  updateFormData: <K extends keyof ApplicationFormData>(
    section: K,
    data: Partial<ApplicationFormData[K]>
  ) => void;
  setTermsAccepted: (accepted: boolean) => void;

  // Step navigation
  activeStep: FormStep;
  setActiveStep: (step: FormStep) => void;
  goToNextStep: () => void;
  goToPreviousStep: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;

  // Validation
  validateStep: (step: FormStep) => StepValidation;
  stepValidations: Record<FormStep, StepValidation>;

  // Phone verification
  showPhoneVerification: boolean;
  setShowPhoneVerification: (show: boolean) => void;
  onPhoneVerified: (phone: string) => void;

  // Pre-filled tracking
  prefilledFields: Set<string>;
  isFieldPrefilled: (field: string) => boolean;

  // Submission
  isSubmitting: boolean;
  setIsSubmitting: (submitting: boolean) => void;
  submissionError: string | null;
  setSubmissionError: (error: string | null) => void;

  // Persistence
  clearSavedForm: () => void;

  // User auth state
  isAuthenticated: boolean;
  isAuthLoading: boolean;
}

const FormContext = createContext<FormContextType | null>(null);

// ============================================
// VALIDATION HELPERS
// ============================================

function validatePersonalInfo(data: ApplicationFormData): StepValidation {
  const errors: ValidationError[] = [];

  if (!data.personal.firstName || data.personal.firstName.length < 2) {
    errors.push({ field: 'firstName', message: 'First name is required (min 2 characters)' });
  }

  if (!data.personal.fatherName || data.personal.fatherName.length < 2) {
    errors.push({ field: 'fatherName', message: "Father's name is required (min 2 characters)" });
  }

  if (!data.personal.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.personal.email)) {
    errors.push({ field: 'email', message: 'Valid email is required' });
  }

  const countryConfig = getCountryConfig(data.location.country);
  // Skip phone format validation if already verified (phone was validated at verification time)
  if (!data.personal.phoneVerified) {
    if (!data.personal.phone || !countryConfig.phonePattern.test(data.personal.phone)) {
      errors.push({ field: 'phone', message: `Valid ${countryConfig.phoneLength}-digit phone number is required` });
    }
  }

  if (!data.personal.phoneVerified) {
    errors.push({ field: 'phoneVerified', message: 'Phone verification is required' });
  }

  if (!data.personal.dateOfBirth) {
    errors.push({ field: 'dateOfBirth', message: 'Date of birth is required' });
  }

  if (!data.personal.gender) {
    errors.push({ field: 'gender', message: 'Gender is required' });
  }

  // Location validation (country-aware)
  if (countryConfig.postalCode.required) {
    if (!data.location.pincode || (countryConfig.postalCode.format && !countryConfig.postalCode.format.test(data.location.pincode))) {
      errors.push({ field: 'pincode', message: `Valid ${countryConfig.postalCode.label.toLowerCase()} is required` });
    }
  }

  if (countryConfig.locationFields.cityRequired && !data.location.city) {
    errors.push({ field: 'city', message: 'City is required' });
  }

  if (countryConfig.locationFields.stateRequired && !data.location.state) {
    errors.push({ field: 'state', message: `${countryConfig.locationFields.stateLabel} is required` });
  }

  return { isValid: errors.length === 0, errors };
}

function validateAcademicDetails(data: ApplicationFormData): StepValidation {
  const errors: ValidationError[] = [];

  if (!data.academic.applicantCategory) {
    errors.push({ field: 'applicantCategory', message: 'Please select your category' });
    return { isValid: false, errors };
  }

  if (!data.academic.casteCategory) {
    errors.push({ field: 'casteCategory', message: 'Please select your caste category' });
  }

  if (!data.academic.targetExamYear) {
    errors.push({ field: 'targetExamYear', message: 'Please select target exam year' });
  }

  // Category-specific validation
  switch (data.academic.applicantCategory) {
    case 'school_student':
      if (!data.academic.schoolStudentData?.current_class) {
        errors.push({ field: 'currentClass', message: 'Current class is required' });
      }
      if (!data.academic.schoolStudentData?.school_name) {
        errors.push({ field: 'schoolName', message: 'School name is required' });
      }
      if (!data.academic.schoolStudentData?.board) {
        errors.push({ field: 'board', message: 'Board is required' });
      }
      break;

    case 'diploma_student':
      if (!data.academic.diplomaStudentData?.college_name) {
        errors.push({ field: 'collegeName', message: 'College name is required' });
      }
      if (!data.academic.diplomaStudentData?.department) {
        errors.push({ field: 'department', message: 'Department is required' });
      }
      if (!data.academic.diplomaStudentData?.completed_grade) {
        errors.push({ field: 'completedGrade', message: 'Please select grade completed before diploma' });
      }
      break;

    case 'college_student':
      if (!data.academic.collegeStudentData?.college_name) {
        errors.push({ field: 'collegeName', message: 'College name is required' });
      }
      if (!data.academic.collegeStudentData?.department) {
        errors.push({ field: 'department', message: 'Department is required' });
      }
      if (!data.academic.collegeStudentData?.year_of_study) {
        errors.push({ field: 'yearOfStudy', message: 'Year of study is required' });
      }
      if (!data.academic.collegeStudentData?.twelfth_year) {
        errors.push({ field: 'twelfthYear', message: '12th completion year is required' });
      }
      break;

    case 'working_professional':
      if (!data.academic.workingProfessionalData?.twelfth_year) {
        errors.push({ field: 'twelfthYear', message: '12th completion year is required' });
      }
      break;
  }

  return { isValid: errors.length === 0, errors };
}

function validateCourseSelection(data: ApplicationFormData): StepValidation {
  const errors: ValidationError[] = [];

  if (!data.course.interestCourse) {
    errors.push({ field: 'interestCourse', message: 'Please select a course' });
  }

  // Center selection is optional but hybrid acceptance is tracked

  return { isValid: errors.length === 0, errors };
}

function validateReview(data: ApplicationFormData): StepValidation {
  const errors: ValidationError[] = [];

  if (!data.termsAccepted) {
    errors.push({ field: 'termsAccepted', message: 'Please accept the terms and conditions' });
  }

  return { isValid: errors.length === 0, errors };
}

// ============================================
// PROVIDER COMPONENT
// ============================================

interface FormProviderProps {
  children: React.ReactNode;
}

export function FormProvider({ children }: FormProviderProps) {
  const { user, loading: authLoading } = useFirebaseAuth();

  const [formData, setFormData] = useState<ApplicationFormData>(DEFAULT_FORM_DATA);
  const [activeStep, setActiveStepState] = useState<FormStep>(0);
  const [showPhoneVerification, setShowPhoneVerification] = useState(false);
  const [prefilledFields, setPrefilledFields] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const hasRestoredRef = useRef(false);

  // Restore saved state from localStorage after mount (avoids hydration mismatch)
  useEffect(() => {
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;
    const saved = loadFromStorage();
    if (saved) {
      // Sanitize any stale onboarding values stored in localStorage
      const validCategories = ['school_student', 'diploma_student', 'college_student', 'working_professional'];
      const categoryMap: Record<string, string> = {
        '8th': 'school_student', '9th': 'school_student', '10th': 'school_student',
        '11th': 'school_student', '12th': 'school_student',
        'college': 'college_student', 'working': 'working_professional',
      };
      const cat = saved.formData.academic?.applicantCategory;
      if (cat && !validCategories.includes(cat)) {
        const mapped = categoryMap[cat];
        saved.formData.academic.applicantCategory = (mapped || null) as any;
      }

      setFormData(saved.formData);
      setActiveStepState(saved.activeStep);
    }
  }, []);

  // Auto-save form data and step to localStorage on every change
  useEffect(() => {
    if (!hasRestoredRef.current) return; // Don't save until initial restore is done
    saveToStorage(formData, activeStep);
  }, [formData, activeStep]);

  const clearSavedForm = useCallback(() => {
    clearStorage();
    setFormData(DEFAULT_FORM_DATA);
    setActiveStepState(0);
  }, []);

  // Pre-fill form from user profile (only fills empty fields, won't overwrite saved data)
  useEffect(() => {
    const fetchAndPrefill = async () => {
      if (!user || authLoading) return;

      const prefilled = new Set<string>();

      try {
        const idToken = await (user.raw as any)?.getIdToken?.();
        if (!idToken) return;

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3011';
        const response = await fetch(`${appUrl}/api/profile`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });

        if (response.ok) {
          const { user: profile } = await response.json();

          // Only pre-fill fields that are currently empty (don't overwrite saved data)
          if (profile.first_name) {
            setFormData((prev) => {
              if (prev.personal.firstName) return prev;
              return { ...prev, personal: { ...prev.personal, firstName: profile.first_name } };
            });
            prefilled.add('firstName');
          }

          if (profile.email) {
            setFormData((prev) => {
              if (prev.personal.email) return prev;
              return { ...prev, personal: { ...prev.personal, email: profile.email } };
            });
            prefilled.add('email');
          }

          if (profile.phone) {
            // Strip any known country prefix
            const phone = profile.phone.replace(/^\+\d{1,3}/, '');
            setFormData((prev) => {
              if (prev.personal.phone) return prev;
              return {
                ...prev,
                personal: {
                  ...prev.personal,
                  phone,
                  phoneVerified: profile.phone_verified || false,
                },
              };
            });
            prefilled.add('phone');
            if (profile.phone_verified) {
              prefilled.add('phoneVerified');
            }
          }

          if (profile.date_of_birth) {
            setFormData((prev) => {
              if (prev.personal.dateOfBirth) return prev;
              return { ...prev, personal: { ...prev.personal, dateOfBirth: profile.date_of_birth } };
            });
            prefilled.add('dateOfBirth');
          }

          if (profile.gender) {
            setFormData((prev) => {
              if (prev.personal.gender && prev.personal.gender !== 'male') return prev;
              return { ...prev, personal: { ...prev.personal, gender: profile.gender } };
            });
            prefilled.add('gender');
          }
        }
      } catch (error) {
        console.error('Error pre-filling form:', error);
      }

      // Pre-fill from onboarding responses (maps_to_field mapping)
      try {
        const idToken = await (user.raw as any)?.getIdToken?.();
        if (idToken) {
          const prefillRes = await fetch('/api/onboarding/prefill', {
            headers: { Authorization: `Bearer ${idToken}` },
          });

          if (prefillRes.ok) {
            const { prefill } = await prefillRes.json();

            // Map onboarding fields to form fields
            if (prefill.interest_course && !prefilled.has('interestCourse')) {
              const courseValue = Array.isArray(prefill.interest_course)
                ? prefill.interest_course[0]
                : prefill.interest_course;
              setFormData((prev) => ({
                ...prev,
                course: { ...prev.course, interestCourse: courseValue },
              }));
              prefilled.add('interestCourse');
            }

            if (prefill.applicant_category && !prefilled.has('applicantCategory')) {
              // Map onboarding education stage values to valid applicant_category enum values
              const categoryMap: Record<string, string> = {
                '8th': 'school_student',
                '9th': 'school_student',
                '10th': 'school_student',
                '11th': 'school_student',
                '12th': 'school_student',
                'college': 'college_student',
                'working': 'working_professional',
                // Pass through already-valid values
                'school_student': 'school_student',
                'diploma_student': 'diploma_student',
                'college_student': 'college_student',
                'working_professional': 'working_professional',
              };
              const mappedCategory = categoryMap[prefill.applicant_category];
              if (mappedCategory) {
                setFormData((prev) => ({
                  ...prev,
                  academic: { ...prev.academic, applicantCategory: mappedCategory as any },
                }));
                prefilled.add('applicantCategory');
              }
            }

            if (prefill.caste_category && !prefilled.has('casteCategory')) {
              setFormData((prev) => ({
                ...prev,
                academic: { ...prev.academic, casteCategory: prefill.caste_category },
              }));
              prefilled.add('casteCategory');
            }
          }
        }
      } catch (error) {
        // Non-critical — onboarding pre-fill is optional
        console.error('Error pre-filling from onboarding:', error);
      }

      // Fallback: use Google displayName if first name / father's name not yet filled
      if (user.name) {
        const nameParts = user.name.trim().split(/\s+/);
        const firstName = nameParts[0] || '';
        const fatherName = nameParts.slice(1).join(' ') || '';

        if (firstName && !prefilled.has('firstName')) {
          setFormData((prev) => ({
            ...prev,
            personal: { ...prev.personal, firstName },
          }));
          prefilled.add('firstName');
        }
        if (fatherName && !prefilled.has('fatherName')) {
          setFormData((prev) => ({
            ...prev,
            personal: { ...prev.personal, fatherName },
          }));
          prefilled.add('fatherName');
        }
      }

      // Fallback: use Google email if not yet filled
      if (!prefilled.has('email') && user.email) {
        setFormData((prev) => ({
          ...prev,
          personal: { ...prev.personal, email: user.email! },
        }));
        prefilled.add('email');
      }

      setPrefilledFields(prefilled);
    };

    fetchAndPrefill();
  }, [user, authLoading]);

  // Get UTM parameters, center selection, and learning mode from URL
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const utmSource = params.get('utm_source');
      const utmMedium = params.get('utm_medium');
      const utmCampaign = params.get('utm_campaign');
      const referralCode = params.get('ref');

      if (utmSource || utmMedium || utmCampaign || referralCode) {
        setFormData((prev) => ({
          ...prev,
          utmSource,
          utmMedium,
          utmCampaign,
          referralCode,
        }));
      }

      // Read learning mode from URL (?mode=online)
      const mode = params.get('mode');
      if (mode === 'online') {
        setFormData((prev) => ({
          ...prev,
          course: {
            ...prev.course,
            learningMode: 'online_only',
            selectedCenterId: null,
            selectedCenterName: null,
            hybridLearningAccepted: false,
          },
        }));
      }

      // Read center slug from URL (?center=slug) and auto-select
      const centerSlug = params.get('center');
      if (centerSlug) {
        fetch(`/api/centers?slug=${encodeURIComponent(centerSlug)}`)
          .then((res) => res.json())
          .then((data) => {
            if (data.success && data.data) {
              const center = data.data;
              setFormData((prev) => ({
                ...prev,
                course: {
                  ...prev.course,
                  selectedCenterId: center.id,
                  selectedCenterName: center.name,
                  hybridLearningAccepted: true,
                  learningMode: 'hybrid',
                },
              }));
            }
          })
          .catch(() => {
            // Ignore - invalid center slug
          });
      }
    }
  }, []);

  const updateFormData = useCallback(
    <K extends keyof ApplicationFormData>(
      section: K,
      data: Partial<ApplicationFormData[K]>
    ) => {
      setFormData((prev) => ({
        ...prev,
        [section]: { ...prev[section], ...data },
      }));
    },
    []
  );

  const setActiveStep = useCallback((step: FormStep) => {
    setActiveStepState(step);
    // Scroll to top on step change
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const goToNextStep = useCallback(() => {
    setActiveStepState((prev) => Math.min(prev + 1, 3) as FormStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const goToPreviousStep = useCallback(() => {
    setActiveStepState((prev) => Math.max(prev - 1, 0) as FormStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const validateStep = useCallback(
    (step: FormStep): StepValidation => {
      switch (step) {
        case 0:
          return validatePersonalInfo(formData);
        case 1:
          return validateAcademicDetails(formData);
        case 2:
          return validateCourseSelection(formData);
        case 3:
          return validateReview(formData);
        default:
          return { isValid: true, errors: [] };
      }
    },
    [formData]
  );

  const stepValidations: Record<FormStep, StepValidation> = {
    0: validateStep(0),
    1: validateStep(1),
    2: validateStep(2),
    3: validateStep(3),
  };

  const onPhoneVerified = useCallback((phone: string) => {
    setFormData((prev) => {
      const config = getCountryConfig(prev.location.country);
      // Strip the country prefix if present
      const prefixEscaped = config.phonePrefix.replace(/\+/g, '\\+');
      const cleanedPhone = phone.replace(new RegExp(`^${prefixEscaped}`), '');
      return {
        ...prev,
        personal: {
          ...prev.personal,
          phone: cleanedPhone,
          phoneVerified: true,
          phoneVerifiedAt: new Date().toISOString(),
        },
      };
    });
    setShowPhoneVerification(false);
  }, []);

  const isFieldPrefilled = useCallback(
    (field: string) => prefilledFields.has(field),
    [prefilledFields]
  );

  const setTermsAccepted = useCallback((accepted: boolean) => {
    setFormData((prev) => ({ ...prev, termsAccepted: accepted }));
  }, []);

  const value: FormContextType = {
    formData,
    setFormData,
    updateFormData,
    setTermsAccepted,
    activeStep,
    setActiveStep,
    goToNextStep,
    goToPreviousStep,
    isFirstStep: activeStep === 0,
    isLastStep: activeStep === 3,
    validateStep,
    stepValidations,
    showPhoneVerification,
    setShowPhoneVerification,
    onPhoneVerified,
    prefilledFields,
    isFieldPrefilled,
    isSubmitting,
    setIsSubmitting,
    submissionError,
    setSubmissionError,
    clearSavedForm,
    isAuthenticated: !!user,
    isAuthLoading: authLoading,
  };

  return <FormContext.Provider value={value}>{children}</FormContext.Provider>;
}

// ============================================
// HOOK
// ============================================

export function useFormContext() {
  const context = useContext(FormContext);
  if (!context) {
    throw new Error('useFormContext must be used within a FormProvider');
  }
  return context;
}

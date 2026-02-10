'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ApplicationFormData, FormStep, StepValidation, ValidationError } from './types';
import { DEFAULT_FORM_DATA, STEP_LABELS } from './types';
import { useFirebaseAuth } from '@neram/auth';

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

  if (!data.personal.phone || !/^[6-9]\d{9}$/.test(data.personal.phone)) {
    errors.push({ field: 'phone', message: 'Valid 10-digit phone number is required' });
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

  // Location validation
  if (!data.location.pincode || data.location.pincode.length !== 6) {
    errors.push({ field: 'pincode', message: 'Valid 6-digit pin code is required' });
  }

  if (!data.location.city) {
    errors.push({ field: 'city', message: 'City is required' });
  }

  if (!data.location.state) {
    errors.push({ field: 'state', message: 'State is required' });
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

  // Pre-fill form from user profile
  useEffect(() => {
    const fetchAndPrefill = async () => {
      if (!user || authLoading) return;

      try {
        const idToken = await (user.raw as any)?.getIdToken?.();
        if (!idToken) return;

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3011';
        const response = await fetch(`${appUrl}/api/profile`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });

        if (response.ok) {
          const { user: profile } = await response.json();
          const prefilled = new Set<string>();

          if (profile.first_name) {
            setFormData((prev) => ({
              ...prev,
              personal: { ...prev.personal, firstName: profile.first_name },
            }));
            prefilled.add('firstName');
          }

          if (profile.email) {
            setFormData((prev) => ({
              ...prev,
              personal: { ...prev.personal, email: profile.email },
            }));
            prefilled.add('email');
          }

          if (profile.phone) {
            const phone = profile.phone.replace(/^\+91/, '');
            setFormData((prev) => ({
              ...prev,
              personal: {
                ...prev.personal,
                phone,
                phoneVerified: profile.phone_verified || false,
              },
            }));
            prefilled.add('phone');
            if (profile.phone_verified) {
              prefilled.add('phoneVerified');
            }
          }

          if (profile.date_of_birth) {
            setFormData((prev) => ({
              ...prev,
              personal: { ...prev.personal, dateOfBirth: profile.date_of_birth },
            }));
            prefilled.add('dateOfBirth');
          }

          if (profile.gender) {
            setFormData((prev) => ({
              ...prev,
              personal: { ...prev.personal, gender: profile.gender },
            }));
            prefilled.add('gender');
          }

          setPrefilledFields(prefilled);
        }
      } catch (error) {
        console.error('Error pre-filling form:', error);
      }
    };

    fetchAndPrefill();
  }, [user, authLoading]);

  // Get UTM parameters from URL
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
    setFormData((prev) => ({
      ...prev,
      personal: {
        ...prev.personal,
        phone: phone.replace(/^\+91/, ''),
        phoneVerified: true,
        phoneVerifiedAt: new Date().toISOString(),
      },
    }));
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

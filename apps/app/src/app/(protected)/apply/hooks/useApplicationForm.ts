'use client';

import { useState, useCallback, useEffect } from 'react';
import { useFirebaseAuth } from '@neram/auth';

export interface ApplicationFormData {
  // Step 1: Basic Details
  fullName: string;
  email: string;
  phone: string;
  dob: string;
  gender: 'male' | 'female' | 'other' | '';
  address: string;
  city: string;
  state: string;
  pincode: string;

  // Step 2: Education
  schoolName: string;
  board: 'cbse' | 'icse' | 'state' | 'ib' | 'other' | '';
  currentClass: '10th' | '11th' | '12th' | 'passed' | '';
  stream: 'science' | 'commerce' | 'arts' | '';
  courseInterest: 'nata' | 'jee_paper2' | 'both' | '';
  batchPreference: 'morning' | 'afternoon' | 'evening' | 'weekend' | '';

  // Step 3: Scholarship
  isGovernmentSchool: boolean;
  governmentSchoolYears: number;
  schoolIdCardUrl: string | null;
  incomeCertificateUrl: string | null;
  isLowIncome: boolean;
  scholarshipPercentage: number;

  // Step 4: Cashback Offers
  youtubeSubscribed: boolean;
  youtubeVerified: boolean;
  instagramFollowed: boolean;
  instagramUsername: string;
  cashbackPhoneNumber: string;
  totalCashbackEligible: number;

  // Step 5: Source
  sourceCategory: string;
  sourceDetail: string;
  friendReferralName: string;
  friendReferralPhone: string;

  // Metadata
  formStepCompleted: number;
  termsAccepted: boolean;
}

export interface FormValidation {
  isValid: boolean;
  errors: Record<string, string>;
}

const initialFormData: ApplicationFormData = {
  // Step 1
  fullName: '',
  email: '',
  phone: '',
  dob: '',
  gender: '',
  address: '',
  city: '',
  state: '',
  pincode: '',

  // Step 2
  schoolName: '',
  board: '',
  currentClass: '',
  stream: '',
  courseInterest: '',
  batchPreference: '',

  // Step 3
  isGovernmentSchool: false,
  governmentSchoolYears: 0,
  schoolIdCardUrl: null,
  incomeCertificateUrl: null,
  isLowIncome: false,
  scholarshipPercentage: 0,

  // Step 4
  youtubeSubscribed: false,
  youtubeVerified: false,
  instagramFollowed: false,
  instagramUsername: '',
  cashbackPhoneNumber: '',
  totalCashbackEligible: 0,

  // Step 5
  sourceCategory: '',
  sourceDetail: '',
  friendReferralName: '',
  friendReferralPhone: '',

  // Metadata
  formStepCompleted: 0,
  termsAccepted: false,
};

export function useApplicationForm() {
  const { user } = useFirebaseAuth();
  const [formData, setFormData] = useState<ApplicationFormData>(initialFormData);
  const [activeStep, setActiveStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Pre-fill user data from auth
  useEffect(() => {
    if (user) {
      setFormData((prev) => ({
        ...prev,
        fullName: user.name || prev.fullName,
        email: user.email || prev.email,
        phone: user.phone || prev.phone,
      }));
    }
  }, [user]);

  // Update single field
  const updateField = useCallback(<K extends keyof ApplicationFormData>(
    field: K,
    value: ApplicationFormData[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  // Update multiple fields
  const updateFields = useCallback((fields: Partial<ApplicationFormData>) => {
    setFormData((prev) => ({ ...prev, ...fields }));
  }, []);

  // Calculate scholarship based on government school status
  const calculateScholarship = useCallback(() => {
    if (formData.isGovernmentSchool && formData.governmentSchoolYears >= 2 && formData.isLowIncome) {
      updateField('scholarshipPercentage', 95);
    } else if (formData.isGovernmentSchool && formData.governmentSchoolYears >= 2) {
      updateField('scholarshipPercentage', 50);
    } else {
      updateField('scholarshipPercentage', 0);
    }
  }, [formData.isGovernmentSchool, formData.governmentSchoolYears, formData.isLowIncome, updateField]);

  // Calculate cashback
  const calculateCashback = useCallback(() => {
    let total = 0;
    if (formData.youtubeVerified) total += 50;
    if (formData.instagramFollowed && formData.instagramUsername) total += 50;
    // Direct payment cashback (100) is calculated separately during payment
    updateField('totalCashbackEligible', total);
  }, [formData.youtubeVerified, formData.instagramFollowed, formData.instagramUsername, updateField]);

  useEffect(() => {
    calculateScholarship();
  }, [calculateScholarship]);

  useEffect(() => {
    calculateCashback();
  }, [calculateCashback]);

  // Step validation
  const validateStep = useCallback((step: number): FormValidation => {
    const errors: Record<string, string> = {};

    switch (step) {
      case 0: // Basic Details
        if (!formData.fullName.trim()) errors.fullName = 'Full name is required';
        if (!formData.email.trim()) {
          errors.email = 'Email is required';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
          errors.email = 'Invalid email format';
        }
        if (!formData.phone.trim()) {
          errors.phone = 'Phone is required';
        } else if (!/^[6-9]\d{9}$/.test(formData.phone)) {
          errors.phone = 'Enter valid 10-digit mobile number';
        }
        if (!formData.gender) errors.gender = 'Gender is required';
        break;

      case 1: // Education
        if (!formData.schoolName.trim()) errors.schoolName = 'School name is required';
        if (!formData.board) errors.board = 'Board is required';
        if (!formData.currentClass) errors.currentClass = 'Current class is required';
        if (!formData.courseInterest) errors.courseInterest = 'Course interest is required';
        if (!formData.batchPreference) errors.batchPreference = 'Batch preference is required';
        break;

      case 2: // Scholarship
        if (formData.isGovernmentSchool) {
          if (formData.governmentSchoolYears < 1) {
            errors.governmentSchoolYears = 'Enter years in government school';
          }
          if (!formData.schoolIdCardUrl) {
            errors.schoolIdCardUrl = 'School ID card is required for scholarship';
          }
          if (formData.isLowIncome && !formData.incomeCertificateUrl) {
            errors.incomeCertificateUrl = 'Income certificate is required for 95% scholarship';
          }
        }
        break;

      case 3: // Cashback
        if (formData.instagramFollowed && !formData.instagramUsername.trim()) {
          errors.instagramUsername = 'Instagram username is required';
        }
        if ((formData.youtubeVerified || formData.instagramFollowed) && !formData.cashbackPhoneNumber.trim()) {
          errors.cashbackPhoneNumber = 'Phone number for cashback transfer is required';
        }
        break;

      case 4: // Source
        if (!formData.sourceCategory) errors.sourceCategory = 'Please tell us how you heard about us';
        if (formData.sourceCategory === 'friend_referral') {
          if (!formData.friendReferralName.trim()) errors.friendReferralName = "Friend's name is required";
        }
        break;

      case 5: // Preview
        if (!formData.termsAccepted) errors.termsAccepted = 'You must accept the terms and conditions';
        break;
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
    };
  }, [formData]);

  // Navigation
  const nextStep = useCallback(() => {
    const validation = validateStep(activeStep);
    if (validation.isValid) {
      setActiveStep((prev) => Math.min(prev + 1, 5));
      updateField('formStepCompleted', Math.max(formData.formStepCompleted, activeStep + 1));
    }
    return validation;
  }, [activeStep, validateStep, updateField, formData.formStepCompleted]);

  const prevStep = useCallback(() => {
    setActiveStep((prev) => Math.max(prev - 1, 0));
  }, []);

  const goToStep = useCallback((step: number) => {
    if (step <= formData.formStepCompleted) {
      setActiveStep(step);
    }
  }, [formData.formStepCompleted]);

  // Submit form
  const submitForm = useCallback(async () => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch('/api/application/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to submit application');
      }

      const result = await response.json();
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      setSubmitError(message);
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  }, [formData]);

  // Verify YouTube subscription
  const verifyYouTubeSubscription = useCallback(async () => {
    try {
      const response = await fetch('/api/verify/youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        const { isSubscribed } = await response.json();
        updateField('youtubeVerified', isSubscribed);
        return isSubscribed;
      }
      return false;
    } catch {
      return false;
    }
  }, [updateField]);

  // Reset form
  const resetForm = useCallback(() => {
    setFormData(initialFormData);
    setActiveStep(0);
    setSubmitError(null);
  }, []);

  return {
    formData,
    activeStep,
    isSubmitting,
    submitError,
    updateField,
    updateFields,
    validateStep,
    nextStep,
    prevStep,
    goToStep,
    submitForm,
    verifyYouTubeSubscription,
    resetForm,
  };
}

export type UseApplicationFormReturn = ReturnType<typeof useApplicationForm>;

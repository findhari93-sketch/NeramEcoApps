'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Stepper,
  Step,
  StepLabel,
  Alert,
  CircularProgress,
  Snackbar,
  Container,
  Skeleton,
  LoginModal,
} from '@neram/ui';
import { ChatWidget, applicationFormFlow } from '@neram/ui';
import { FormProvider, useFormContext } from './hooks/useApplicationForm';
import type { FormStep } from './types';
import { STEP_LABELS } from './types';
import PersonalInfoStep from './components/PersonalInfoStep';
import AcademicDetailsStep from './components/AcademicDetailsStep';
import CourseSelectionStep from './components/CourseSelectionStep';
import ReviewStep from './components/ReviewStep';
import ApplicationDashboard from './components/ApplicationDashboard';

// ============================================
// INNER FORM COMPONENT (uses context)
// ============================================

function ApplyFormContent() {
  const {
    formData,
    activeStep,
    isSubmitting,
    submissionError,
    setSubmissionError,
    setIsSubmitting,
    validateStep,
    goToNextStep,
    goToPreviousStep,
    saveDraftToDb,
    draftId,
    clearSavedForm,
    updateFormData,
    isReturningUser,
    returnUserMode,
    returningUserCheckComplete,
    isAuthLoading,
    showPhoneVerification,
    setShowPhoneVerification,
    onPhoneVerified,
  } = useFormContext();

  const [showSuccess, setShowSuccess] = useState(false);
  const [chatComplete, setChatComplete] = useState(false);

  // Loading state while checking returning user
  if (isAuthLoading || !returningUserCheckComplete) {
    return (
      <Container maxWidth="sm">
        <Box sx={{ py: 4 }}>
          <Skeleton variant="text" width="60%" height={40} sx={{ mb: 2 }} />
          <Skeleton variant="text" width="80%" height={24} sx={{ mb: 3 }} />
          <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 1, mb: 2 }} />
          <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 1 }} />
        </Box>
      </Container>
    );
  }

  // Show dashboard for returning users
  if (isReturningUser && returnUserMode === 'dashboard') {
    return <ApplicationDashboard />;
  }

  const handleNext = () => {
    const validation = validateStep(activeStep);
    if (validation.isValid) {
      // Save draft to DB on each step transition
      saveDraftToDb(activeStep);
      goToNextStep();
    }
  };

  const handleSubmit = async () => {
    const validation = validateStep(activeStep);
    if (!validation.isValid) return;

    setIsSubmitting(true);
    setSubmissionError(null);

    try {
      const { user } = await import('@neram/auth').then(m => {
        // Access the current auth state - the hook is already in context
        return { user: null }; // We'll use fetch with the token instead
      });

      // Build submission payload
      const payload = buildSubmitPayload(formData, draftId);

      const response = await fetch('/api/application/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to submit application');
      }

      clearSavedForm();
      setShowSuccess(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      setSubmissionError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle chat widget field updates
  const handleChatFieldUpdate = (field: string, value: unknown) => {
    // Map flat field names to nested structure
    const fieldMappings: Record<string, { section: string; key: string }> = {
      firstName: { section: 'personal', key: 'firstName' },
      fatherName: { section: 'personal', key: 'fatherName' },
      email: { section: 'personal', key: 'email' },
      phone: { section: 'personal', key: 'phone' },
      dateOfBirth: { section: 'personal', key: 'dateOfBirth' },
      gender: { section: 'personal', key: 'gender' },
      pincode: { section: 'location', key: 'pincode' },
      city: { section: 'location', key: 'city' },
      state: { section: 'location', key: 'state' },
      address: { section: 'location', key: 'address' },
    };

    const mapping = fieldMappings[field];
    if (mapping) {
      updateFormData(mapping.section as any, { [mapping.key]: value });
    }
  };

  const renderStepContent = () => {
    switch (activeStep) {
      case 0: return <PersonalInfoStep />;
      case 1: return <AcademicDetailsStep />;
      case 2: return <CourseSelectionStep />;
      case 3: return <ReviewStep />;
      default: return null;
    }
  };

  // Success screen
  if (showSuccess) {
    return (
      <Container maxWidth="sm">
        <Paper sx={{ p: 4, textAlign: 'center', mt: 4 }}>
          <Box
            sx={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              bgcolor: 'success.light',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mx: 'auto',
              mb: 3,
            }}
          >
            <Typography variant="h3">&#10003;</Typography>
          </Box>
          <Typography variant="h5" gutterBottom fontWeight={600}>
            Application Submitted!
          </Typography>
          <Typography color="text.secondary" paragraph>
            Thank you for applying to Neram Classes. Our team will review your application
            and contact you within 24-48 hours.
          </Typography>
          <Alert severity="info" sx={{ textAlign: 'left', mb: 3 }}>
            <Typography variant="body2">
              <strong>What happens next?</strong>
              <br />
              1. Our counselor will call you to discuss course details
              <br />
              2. After verification, you will receive fee details via email
              <br />
              3. Complete payment to confirm your admission
            </Typography>
          </Alert>
          <Button variant="contained" href="/dashboard" sx={{ mt: 2 }}>
            Go to Dashboard
          </Button>
        </Paper>
      </Container>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 600, mb: 1 }}>
        Apply to Neram Classes
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Complete the form below to apply for NATA / JEE Paper 2 coaching
      </Typography>

      <Paper sx={{ p: { xs: 2, md: 3 } }}>
        {/* Stepper - Hidden on mobile */}
        <Box sx={{ display: { xs: 'none', md: 'block' }, mb: 4 }}>
          <Stepper activeStep={activeStep}>
            {STEP_LABELS.map((label, index) => (
              <Step key={label} completed={index < activeStep}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>
        </Box>

        {/* Mobile step indicator */}
        <Box sx={{ display: { xs: 'flex', md: 'none' }, mb: 3, alignItems: 'center', gap: 1 }}>
          <Typography variant="subtitle2" color="primary">
            Step {activeStep + 1} of {STEP_LABELS.length}
          </Typography>
          <Typography variant="subtitle1" fontWeight={600}>
            {STEP_LABELS[activeStep]}
          </Typography>
        </Box>

        {/* Error display */}
        {submissionError && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {submissionError}
          </Alert>
        )}

        {/* Step content */}
        <Box sx={{ mb: 4, minHeight: 300 }}>
          {renderStepContent()}
        </Box>

        {/* Navigation buttons */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: 2, borderTop: 1, borderColor: 'divider' }}>
          <Button
            disabled={activeStep === 0 || isSubmitting}
            onClick={goToPreviousStep}
            variant="outlined"
          >
            Back
          </Button>
          <Box sx={{ display: 'flex', gap: 2 }}>
            {activeStep === 3 ? (
              <Button
                variant="contained"
                onClick={handleSubmit}
                disabled={isSubmitting}
                startIcon={isSubmitting ? <CircularProgress size={20} color="inherit" /> : null}
              >
                {isSubmitting ? 'Submitting...' : 'Submit Application'}
              </Button>
            ) : (
              <Button variant="contained" onClick={handleNext}>
                Next
              </Button>
            )}
          </Box>
        </Box>
      </Paper>

      {/* Progress indicator */}
      <Box sx={{ mt: 2, textAlign: 'center' }}>
        <Typography variant="caption" color="text.secondary">
          {Math.round(((activeStep + 1) / STEP_LABELS.length) * 100)}% complete
        </Typography>
      </Box>

      {/* Phone Verification Modal */}
      <LoginModal
        open={showPhoneVerification}
        onClose={() => setShowPhoneVerification(false)}
        allowClose={true}
        apiBaseUrl={process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3011'}
        onAuthenticated={async () => {
          setShowPhoneVerification(false);
          const { getFirebaseAuth } = await import('@neram/auth');
          const currentUser = getFirebaseAuth().currentUser;
          if (currentUser?.phoneNumber) {
            onPhoneVerified(currentUser.phoneNumber);
          }
        }}
      />

      {/* Chat Widget */}
      <ChatWidget
        flowConfig={applicationFormFlow}
        formData={flattenFormData(formData) as unknown as Record<string, unknown>}
        onFieldUpdate={handleChatFieldUpdate}
        onComplete={() => setChatComplete(true)}
        title="Nera"
        subtitle="Application Assistant"
      />

      <Snackbar
        open={chatComplete && !showSuccess}
        autoHideDuration={5000}
        onClose={() => setChatComplete(false)}
        message="Chat complete! Review your form and click Submit when ready."
      />
    </Box>
  );
}

// ============================================
// HELPERS
// ============================================

function flattenFormData(formData: any): Record<string, unknown> {
  return {
    ...formData.personal,
    ...formData.location,
    applicantCategory: formData.academic.applicantCategory,
    casteCategory: formData.academic.casteCategory,
    targetExamYear: formData.academic.targetExamYear,
    interestCourse: formData.course.interestCourse,
    learningMode: formData.course.learningMode,
    termsAccepted: formData.termsAccepted,
  };
}

function buildSubmitPayload(formData: any, draftId: string | null) {
  let academicData = null;
  switch (formData.academic.applicantCategory) {
    case 'school_student': academicData = formData.academic.schoolStudentData; break;
    case 'diploma_student': academicData = formData.academic.diplomaStudentData; break;
    case 'college_student': academicData = formData.academic.collegeStudentData; break;
    case 'working_professional': academicData = formData.academic.workingProfessionalData; break;
  }

  return {
    draftId,
    // Personal
    first_name: formData.personal.firstName,
    father_name: formData.personal.fatherName,
    email: formData.personal.email,
    phone: formData.personal.phone,
    phone_verified: formData.personal.phoneVerified,
    phone_verified_at: formData.personal.phoneVerifiedAt,
    date_of_birth: formData.personal.dateOfBirth,
    gender: formData.personal.gender,
    // Location
    country: formData.location.country || 'IN',
    pincode: formData.location.pincode,
    city: formData.location.city,
    state: formData.location.state,
    district: formData.location.district,
    address: formData.location.address,
    latitude: formData.location.latitude,
    longitude: formData.location.longitude,
    location_source: formData.location.locationSource,
    detected_location: formData.location.detectedLocation,
    // Academic
    applicant_category: formData.academic.applicantCategory,
    caste_category: formData.academic.casteCategory,
    target_exam_year: formData.academic.targetExamYear,
    school_type: formData.academic.schoolType,
    academic_data: academicData,
    // Course
    interest_course: formData.course.interestCourse,
    selected_course_id: formData.course.selectedCourseId,
    selected_center_id: formData.course.selectedCenterId,
    hybrid_learning_accepted: formData.course.hybridLearningAccepted,
    learning_mode: formData.course.learningMode,
    // Source
    utm_source: formData.utmSource,
    utm_medium: formData.utmMedium,
    utm_campaign: formData.utmCampaign,
    referral_code: formData.referralCode,
    // Meta
    terms_accepted: formData.termsAccepted,
    form_step_completed: 4,
    source: 'app',
  };
}

// ============================================
// MAIN PAGE (wraps content in FormProvider)
// ============================================

export default function ApplyPage() {
  return (
    <FormProvider>
      <ApplyFormContent />
    </FormProvider>
  );
}

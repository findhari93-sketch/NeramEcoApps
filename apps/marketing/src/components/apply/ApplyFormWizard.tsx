'use client';

import { useState } from 'react';
import {
  Box,
  Container,
  Stepper,
  Step,
  StepLabel,
  Button,
  Typography,
  Card,
  CardContent,
  Alert,
  CircularProgress,
  useMediaQuery,
  useTheme,
  MobileStepper,
} from '@neram/ui';
import { KeyboardArrowLeft, KeyboardArrowRight, CheckCircleOutlined } from '@mui/icons-material';
import { useFormContext, FormProvider } from './FormContext';
import { STEP_LABELS, type FormStep } from './types';
import PersonalInfoStep from './steps/PersonalInfoStep';
import AcademicDetailsStep from './steps/AcademicDetailsStep';
import CourseSelectionStep from './steps/CourseSelectionStep';
import ReviewStep from './steps/ReviewStep';
import { LoginModal } from '@neram/ui';
import { useFirebaseAuth } from '@neram/auth';
import QuickInfoPanel from './QuickInfoPanel';

// Wrapper to pass context-aware props to QuickInfoPanel
function QuickInfoPanelWithContext() {
  const { formData } = useFormContext();
  const isGovernmentSchool =
    formData.academic.applicantCategory === 'school_student' &&
    formData.academic.schoolType === 'government_school';

  return <QuickInfoPanel hideFeesForScholarship={isGovernmentSchool} />;
}

// ============================================
// STEP CONTENT RENDERER
// ============================================

interface StepContentProps {
  step: number;
  onEditStep: (step: number) => void;
}

function StepContent({ step, onEditStep }: StepContentProps) {
  switch (step) {
    case 0:
      return <PersonalInfoStep />;
    case 1:
      return <AcademicDetailsStep />;
    case 2:
      return <CourseSelectionStep />;
    case 3:
      return <ReviewStep onEditStep={onEditStep} />;
    default:
      return null;
  }
}

// ============================================
// SUCCESS SCREEN
// ============================================

function SuccessScreen({ applicationNumber }: { applicationNumber: string }) {
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3011';

  return (
    <Box textAlign="center" py={6}>
      <CheckCircleOutlined sx={{ fontSize: 80, color: 'success.main', mb: 3 }} />
      <Typography variant="h4" gutterBottom fontWeight={700}>
        Application Submitted!
      </Typography>
      <Typography variant="h6" color="text.secondary" gutterBottom>
        Your application number is:
      </Typography>
      <Typography
        variant="h4"
        sx={{
          fontFamily: 'monospace',
          bgcolor: 'grey.100',
          py: 2,
          px: 4,
          borderRadius: 2,
          display: 'inline-block',
          my: 2,
        }}
      >
        {applicationNumber}
      </Typography>

      {/* What happens next timeline */}
      <Box sx={{ maxWidth: 480, mx: 'auto', mt: 4, textAlign: 'left' }}>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          What happens next?
        </Typography>
        {[
          { step: '1', text: 'Application received', done: true },
          { step: '2', text: 'Our team reviews your application (24-48 hours)' },
          { step: '3', text: 'You will be notified via email & WhatsApp' },
          { step: '4', text: 'Complete enrollment in your student dashboard' },
        ].map((item) => (
          <Box key={item.step} display="flex" alignItems="center" gap={2} mb={1.5}>
            <Box
              sx={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                bgcolor: item.done ? 'success.main' : 'grey.300',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              {item.done ? '\u2713' : item.step}
            </Box>
            <Typography variant="body2" color={item.done ? 'success.main' : 'text.secondary'}>
              {item.text}
            </Typography>
          </Box>
        ))}
      </Box>

      <Box mt={4} display="flex" gap={2} justifyContent="center" flexWrap="wrap">
        <Button
          variant="contained"
          href={`${APP_URL}/my-applications`}
          size="large"
        >
          Track Your Application
        </Button>
        <Button variant="outlined" href="/" size="large">
          Back to Home
        </Button>
      </Box>
    </Box>
  );
}

// ============================================
// FORM WIZARD INNER
// ============================================

function FormWizardInner() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { user } = useFirebaseAuth();

  const {
    formData,
    activeStep,
    setActiveStep,
    goToNextStep,
    goToPreviousStep,
    isFirstStep,
    isLastStep,
    validateStep,
    showPhoneVerification,
    setShowPhoneVerification,
    onPhoneVerified,
    isSubmitting,
    setIsSubmitting,
    submissionError,
    setSubmissionError,
    clearSavedForm,
    isAuthenticated,
  } = useFormContext();

  const [submitted, setSubmitted] = useState(false);
  const [applicationNumber, setApplicationNumber] = useState('');
  const [showLoginModal, setShowLoginModal] = useState(false);

  const currentValidation = validateStep(activeStep as 0 | 1 | 2 | 3);

  const handleNext = () => {
    // Special handling for Step 0 - require phone verification
    if (activeStep === 0 && !formData.personal.phoneVerified) {
      setShowPhoneVerification(true);
      return;
    }

    if (currentValidation.isValid) {
      goToNextStep();
    }
  };

  const handleSubmit = async () => {
    if (!currentValidation.isValid) return;

    setIsSubmitting(true);
    setSubmissionError(null);

    try {
      // Get auth token if logged in
      let headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (user) {
        const idToken = await (user.raw as any)?.getIdToken?.();
        if (idToken) {
          headers.Authorization = `Bearer ${idToken}`;
        }
      }

      // Prepare academic data based on category
      let academicData = null;
      switch (formData.academic.applicantCategory) {
        case 'school_student':
          academicData = formData.academic.schoolStudentData;
          break;
        case 'diploma_student':
          academicData = formData.academic.diplomaStudentData;
          break;
        case 'college_student':
          academicData = formData.academic.collegeStudentData;
          break;
        case 'working_professional':
          academicData = formData.academic.workingProfessionalData;
          break;
      }

      const payload = {
        // Personal
        first_name: formData.personal.firstName,
        father_name: formData.personal.fatherName,
        phone_verified: formData.personal.phoneVerified,
        phone_verified_at: formData.personal.phoneVerifiedAt,

        // Location
        country: formData.location.country,
        city: formData.location.city,
        state: formData.location.state,
        district: formData.location.district,
        pincode: formData.location.pincode,
        address: formData.location.address,
        latitude: formData.location.latitude,
        longitude: formData.location.longitude,
        location_source: formData.location.locationSource,

        // Academic
        applicant_category: formData.academic.applicantCategory,
        academic_data: academicData,
        caste_category: formData.academic.casteCategory,
        target_exam_year: formData.academic.targetExamYear,
        school_type: formData.academic.schoolType,

        // Course
        interest_course: formData.course.interestCourse,
        selected_course_id: formData.course.selectedCourseId,
        selected_center_id: formData.course.selectedCenterId,
        hybrid_learning_accepted: formData.course.hybridLearningAccepted,
        learning_mode: formData.course.learningMode,

        // Status - submit the application
        status: 'submitted',

        // Source tracking
        utm_source: formData.utmSource,
        utm_medium: formData.utmMedium,
        utm_campaign: formData.utmCampaign,
        referral_code: formData.referralCode,
      };

      const response = await fetch('/api/application', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (result.success) {
        setApplicationNumber(result.data.application_number || 'NERAM-PENDING');
        setSubmitted(true);
        clearSavedForm();
      } else {
        console.error('Application submission failed:', result);
        if (result.debug) {
          console.error('Debug info:', JSON.stringify(result.debug, null, 2));
        }
        setSubmissionError(result.error || 'Failed to submit application. Please try again.');
      }
    } catch (error) {
      console.error('Submission error:', error);
      setSubmissionError('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // If submitted, show success screen
  if (submitted) {
    return <SuccessScreen applicationNumber={applicationNumber} />;
  }

  return (
    <Box sx={{ width: '100%', py: { xs: 2, md: 4 } }}>
      {/* Stepper - Desktop */}
      {!isMobile && (
        <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
          {STEP_LABELS.map((label, index) => (
            <Step key={label}>
              <StepLabel
                error={
                  index < activeStep && !validateStep(index as 0 | 1 | 2 | 3).isValid
                }
              >
                {label}
              </StepLabel>
            </Step>
          ))}
        </Stepper>
      )}

      {/* Stepper - Mobile */}
      {isMobile && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="overline" color="text.secondary">
            Step {activeStep + 1} of {STEP_LABELS.length}
          </Typography>
          <Typography variant="h6" fontWeight={600}>
            {STEP_LABELS[activeStep]}
          </Typography>
          <MobileStepper
            variant="progress"
            steps={4}
            position="static"
            activeStep={activeStep}
            sx={{ flexGrow: 1, mt: 1, px: 0 }}
            nextButton={<Box />}
            backButton={<Box />}
          />
        </Box>
      )}

      {/* Login Suggestion Banner */}
      {!isAuthenticated && activeStep === 0 && (
        <Alert
          severity="info"
          sx={{ mb: 3 }}
          action={
            <Button
              color="inherit"
              size="small"
              variant="outlined"
              onClick={() => setShowLoginModal(true)}
              sx={{ whiteSpace: 'nowrap' }}
            >
              Login
            </Button>
          }
        >
          <Typography variant="body2">
            <strong>Tip:</strong> Log in to auto-fill your details and save your application progress.
          </Typography>
        </Alert>
      )}

      {/* Submission Error */}
      {submissionError && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setSubmissionError(null)}>
          {submissionError}
        </Alert>
      )}

      {/* Validation Errors */}
      {!currentValidation.isValid && currentValidation.errors.length > 0 && activeStep < 3 && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Please fill in all required fields before proceeding.
        </Alert>
      )}

      {/* Step Content */}
      <Card elevation={isMobile ? 0 : 2} sx={{ mb: 3 }}>
        <CardContent sx={{ p: { xs: 2, md: 4 } }}>
          <StepContent step={activeStep} onEditStep={(step) => setActiveStep(step as FormStep)} />
        </CardContent>
      </Card>

      {/* Navigation Buttons */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 2,
          flexDirection: isMobile ? 'column-reverse' : 'row',
        }}
      >
        <Button
          variant="outlined"
          onClick={goToPreviousStep}
          disabled={isFirstStep || isSubmitting}
          startIcon={<KeyboardArrowLeft />}
          sx={{ minHeight: 48 }}
          fullWidth={isMobile}
        >
          Back
        </Button>

        {isLastStep ? (
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={!currentValidation.isValid || isSubmitting}
            sx={{ minHeight: 48, minWidth: 200 }}
            fullWidth={isMobile}
          >
            {isSubmitting ? (
              <>
                <CircularProgress size={20} sx={{ mr: 1 }} color="inherit" />
                Submitting...
              </>
            ) : (
              'Submit Application'
            )}
          </Button>
        ) : (
          <Button
            variant="contained"
            onClick={handleNext}
            endIcon={<KeyboardArrowRight />}
            sx={{ minHeight: 48 }}
            fullWidth={isMobile}
          >
            Next
          </Button>
        )}
      </Box>

      {/* Phone Verification Modal */}
      <LoginModal
        open={showPhoneVerification}
        onClose={() => setShowPhoneVerification(false)}
        allowClose={false}
        onAuthenticated={async () => {
          setShowPhoneVerification(false);
          // Get verified phone from Firebase after OTP verification
          const { getFirebaseAuth } = await import('@neram/auth');
          const currentUser = getFirebaseAuth().currentUser;
          const phone = currentUser?.phoneNumber || user?.phone || formData.personal.phone || '';
          onPhoneVerified(phone);
        }}
        apiBaseUrl={process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3011'}
        phoneOnly={true}
      />

      {/* Google Login Modal (for pre-fill) */}
      <LoginModal
        open={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        allowClose={true}
        onAuthenticated={() => {
          setShowLoginModal(false);
          // FormContext will auto-prefill from user profile on next render
        }}
        apiBaseUrl={process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3011'}
      />
    </Box>
  );
}

// ============================================
// MAIN EXPORT
// ============================================

export default function ApplyFormWizard() {
  return (
    <FormProvider>
      <Container maxWidth="md">
        <FormWizardInner />
      </Container>
      <QuickInfoPanelWithContext />
    </FormProvider>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Container,
  Stepper,
  Step,
  StepLabel,
  Button,
  Typography,
  Alert,
  CircularProgress,
  useMediaQuery,
  useTheme,
  MobileStepper,
  Paper,
  Skeleton,
} from '@neram/ui';
import { KeyboardArrowLeft, KeyboardArrowRight, CheckCircleOutlined, ErrorOutline, TimerOff, Google } from '@mui/icons-material';
import { useFirebaseAuth, getCurrentUser } from '@neram/auth';
import { LoginModal } from '@neram/ui';
import { useSearchParams } from 'next/navigation';
import PersonalDetailsStep from './PersonalDetailsStep';
import AcademicDetailsStep from './AcademicDetailsStep';
import ReviewStep from './ReviewStep';
import SuccessScreen from './SuccessScreen';
import type {
  PersonalInfoData,
  LocationData,
  AcademicDetailsData,
} from '@/components/apply/types';
import { DEFAULT_FORM_DATA } from '@/components/apply/types';

const STEP_LABELS = ['Personal Details', 'Academic Details', 'Review & Confirm'];

interface LinkData {
  token: string;
  studentName: string;
  studentPhone: string | null;
  interestCourse: string;
  learningMode: string;
  courseId: string | null;
  batchId: string | null;
  centerId: string | null;
  courseName: string | null;
  batchName: string | null;
  centerName: string | null;
  totalFee: number;
  discountAmount: number;
  finalFee: number;
  amountPaid: number;
  expiresAt: string;
}

export default function EnrollWizard() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const { user, loading: authLoading, signInWithGoogle } = useFirebaseAuth();

  // Token validation state
  const [tokenStatus, setTokenStatus] = useState<'loading' | 'valid' | 'invalid' | 'expired' | 'used'>('loading');
  const [tokenError, setTokenError] = useState<string>('');
  const [linkData, setLinkData] = useState<LinkData | null>(null);

  // Form state
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [applicationNumber, setApplicationNumber] = useState<string | null>(null);

  // Phone verification
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [phoneVerifiedAt, setPhoneVerifiedAt] = useState<string | null>(null);
  const [showPhoneModal, setShowPhoneModal] = useState(false);

  // Terms
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setTokenStatus('invalid');
      setTokenError('No enrollment token provided. Please use the link shared by your admin.');
      return;
    }
    validateToken(token);
  }, [token]);

  // Auto-fill from Google login
  useEffect(() => {
    if (user && linkData) {
      setFormData((prev) => ({
        ...prev,
        personal: {
          ...prev.personal,
          firstName: prev.personal.firstName || user.name?.split(' ')[0] || '',
          email: user.email || prev.personal.email,
          phone: user.phone || prev.personal.phone,
        },
      }));
    }
  }, [user, linkData]);

  const validateToken = async (t: string) => {
    try {
      setTokenStatus('loading');
      const res = await fetch(`/api/enroll/validate?token=${encodeURIComponent(t)}`);
      const data = await res.json();

      if (!res.ok) {
        const code = data.code || '';
        if (code === 'ALREADY_USED') {
          setTokenStatus('used');
        } else if (code === 'EXPIRED' || code === 'CANCELLED') {
          setTokenStatus('expired');
        } else {
          setTokenStatus('invalid');
        }
        setTokenError(data.error || 'Invalid link');
        return;
      }

      setLinkData(data.data);
      setTokenStatus('valid');
    } catch {
      setTokenStatus('invalid');
      setTokenError('Failed to validate the enrollment link. Please try again.');
    }
  };

  const updatePersonalData = useCallback((data: Partial<PersonalInfoData>) => {
    setFormData((prev) => ({
      ...prev,
      personal: { ...prev.personal, ...data },
    }));
  }, []);

  const updateLocationData = useCallback((data: Partial<LocationData>) => {
    setFormData((prev) => ({
      ...prev,
      location: { ...prev.location, ...data },
    }));
  }, []);

  const updateAcademicData = useCallback((data: Partial<AcademicDetailsData>) => {
    setFormData((prev) => ({
      ...prev,
      academic: { ...prev.academic, ...data },
    }));
  }, []);

  const handleNext = () => {
    setCurrentStep((prev) => Math.min(prev + 1, 2));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getAcademicDataForSubmit = () => {
    const { applicantCategory } = formData.academic;
    if (applicantCategory === 'school_student') return formData.academic.schoolStudentData;
    if (applicantCategory === 'diploma_student') return formData.academic.diplomaStudentData;
    if (applicantCategory === 'college_student') return formData.academic.collegeStudentData;
    if (applicantCategory === 'working_professional') return formData.academic.workingProfessionalData;
    return null;
  };

  const handleSubmit = async () => {
    if (!user || !linkData) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const firebaseUser = getCurrentUser();
      const idToken = await firebaseUser?.getIdToken();

      const res = await fetch('/api/enroll/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          token: linkData.token,
          firstName: formData.personal.firstName,
          fatherName: formData.personal.fatherName,
          dateOfBirth: formData.personal.dateOfBirth,
          gender: formData.personal.gender,
          country: formData.location.country,
          state: formData.location.state,
          city: formData.location.city,
          district: formData.location.district,
          pincode: formData.location.pincode,
          address: formData.location.address,
          applicantCategory: formData.academic.applicantCategory,
          academicData: getAcademicDataForSubmit(),
          casteCategory: formData.academic.casteCategory,
          targetExamYear: formData.academic.targetExamYear,
          schoolType: formData.academic.schoolType,
          phoneVerified,
          phoneVerifiedAt,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to complete enrollment');
      }

      setApplicationNumber(data.data.applicationNumber);
      setCurrentStep(3); // Success
    } catch (err: any) {
      setSubmitError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ============================================
  // ERROR STATES
  // ============================================

  if (tokenStatus === 'loading') {
    return (
      <Container maxWidth="sm" sx={{ py: 6, textAlign: 'center' }}>
        <CircularProgress size={48} sx={{ mb: 3 }} />
        <Typography variant="h6" color="text.secondary">
          Validating your enrollment link...
        </Typography>
      </Container>
    );
  }

  if (tokenStatus === 'invalid') {
    return (
      <Container maxWidth="sm" sx={{ py: 6, textAlign: 'center' }}>
        <ErrorOutline sx={{ fontSize: 64, color: 'error.main', mb: 2 }} />
        <Typography variant="h5" fontWeight={700} gutterBottom>
          Invalid Enrollment Link
        </Typography>
        <Typography color="text.secondary" mb={3}>
          {tokenError}
        </Typography>
        <Alert severity="info">
          If you believe this is an error, please contact your admin or reach out to us at support@neramclasses.com
        </Alert>
      </Container>
    );
  }

  if (tokenStatus === 'expired') {
    return (
      <Container maxWidth="sm" sx={{ py: 6, textAlign: 'center' }}>
        <TimerOff sx={{ fontSize: 64, color: 'warning.main', mb: 2 }} />
        <Typography variant="h5" fontWeight={700} gutterBottom>
          Link Expired
        </Typography>
        <Typography color="text.secondary" mb={3}>
          {tokenError}
        </Typography>
        <Alert severity="warning">
          Please contact your admin to get a new enrollment link.
        </Alert>
      </Container>
    );
  }

  if (tokenStatus === 'used') {
    return (
      <Container maxWidth="sm" sx={{ py: 6, textAlign: 'center' }}>
        <CheckCircleOutlined sx={{ fontSize: 64, color: 'info.main', mb: 2 }} />
        <Typography variant="h5" fontWeight={700} gutterBottom>
          Already Enrolled
        </Typography>
        <Typography color="text.secondary" mb={3}>
          This enrollment link has already been used.
        </Typography>
        <Button
          variant="contained"
          href="https://app.neramclasses.com"
          size="large"
          sx={{ borderRadius: 1, fontWeight: 600, mt: 2 }}
        >
          Go to Student App
        </Button>
      </Container>
    );
  }

  // ============================================
  // AUTH GATE
  // ============================================

  if (tokenStatus === 'valid' && !authLoading && !user) {
    return (
      <Container maxWidth="sm" sx={{ py: 6 }}>
        <Paper
          elevation={0}
          sx={{
            p: { xs: 3, md: 4 },
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            textAlign: 'center',
          }}
        >
          <Typography variant="h5" fontWeight={700} gutterBottom>
            Complete Your Enrollment
          </Typography>
          <Typography color="text.secondary" mb={1}>
            Welcome, <strong>{linkData?.studentName}</strong>!
          </Typography>
          <Typography color="text.secondary" mb={4}>
            Sign in with Google to continue your enrollment at Neram Classes.
          </Typography>

          {/* Course info summary */}
          {linkData && (
            <Paper
              elevation={0}
              sx={{
                p: 2,
                mb: 4,
                bgcolor: 'primary.50',
                border: '1px solid',
                borderColor: 'primary.100',
                borderRadius: 1,
                textAlign: 'left',
              }}
            >
              <Typography variant="body2" fontWeight={600} color="primary.main" mb={1}>
                Your Course Details
              </Typography>
              <Typography variant="body2">
                Course: {linkData.courseName || linkData.interestCourse?.toUpperCase()}
              </Typography>
              <Typography variant="body2">
                Fee: ₹{Number(linkData.finalFee).toLocaleString('en-IN')} | Paid: ₹{Number(linkData.amountPaid).toLocaleString('en-IN')}
              </Typography>
            </Paper>
          )}

          <Button
            variant="contained"
            size="large"
            fullWidth
            onClick={signInWithGoogle}
            startIcon={<Google />}
            sx={{
              py: 1.5,
              fontSize: '1rem',
              fontWeight: 600,
              borderRadius: 1,
              textTransform: 'none',
            }}
          >
            Sign in with Google
          </Button>

          <Typography variant="caption" color="text.secondary" mt={2} display="block">
            Your Google account will be used to create your student profile.
          </Typography>
        </Paper>
      </Container>
    );
  }

  if (authLoading) {
    return (
      <Container maxWidth="sm" sx={{ py: 6, textAlign: 'center' }}>
        <CircularProgress size={40} />
      </Container>
    );
  }

  // ============================================
  // SUCCESS SCREEN
  // ============================================

  if (currentStep === 3 && applicationNumber) {
    return <SuccessScreen applicationNumber={applicationNumber} />;
  }

  // ============================================
  // MAIN FORM
  // ============================================

  return (
    <Container maxWidth="md" sx={{ py: { xs: 2, md: 4 } }}>
      {/* Header */}
      <Box mb={3}>
        <Typography variant="h5" fontWeight={700}>
          Complete Your Enrollment
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Fill in your details to complete enrollment at Neram Classes.
        </Typography>
      </Box>

      {/* Stepper */}
      {isMobile ? (
        <MobileStepper
          variant="progress"
          steps={3}
          position="static"
          activeStep={currentStep}
          sx={{ mb: 2, borderRadius: 1, bgcolor: 'grey.50' }}
          backButton={null}
          nextButton={null}
        />
      ) : (
        <Stepper activeStep={currentStep} sx={{ mb: 4 }}>
          {STEP_LABELS.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
      )}

      {/* Step title on mobile */}
      {isMobile && (
        <Typography variant="subtitle2" color="text.secondary" mb={2}>
          Step {currentStep + 1} of 3: {STEP_LABELS[currentStep]}
        </Typography>
      )}

      {/* Error alert */}
      {submitError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setSubmitError(null)}>
          {submitError}
        </Alert>
      )}

      {/* Step content */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, md: 3 },
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          mb: 3,
        }}
      >
        {currentStep === 0 && (
          <PersonalDetailsStep
            personal={formData.personal}
            location={formData.location}
            updatePersonal={updatePersonalData}
            updateLocation={updateLocationData}
            phoneVerified={phoneVerified}
            onVerifyPhone={() => setShowPhoneModal(true)}
          />
        )}
        {currentStep === 1 && (
          <AcademicDetailsStep
            academic={formData.academic}
            updateAcademic={updateAcademicData}
          />
        )}
        {currentStep === 2 && (
          <ReviewStep
            formData={formData}
            linkData={linkData!}
            phoneVerified={phoneVerified}
            termsAccepted={termsAccepted}
            setTermsAccepted={setTermsAccepted}
            onSubmit={handleSubmit}
            submitting={submitting}
          />
        )}
      </Paper>

      {/* Navigation buttons */}
      {currentStep < 2 && (
        <Box display="flex" justifyContent="space-between" gap={2}>
          <Button
            variant="outlined"
            onClick={handleBack}
            disabled={currentStep === 0}
            startIcon={<KeyboardArrowLeft />}
            sx={{ borderRadius: 1 }}
          >
            Back
          </Button>
          <Button
            variant="contained"
            onClick={handleNext}
            endIcon={<KeyboardArrowRight />}
            sx={{ borderRadius: 1, fontWeight: 600 }}
          >
            Continue
          </Button>
        </Box>
      )}

      {/* Phone verification modal */}
      {showPhoneModal && (
        <LoginModal
          open={showPhoneModal}
          onClose={() => setShowPhoneModal(false)}
          phoneOnly
          apiBaseUrl=""
          onAuthenticated={() => {
            setPhoneVerified(true);
            setPhoneVerifiedAt(new Date().toISOString());
            setShowPhoneModal(false);
          }}
        />
      )}
    </Container>
  );
}

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Checkbox,
  LinearProgress,
} from '@neram/ui';
import { KeyboardArrowLeft, KeyboardArrowRight, CheckCircleOutlined, ErrorOutline, TimerOff, Google, Refresh, SupportAgent, Edit as EditIcon, Save as SaveIcon, CheckCircle, RadioButtonUnchecked, OpenInNew, WhatsApp, Laptop, Groups, Person } from '@mui/icons-material';
import { useFirebaseAuth, getCurrentUser } from '@neram/auth';
import { LoginModal } from '@neram/ui';
import { useSearchParams } from 'next/navigation';
import { invalidateApplicationStatus } from '@/hooks/useApplicationStatus';
import PersonalDetailsStep from './PersonalDetailsStep';
import AcademicDetailsStep from './AcademicDetailsStep';
import ReviewStep from './ReviewStep';
import SuccessScreen from './SuccessScreen';
import { useEnrollmentProgress } from '@/hooks/useEnrollmentProgress';
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

interface LeadProfileData {
  id: string;
  firstName: string | null;
  fatherName: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  district: string | null;
  pincode: string | null;
  address: string | null;
  applicantCategory: string | null;
  academicData: Record<string, unknown> | null;
  casteCategory: string | null;
  targetExamYear: number | null;
  schoolType: string | null;
  parentPhone: string | null;
  learningMode: string | null;
}

interface UsedLinkData {
  applicationNumber: string | null;
  studentName: string | null;
  interestCourse: string | null;
  courseName: string | null;
  totalFee: number | null;
  amountPaid: number | null;
  finalFee: number | null;
  enrolledAt: string | null;
  enrolledByFirebaseUid: string | null;
  leadProfile?: LeadProfileData | null;
  isOwner?: boolean;
}

interface OnboardingStep {
  id: string;
  isCompleted: boolean;
  completedAt: string | null;
  completedByType: string | null;
  stepKey: string;
  title: string;
  description: string | null;
  iconName: string | null;
  actionType: 'link' | 'in_app' | 'manual';
  actionConfig: Record<string, unknown>;
  displayOrder: number;
  isRequired: boolean;
}

const ONBOARDING_ICONS: Record<string, React.ReactNode> = {
  WhatsApp: <WhatsApp sx={{ color: '#25D366' }} />,
  Laptop: <Laptop sx={{ color: '#0078D4' }} />,
  Groups: <Groups sx={{ color: '#0078D4' }} />,
  Person: <Person sx={{ color: '#1976d2' }} />,
};

export default function EnrollWizard() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const { user, loading: authLoading, signInWithGoogle } = useFirebaseAuth();

  // Session persistence
  const { restoredState, isResuming, saveProgress, clearProgress, dismissResume } = useEnrollmentProgress(token);
  const initializedFromRestore = useRef(false);

  // Token validation state
  const [tokenStatus, setTokenStatus] = useState<'loading' | 'valid' | 'invalid' | 'expired' | 'used'>('loading');
  const [tokenError, setTokenError] = useState<string>('');
  const [linkData, setLinkData] = useState<LinkData | null>(null);
  const [usedLinkData, setUsedLinkData] = useState<UsedLinkData | null>(null);

  // Form state - initialize from restored state if available
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [applicationNumber, setApplicationNumber] = useState<string | null>(null);

  // Phone verification
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [phoneVerifiedAt, setPhoneVerifiedAt] = useState<string | null>(null);
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);
  const [showPhoneModal, setShowPhoneModal] = useState(false);

  // Terms
  const [termsAccepted, setTermsAccepted] = useState(false);

  // View/edit mode for revisiting completed enrollment
  const [viewMode, setViewMode] = useState(true); // true = read-only, false = editing
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Onboarding steps
  const [onboardingSteps, setOnboardingSteps] = useState<OnboardingStep[]>([]);
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [togglingStep, setTogglingStep] = useState<string | null>(null);

  // Error page state
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [showTicketDialog, setShowTicketDialog] = useState(false);
  const [requestName, setRequestName] = useState('');
  const [requestEmail, setRequestEmail] = useState('');
  const [requestPhone, setRequestPhone] = useState('');
  const [ticketDescription, setTicketDescription] = useState('');
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestResult, setRequestResult] = useState<{ ticketNumber: string; message: string } | null>(null);
  const [ticketResult, setTicketResult] = useState<{ ticketNumber: string } | null>(null);

  // Restore state from localStorage when available
  useEffect(() => {
    if (restoredState && !initializedFromRestore.current) {
      initializedFromRestore.current = true;
      setCurrentStep(restoredState.currentStep);
      setFormData(restoredState.formData as unknown as typeof DEFAULT_FORM_DATA);
      setPhoneVerified(restoredState.phoneVerified);
      setPhoneVerifiedAt(restoredState.phoneVerifiedAt || null);
      setVerifiedPhone(restoredState.verifiedPhone || null);
      setTermsAccepted(restoredState.termsAccepted);
    }
  }, [restoredState]);

  // Save progress whenever form state changes
  useEffect(() => {
    if (tokenStatus === 'valid' && currentStep < 3) {
      saveProgress({
        currentStep,
        formData: formData as unknown as Record<string, unknown>,
        phoneVerified,
        phoneVerifiedAt,
        verifiedPhone,
        termsAccepted,
      });
    }
  }, [currentStep, formData, phoneVerified, phoneVerifiedAt, verifiedPhone, termsAccepted, tokenStatus, saveProgress]);

  // Validate token — wait for auth to finish loading so we can include the token for ownership check
  useEffect(() => {
    if (!token) {
      setTokenStatus('invalid');
      setTokenError('No enrollment token provided. Please use the link shared by your admin.');
      return;
    }
    if (authLoading) return; // Wait for Firebase auth to hydrate
    // Call validate with auth if user is already signed in
    validateToken(token, user ? (user.raw as any) : undefined);
  }, [token, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-validate when user signs in AFTER initial validate already returned 'used' without owner info
  useEffect(() => {
    if (user && token && tokenStatus === 'used' && usedLinkData && !usedLinkData.isOwner) {
      validateToken(token, (user.raw as any));
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Populate form data from lead profile when owner revisits
  useEffect(() => {
    if (usedLinkData?.isOwner && usedLinkData.leadProfile) {
      const lp = usedLinkData.leadProfile;
      setFormData((prev) => ({
        ...prev,
        personal: {
          ...prev.personal,
          firstName: lp.firstName || prev.personal.firstName,
          fatherName: lp.fatherName || prev.personal.fatherName,
          dateOfBirth: lp.dateOfBirth || prev.personal.dateOfBirth,
          gender: (lp.gender as 'male' | 'female' | 'other') || prev.personal.gender,
          parentPhone: lp.parentPhone || prev.personal.parentPhone,
          phone: lp.parentPhone || prev.personal.phone,
        },
        location: {
          ...prev.location,
          country: lp.country || prev.location.country,
          state: lp.state || prev.location.state,
          city: lp.city || prev.location.city,
          district: lp.district || prev.location.district,
          pincode: lp.pincode || prev.location.pincode,
          address: lp.address || prev.location.address,
        },
        academic: {
          ...prev.academic,
          applicantCategory: (lp.applicantCategory as any) || prev.academic.applicantCategory,
          casteCategory: lp.casteCategory || prev.academic.casteCategory,
          targetExamYear: lp.targetExamYear ? String(lp.targetExamYear) : prev.academic.targetExamYear,
          schoolType: lp.schoolType || prev.academic.schoolType,
        },
      } as typeof prev));
      // Mark phone as verified (was verified during enrollment)
      setPhoneVerified(true);
    }
  }, [usedLinkData?.isOwner, usedLinkData?.leadProfile]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch onboarding steps when owner is identified
  useEffect(() => {
    if (!usedLinkData?.isOwner || !user) return;

    const fetchOnboardingSteps = async () => {
      setOnboardingLoading(true);
      try {
        const firebaseUser = (user.raw as any);
        const idToken = await firebaseUser?.getIdToken();
        const res = await fetch('/api/enroll/onboarding-steps', {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const data = await res.json();
        if (res.ok && data.data) {
          setOnboardingSteps(data.data);
        }
      } catch {
        // Onboarding steps are optional — don't block the page
      } finally {
        setOnboardingLoading(false);
      }
    };

    fetchOnboardingSteps();
  }, [usedLinkData?.isOwner, user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fill from Google login + linkData phone (skip fields already filled from restore)
  useEffect(() => {
    if (user && linkData) {
      // Use phone from: Google account → linkData (admin-set) → existing form value
      const adminPhone = linkData.studentPhone
        ? (linkData.studentPhone.startsWith('+') ? linkData.studentPhone : `+91${linkData.studentPhone}`)
        : '';
      setFormData((prev) => ({
        ...prev,
        personal: {
          ...prev.personal,
          firstName: prev.personal.firstName || user.name?.split(' ')[0] || '',
          email: user.email || prev.personal.email,
          phone: user.phone || prev.personal.phone || adminPhone,
        },
      }));
    }
  }, [user, linkData]);

  // Auto-detect phone verified from Firebase (Fix 2)
  useEffect(() => {
    if (user && linkData && !phoneVerified) {
      if (user.phoneVerified && user.phone) {
        const phone = user.phone.startsWith('+') ? user.phone : `+91${user.phone}`;
        setPhoneVerified(true);
        setPhoneVerifiedAt(new Date().toISOString());
        setVerifiedPhone(phone);
      }
    }
  }, [user, linkData, phoneVerified]);

  // Derive whether phone is currently verified (resets when user edits number)
  const isPhoneCurrentlyVerified = phoneVerified && !!verifiedPhone && verifiedPhone === formData.personal.phone;

  const validateToken = async (t: string, firebaseUserOverride?: any) => {
    try {
      setTokenStatus('loading');

      // Try to include auth token for ownership check (optional, fails gracefully)
      const headers: Record<string, string> = {};
      try {
        const firebaseUser = firebaseUserOverride || getCurrentUser();
        if (firebaseUser) {
          const idToken = await firebaseUser.getIdToken();
          if (idToken) headers.Authorization = `Bearer ${idToken}`;
        }
      } catch {
        // Auth not available yet — that's fine, validate works without it
      }

      const res = await fetch(`/api/enroll/validate?token=${encodeURIComponent(t)}`, { headers });
      const data = await res.json();

      if (!res.ok) {
        const code = data.code || '';
        if (code === 'ALREADY_USED') {
          setTokenStatus('used');
          if (data.data?.applicationNumber) {
            setApplicationNumber(data.data.applicationNumber);
          }
          setUsedLinkData(data.data || null);
        } else if (code === 'EXPIRED' || code === 'CANCELLED') {
          setTokenStatus('expired');
        } else {
          setTokenStatus('invalid');
        }
        setTokenError(data.error || 'Invalid link');
        clearProgress();
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
          parentPhone: formData.personal.parentPhone,
          phoneVerified,
          phoneVerifiedAt,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to complete enrollment');
      }

      // Clear saved progress on success
      clearProgress();

      // Invalidate application status so Header re-fetches and shows "Go to App"
      invalidateApplicationStatus();

      setApplicationNumber(data.data.applicationNumber);
      setCurrentStep(3); // Success
    } catch (err: any) {
      setSubmitError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Save updated enrollment details
  const handleSaveUpdates = async () => {
    if (!user || !usedLinkData?.leadProfile?.id) return;

    setSaving(true);
    setSaveSuccess(false);
    setSubmitError(null);

    try {
      const firebaseUser = getCurrentUser();
      const idToken = await firebaseUser?.getIdToken();

      const res = await fetch('/api/enroll/update', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          leadProfileId: usedLinkData.leadProfile.id,
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
          casteCategory: formData.academic.casteCategory,
          targetExamYear: formData.academic.targetExamYear,
          schoolType: formData.academic.schoolType,
          parentPhone: formData.personal.parentPhone,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update');

      setSaveSuccess(true);
      setViewMode(true);
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  // Toggle onboarding step completion
  const handleToggleOnboardingStep = async (step: OnboardingStep) => {
    if (!user) return;
    setTogglingStep(step.id);
    try {
      const firebaseUser = (user.raw as any);
      const idToken = await firebaseUser?.getIdToken();
      const res = await fetch(`/api/enroll/onboarding-steps/${step.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ isCompleted: !step.isCompleted }),
      });
      const data = await res.json();
      if (res.ok && data.data) {
        setOnboardingSteps((prev) =>
          prev.map((s) =>
            s.id === step.id
              ? { ...s, isCompleted: data.data.isCompleted, completedAt: data.data.completedAt }
              : s
          )
        );
      }
    } catch {
      // Silent fail — not critical
    } finally {
      setTogglingStep(null);
    }
  };

  // Request link regeneration
  const handleRequestRegeneration = async () => {
    if (!token || !requestName) return;

    setRequestLoading(true);
    try {
      const res = await fetch('/api/enroll/request-regeneration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          studentName: requestName,
          studentEmail: requestEmail,
          studentPhone: requestPhone,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit request');
      }

      setRequestResult({
        ticketNumber: data.ticketNumber,
        message: data.message || 'Your request has been sent to the admin.',
      });
    } catch (err: any) {
      setRequestResult({
        ticketNumber: '',
        message: err.message || 'Something went wrong. Please try again.',
      });
    } finally {
      setRequestLoading(false);
    }
  };

  // Raise a support ticket
  const handleRaiseTicket = async () => {
    if (!requestName || !ticketDescription) return;

    setRequestLoading(true);
    try {
      const res = await fetch('/api/support-tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName: requestName,
          userEmail: requestEmail,
          userPhone: requestPhone,
          category: 'enrollment_issue',
          subject: `Enrollment Link Issue${token ? ` - Token: ${token.slice(0, 8)}...` : ''}`,
          description: ticketDescription,
          pageUrl: typeof window !== 'undefined' ? window.location.href : '',
          sourceApp: 'marketing',
          enrollmentLinkToken: token,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit ticket');
      }

      setTicketResult({ ticketNumber: data.ticketNumber });
    } catch (err: any) {
      setTicketResult({ ticketNumber: '' });
    } finally {
      setRequestLoading(false);
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
        <Alert severity="info" sx={{ mb: 3, textAlign: 'left' }}>
          The link may be incorrect or no longer available. You can raise a support ticket and our team will help you.
        </Alert>
        <Button
          variant="outlined"
          startIcon={<SupportAgent />}
          onClick={() => setShowTicketDialog(true)}
          sx={{ borderRadius: 1, textTransform: 'none', fontWeight: 600 }}
        >
          Raise a Ticket
        </Button>

        {/* Ticket Dialog */}
        <TicketDialog
          open={showTicketDialog}
          onClose={() => setShowTicketDialog(false)}
          requestName={requestName}
          setRequestName={setRequestName}
          requestEmail={requestEmail}
          setRequestEmail={setRequestEmail}
          requestPhone={requestPhone}
          setRequestPhone={setRequestPhone}
          ticketDescription={ticketDescription}
          setTicketDescription={setTicketDescription}
          onSubmit={handleRaiseTicket}
          loading={requestLoading}
          result={ticketResult}
        />
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
        <Alert severity="warning" sx={{ mb: 3, textAlign: 'left' }}>
          This enrollment link has expired. You can request a new link from your admin or raise a support ticket.
        </Alert>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, width: '100%' }}>
          <Button
            variant="contained"
            startIcon={<Refresh />}
            onClick={() => setShowRequestDialog(true)}
            sx={{ borderRadius: 1, fontWeight: 600, textTransform: 'none' }}
          >
            Request New Link
          </Button>
          <Button
            variant="outlined"
            startIcon={<SupportAgent />}
            onClick={() => setShowTicketDialog(true)}
            sx={{ borderRadius: 1, textTransform: 'none' }}
          >
            Raise a Ticket
          </Button>
        </Box>

        {/* Request New Link Dialog */}
        <RequestRegenerationDialog
          open={showRequestDialog}
          onClose={() => setShowRequestDialog(false)}
          requestName={requestName}
          setRequestName={setRequestName}
          requestEmail={requestEmail}
          setRequestEmail={setRequestEmail}
          requestPhone={requestPhone}
          setRequestPhone={setRequestPhone}
          onSubmit={handleRequestRegeneration}
          loading={requestLoading}
          result={requestResult}
        />

        {/* Ticket Dialog */}
        <TicketDialog
          open={showTicketDialog}
          onClose={() => setShowTicketDialog(false)}
          requestName={requestName}
          setRequestName={setRequestName}
          requestEmail={requestEmail}
          setRequestEmail={setRequestEmail}
          requestPhone={requestPhone}
          setRequestPhone={setRequestPhone}
          ticketDescription={ticketDescription}
          setTicketDescription={setTicketDescription}
          onSubmit={handleRaiseTicket}
          loading={requestLoading}
          result={ticketResult}
        />
      </Container>
    );
  }

  if (tokenStatus === 'used') {
    const isOwner = usedLinkData?.isOwner || (
      user && usedLinkData?.enrolledByFirebaseUid &&
      (user.raw as any)?.uid === usedLinkData.enrolledByFirebaseUid
    );

    // Owner viewing their enrollment — show form in view/edit mode
    if (isOwner && usedLinkData?.leadProfile) {
      const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.neramclasses.com';
      return (
        <Container maxWidth="md" sx={{ py: { xs: 2, md: 4 } }}>
          {/* Header with status */}
          <Paper
            elevation={0}
            sx={{
              p: { xs: 2, md: 3 },
              mb: 3,
              border: '1px solid',
              borderColor: 'success.light',
              borderRadius: 2,
              bgcolor: 'success.50',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <CheckCircleOutlined sx={{ fontSize: 32, color: 'success.main' }} />
                <Box>
                  <Typography variant="h6" fontWeight={700} color="success.dark">
                    Enrollment Complete
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Application: <strong>{usedLinkData.applicationNumber || '-'}</strong>
                    {usedLinkData.courseName && ` | ${usedLinkData.courseName}`}
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
                {viewMode ? (
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<EditIcon />}
                    onClick={() => setViewMode(false)}
                    sx={{ borderRadius: 1, textTransform: 'none', fontWeight: 600 }}
                  >
                    Edit Details
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => { setViewMode(true); setSaveSuccess(false); }}
                      sx={{ borderRadius: 1, textTransform: 'none' }}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="contained"
                      size="small"
                      startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                      onClick={handleSaveUpdates}
                      disabled={saving}
                      sx={{ borderRadius: 1, textTransform: 'none', fontWeight: 600 }}
                    >
                      {saving ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </>
                )}
              </Box>
            </Box>
          </Paper>

          {saveSuccess && (
            <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSaveSuccess(false)}>
              Your details have been updated successfully.
            </Alert>
          )}

          {submitError && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setSubmitError(null)}>
              {submitError}
            </Alert>
          )}

          {/* Stepper navigation for viewing */}
          {isMobile ? (
            <MobileStepper
              variant="progress"
              steps={2}
              position="static"
              activeStep={currentStep}
              sx={{ mb: 2, borderRadius: 1, bgcolor: 'grey.50' }}
              backButton={
                <Button size="small" onClick={handleBack} disabled={currentStep === 0}>
                  <KeyboardArrowLeft /> Back
                </Button>
              }
              nextButton={
                <Button size="small" onClick={handleNext} disabled={currentStep === 1}>
                  Next <KeyboardArrowRight />
                </Button>
              }
            />
          ) : (
            <Stepper activeStep={currentStep} sx={{ mb: 4 }}>
              {['Personal Details', 'Academic Details'].map((label, index) => (
                <Step
                  key={label}
                  completed={false}
                  sx={{ cursor: 'pointer' }}
                  onClick={() => {
                    setCurrentStep(index);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>
          )}

          {/* Form content — disabled in view mode via fieldset */}
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
            <fieldset
              disabled={viewMode}
              style={{ border: 'none', padding: 0, margin: 0, opacity: viewMode ? 0.85 : 1 }}
            >
              {currentStep === 0 && (
                <PersonalDetailsStep
                  personal={formData.personal}
                  location={formData.location}
                  updatePersonal={updatePersonalData}
                  updateLocation={updateLocationData}
                  phoneVerified={true}
                  onVerifyPhone={() => {}}
                />
              )}
              {currentStep === 1 && (
                <AcademicDetailsStep
                  academic={formData.academic}
                  updateAcademic={updateAcademicData}
                />
              )}
            </fieldset>
          </Paper>

          {/* Onboarding Steps */}
          {(onboardingSteps.length > 0 || onboardingLoading) && (
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
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="subtitle1" fontWeight={700}>
                  Complete Your Onboarding
                </Typography>
                {onboardingSteps.length > 0 && (
                  <Typography variant="body2" color="text.secondary">
                    {onboardingSteps.filter((s) => s.isCompleted).length} of {onboardingSteps.length} complete
                  </Typography>
                )}
              </Box>

              {onboardingSteps.length > 0 && (
                <LinearProgress
                  variant="determinate"
                  value={(onboardingSteps.filter((s) => s.isCompleted).length / onboardingSteps.length) * 100}
                  sx={{ mb: 2, borderRadius: 1, height: 6 }}
                />
              )}

              {onboardingLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {onboardingSteps.map((step) => (
                    <Paper
                      key={step.id}
                      variant="outlined"
                      sx={{
                        p: { xs: 1.5, md: 2 },
                        borderRadius: 1.5,
                        bgcolor: step.isCompleted ? 'success.50' : 'transparent',
                        borderColor: step.isCompleted ? 'success.light' : 'divider',
                        opacity: togglingStep === step.id ? 0.7 : 1,
                        transition: 'all 0.2s',
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                        <Checkbox
                          checked={step.isCompleted}
                          onChange={() => handleToggleOnboardingStep(step)}
                          disabled={togglingStep === step.id}
                          icon={<RadioButtonUnchecked />}
                          checkedIcon={<CheckCircle />}
                          sx={{ p: 0.5, mt: 0.25 }}
                        />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
                            {step.iconName && ONBOARDING_ICONS[step.iconName] && (
                              <Box sx={{ display: 'flex', fontSize: 20 }}>
                                {ONBOARDING_ICONS[step.iconName]}
                              </Box>
                            )}
                            <Typography
                              variant="body1"
                              fontWeight={600}
                              sx={{
                                textDecoration: step.isCompleted ? 'line-through' : 'none',
                                color: step.isCompleted ? 'text.secondary' : 'text.primary',
                              }}
                            >
                              {step.title}
                            </Typography>
                          </Box>
                          {step.description && (
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                              {step.description}
                            </Typography>
                          )}
                          {step.actionType === 'link' && !!(step.actionConfig?.url) && (
                            <Button
                              size="small"
                              variant="outlined"
                              href={step.actionConfig.url as string}
                              target="_blank"
                              rel="noopener noreferrer"
                              endIcon={<OpenInNew sx={{ fontSize: 14 }} />}
                              sx={{ borderRadius: 1, textTransform: 'none', fontSize: 12, py: 0.25 }}
                            >
                              Open
                            </Button>
                          )}
                          {step.actionType === 'in_app' && !!(step.actionConfig?.route) && (
                            <Button
                              size="small"
                              variant="outlined"
                              href={`${APP_URL}${step.actionConfig.route}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              endIcon={<OpenInNew sx={{ fontSize: 14 }} />}
                              sx={{ borderRadius: 1, textTransform: 'none', fontSize: 12, py: 0.25 }}
                            >
                              Go to Student App
                            </Button>
                          )}
                        </Box>
                      </Box>
                    </Paper>
                  ))}
                </Box>
              )}
            </Paper>
          )}

          {/* Navigation + Go to App */}
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
            <Box sx={{ display: 'flex', gap: 1 }}>
              {currentStep === 0 && (
                <Button
                  variant="outlined"
                  onClick={handleNext}
                  endIcon={<KeyboardArrowRight />}
                  sx={{ borderRadius: 1 }}
                >
                  Next
                </Button>
              )}
              <Button
                variant="contained"
                href={`/sso?redirect=${encodeURIComponent(APP_URL)}`}
                sx={{ borderRadius: 1, fontWeight: 600, textTransform: 'none' }}
              >
                Go to Student App
              </Button>
            </Box>
          </Box>
        </Container>
      );
    }

    // Owner but no lead profile data (fallback to success screen)
    if (isOwner && applicationNumber) {
      return (
        <SuccessScreen
          applicationNumber={applicationNumber}
          enrollmentSummary={usedLinkData ? {
            studentName: usedLinkData.studentName,
            courseName: usedLinkData.courseName || usedLinkData.interestCourse?.toUpperCase(),
            totalFee: usedLinkData.totalFee,
            amountPaid: usedLinkData.amountPaid,
            enrolledAt: usedLinkData.enrolledAt,
          } : undefined}
        />
      );
    }

    // Not logged in — prompt to sign in
    if (!user && !authLoading) {
      return (
        <Container maxWidth="sm" sx={{ py: 6, textAlign: 'center' }}>
          <CheckCircleOutlined sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
          <Typography variant="h5" fontWeight={700} gutterBottom>
            Enrollment Complete
          </Typography>
          <Typography color="text.secondary" mb={3}>
            This enrollment link has been used. Sign in with Google to view your enrollment details.
          </Typography>
          <Button
            variant="contained"
            size="large"
            onClick={signInWithGoogle}
            startIcon={<Google />}
            sx={{ py: 1.5, fontSize: '1rem', fontWeight: 600, borderRadius: 1, textTransform: 'none' }}
          >
            Sign in with Google
          </Button>
        </Container>
      );
    }

    // Logged in but not the owner, or no application number
    return (
      <Container maxWidth="sm" sx={{ py: 6, textAlign: 'center' }}>
        <CheckCircleOutlined sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
        <Typography variant="h5" fontWeight={700} gutterBottom>
          Already Enrolled
        </Typography>
        <Typography color="text.secondary" mb={3}>
          {user && usedLinkData?.enrolledByFirebaseUid && !isOwner
            ? 'This enrollment link was used by another student.'
            : 'This enrollment link has already been used.'}
        </Typography>
        <Button
          variant="contained"
          href={`/sso?redirect=${encodeURIComponent(process.env.NEXT_PUBLIC_APP_URL || 'https://app.neramclasses.com')}`}
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

      {/* Resume banner */}
      {isResuming && (
        <Alert
          severity="info"
          sx={{ mb: 2 }}
          action={
            <Button
              color="inherit"
              size="small"
              onClick={async () => {
                clearProgress();
                setCurrentStep(0);
                setFormData(DEFAULT_FORM_DATA);
                setPhoneVerified(false);
                setPhoneVerifiedAt(null);
                setVerifiedPhone(null);
                setTermsAccepted(false);
                dismissResume();
                try {
                  const { getFirebaseAuth } = await import('@neram/auth');
                  await getFirebaseAuth().signOut();
                } catch { /* ignore */ }
              }}
            >
              Start Fresh
            </Button>
          }
          onClose={dismissResume}
        >
          Resuming from Step {(restoredState?.currentStep ?? 0) + 1}: {STEP_LABELS[restoredState?.currentStep ?? 0]}. Your previous progress has been restored.
        </Alert>
      )}

      {/* Stepper */}
      {isMobile ? (
        <MobileStepper
          variant="progress"
          steps={3}
          position="static"
          activeStep={currentStep}
          sx={{ mb: 2, borderRadius: 1, bgcolor: 'grey.50' }}
          backButton={
            <Button size="small" onClick={handleBack} disabled={currentStep === 0}>
              <KeyboardArrowLeft /> Back
            </Button>
          }
          nextButton={null}
        />
      ) : (
        <Stepper activeStep={currentStep} sx={{ mb: 4 }}>
          {STEP_LABELS.map((label, index) => (
            <Step
              key={label}
              completed={index < currentStep}
              sx={{ cursor: index < currentStep ? 'pointer' : 'default' }}
              onClick={() => {
                if (index < currentStep) {
                  setCurrentStep(index);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }
              }}
            >
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
            phoneVerified={isPhoneCurrentlyVerified}
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
            phoneVerified={isPhoneCurrentlyVerified}
            termsAccepted={termsAccepted}
            setTermsAccepted={setTermsAccepted}
            onSubmit={handleSubmit}
            submitting={submitting}
          />
        )}
      </Paper>

      {/* Phone verification warning on Step 1 */}
      {currentStep === 0 && !isPhoneCurrentlyVerified && (
        <Alert severity="warning" sx={{ mb: 1 }}>
          Please verify your phone number before continuing.
        </Alert>
      )}

      {/* Navigation buttons */}
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
        {currentStep < 2 && (
          <Button
            variant="contained"
            onClick={handleNext}
            disabled={currentStep === 0 && !isPhoneCurrentlyVerified}
            endIcon={<KeyboardArrowRight />}
            sx={{ borderRadius: 1, fontWeight: 600 }}
          >
            Continue
          </Button>
        )}
      </Box>

      {/* Phone verification modal */}
      {showPhoneModal && (
        <LoginModal
          open={showPhoneModal}
          onClose={() => setShowPhoneModal(false)}
          phoneOnly
          apiBaseUrl=""
          initialPhone={(formData.personal.phone || linkData?.studentPhone || '').replace(/^\+91/, '')}
          onAuthenticated={(verifiedPhoneNumber) => {
            setPhoneVerified(true);
            setPhoneVerifiedAt(new Date().toISOString());
            setShowPhoneModal(false);
            if (verifiedPhoneNumber) {
              const fullPhone = verifiedPhoneNumber.startsWith('+') ? verifiedPhoneNumber : `+91${verifiedPhoneNumber}`;
              setVerifiedPhone(fullPhone);
              setFormData(prev => ({
                ...prev,
                personal: { ...prev.personal, phone: fullPhone },
              }));
            }
          }}
        />
      )}
    </Container>
  );
}

// ============================================
// REQUEST REGENERATION DIALOG
// ============================================

function RequestRegenerationDialog({
  open,
  onClose,
  requestName,
  setRequestName,
  requestEmail,
  setRequestEmail,
  requestPhone,
  setRequestPhone,
  onSubmit,
  loading,
  result,
}: {
  open: boolean;
  onClose: () => void;
  requestName: string;
  setRequestName: (v: string) => void;
  requestEmail: string;
  setRequestEmail: (v: string) => void;
  requestPhone: string;
  setRequestPhone: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
  result: { ticketNumber: string; message: string } | null;
}) {
  if (result) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
        <DialogTitle>Request Submitted</DialogTitle>
        <DialogContent>
          <Box sx={{ textAlign: 'center', py: 2 }}>
            <CheckCircleOutlined sx={{ fontSize: 48, color: 'success.main', mb: 2 }} />
            <Typography variant="body1" mb={1}>
              {result.message}
            </Typography>
            {result.ticketNumber && (
              <Typography variant="body2" color="text.secondary">
                Reference: <strong>{result.ticketNumber}</strong>
              </Typography>
            )}
            <Typography variant="body2" color="text.secondary" mt={2}>
              The admin will share a new link with you shortly via WhatsApp or email.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} sx={{ borderRadius: 1, textTransform: 'none' }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Request New Enrollment Link</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" mb={2}>
          Enter your details and we&apos;ll notify the admin to generate a new link for you.
        </Typography>
        <TextField
          label="Your Name"
          value={requestName}
          onChange={(e) => setRequestName(e.target.value)}
          fullWidth
          required
          size="small"
          sx={{ mb: 2 }}
        />
        <TextField
          label="Email"
          type="email"
          value={requestEmail}
          onChange={(e) => setRequestEmail(e.target.value)}
          fullWidth
          size="small"
          sx={{ mb: 2 }}
        />
        <TextField
          label="Phone Number"
          value={requestPhone}
          onChange={(e) => setRequestPhone(e.target.value)}
          fullWidth
          size="small"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading} sx={{ textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          onClick={onSubmit}
          variant="contained"
          disabled={!requestName || loading}
          sx={{ borderRadius: 1, textTransform: 'none', fontWeight: 600 }}
        >
          {loading ? <CircularProgress size={20} /> : 'Submit Request'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ============================================
// TICKET DIALOG
// ============================================

function TicketDialog({
  open,
  onClose,
  requestName,
  setRequestName,
  requestEmail,
  setRequestEmail,
  requestPhone,
  setRequestPhone,
  ticketDescription,
  setTicketDescription,
  onSubmit,
  loading,
  result,
}: {
  open: boolean;
  onClose: () => void;
  requestName: string;
  setRequestName: (v: string) => void;
  requestEmail: string;
  setRequestEmail: (v: string) => void;
  requestPhone: string;
  setRequestPhone: (v: string) => void;
  ticketDescription: string;
  setTicketDescription: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
  result: { ticketNumber: string } | null;
}) {
  if (result?.ticketNumber) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
        <DialogTitle>Ticket Submitted</DialogTitle>
        <DialogContent>
          <Box sx={{ textAlign: 'center', py: 2 }}>
            <CheckCircleOutlined sx={{ fontSize: 48, color: 'success.main', mb: 2 }} />
            <Typography variant="body1" mb={1}>
              Your support ticket has been created.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Ticket ID: <strong>{result.ticketNumber}</strong>
            </Typography>
            <Typography variant="body2" color="text.secondary" mt={2}>
              We&apos;ll get back to you as soon as possible.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} sx={{ borderRadius: 1, textTransform: 'none' }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Raise a Support Ticket</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" mb={2}>
          Describe the issue you&apos;re facing and our team will help you.
        </Typography>
        <TextField
          label="Your Name"
          value={requestName}
          onChange={(e) => setRequestName(e.target.value)}
          fullWidth
          required
          size="small"
          sx={{ mb: 2 }}
        />
        <TextField
          label="Email"
          type="email"
          value={requestEmail}
          onChange={(e) => setRequestEmail(e.target.value)}
          fullWidth
          size="small"
          sx={{ mb: 2 }}
        />
        <TextField
          label="Phone Number"
          value={requestPhone}
          onChange={(e) => setRequestPhone(e.target.value)}
          fullWidth
          size="small"
          sx={{ mb: 2 }}
        />
        <TextField
          label="Describe the issue"
          value={ticketDescription}
          onChange={(e) => setTicketDescription(e.target.value)}
          fullWidth
          required
          multiline
          rows={4}
          size="small"
          placeholder="What happened? What were you trying to do?"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading} sx={{ textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          onClick={onSubmit}
          variant="contained"
          disabled={!requestName || !ticketDescription || loading}
          sx={{ borderRadius: 1, textTransform: 'none', fontWeight: 600 }}
        >
          {loading ? <CircularProgress size={20} /> : 'Submit Ticket'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

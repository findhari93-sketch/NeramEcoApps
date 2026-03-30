'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Stepper,
  Step,
  StepLabel,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
} from '@neram/ui';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import GraphAvatar from '@/components/GraphAvatar';
import WelcomeStep from '@/components/onboarding/WelcomeStep';
import DocumentsStep from '@/components/onboarding/DocumentsStep';
import StudentInfoStep from '@/components/onboarding/StudentInfoStep';
import ExamStatusStep from '@/components/onboarding/ExamStatusStep';
import DeviceSetupStep from '@/components/onboarding/DeviceSetupStep';
import PendingReviewStep from '@/components/onboarding/PendingReviewStep';
import type { OnboardingStep as OnboardingStepType } from '@neram/database/types';

const STEP_ORDER: OnboardingStepType[] = [
  'welcome',
  'documents',
  'student_info',
  'exam_status',
  'device_setup',
  'pending_review',
];

const STEP_LABELS = [
  'Welcome',
  'Documents',
  'Your Info',
  'Exams',
  'Device',
  'Review',
];

interface OnboardingData {
  current_standard?: string;
  academic_year?: string;
  exam_plans?: { exam_type: string; state: string; application_number?: string }[];
}

export default function OnboardingPage() {
  const { user, getToken, refreshOnboardingStatus, onboardingStatus, signOut, activeClassroom } =
    useNexusAuthContext();

  const [currentStep, setCurrentStep] = useState<OnboardingStepType>('welcome');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onboardingData, setOnboardingData] = useState<OnboardingData>({});
  const [requiredTemplates, setRequiredTemplates] = useState<any[]>([]);
  const [uploadedDocs, setUploadedDocs] = useState<any[]>([]);

  // Should we show exam step? Only for 12th current year / gap_year
  const showExamStep =
    onboardingData.current_standard === '12th' || onboardingData.current_standard === 'gap_year';

  // Determine current academic year auto-suggestion
  const currentMonth = new Date().getMonth(); // 0-indexed
  const currentYear = new Date().getFullYear();
  // Academic year runs June-June. If before June, suggest previous year range
  const suggestedAcademicYear =
    currentMonth < 5
      ? `${currentYear - 1}-${String(currentYear).slice(2)}`
      : `${currentYear}-${String(currentYear + 1).slice(2)}`;

  // Fetch onboarding status
  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(
        `/api/onboarding`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!res.ok) throw new Error('Failed to load onboarding status');
      const data = await res.json();

      if (data.onboarding) {
        setCurrentStep(data.onboarding.current_step);
        setOnboardingData({
          current_standard: data.onboarding.current_standard || undefined,
          academic_year: data.onboarding.academic_year || undefined,
        });

        // If rejected, show documents step with error
        if (data.onboarding.status === 'rejected') {
          setCurrentStep('documents');
          setError(`Documents rejected: ${data.onboarding.rejection_reason || 'Please re-upload.'}`);
        }
      }

      setRequiredTemplates(data.requiredTemplates || []);
      setUploadedDocs(data.uploadedDocs || []);
    } catch (err) {
      console.error('Onboarding fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Navigate to next step
  const goToStep = useCallback(
    async (step: OnboardingStepType, extraData?: Record<string, unknown>) => {
      try {
        const token = await getToken();
        if (!token) return;

        const body: Record<string, unknown> = {
          action: step === 'pending_review' ? 'submit' : 'update_step',
          step,
        };

        if (extraData) Object.assign(body, extraData);

        // If this is the first step, start the onboarding first
        if (currentStep === 'welcome' && step !== 'welcome') {
          await fetch('/api/onboarding', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'start' }),
          });
        }

        const res = await fetch('/api/onboarding', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to update step');
        }

        setCurrentStep(step);
        setError(null);

        // On submission: auto-open Teams chat with reviewers
        if (step === 'pending_review') {
          const reviewerEmails = [
            'TamilSelvan@neramclasses.com',
            'Haribabu@nerasmclasses.onmicrosoft.com',
            'sudarshini@neramclasses.com',
            'Shanthimano@nerasmclasses.onmicrosoft.com',
          ].join(',');
          const msg = encodeURIComponent(
            `Hi, I'm ${user?.name || 'a student'}. I've completed my onboarding and uploaded my identity documents. Please review and approve my access to Nexus.`
          );
          window.open(
            `https://teams.microsoft.com/l/chat/0/0?users=${reviewerEmails}&message=${msg}`,
            '_blank'
          );
        }

        // Store data locally
        if (extraData?.current_standard) {
          setOnboardingData((prev) => ({
            ...prev,
            current_standard: extraData.current_standard as string,
            academic_year: extraData.academic_year as string,
          }));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
      }
    },
    [getToken, currentStep]
  );

  // Get visible step index (skip exam_status if not applicable)
  const getVisibleSteps = () => {
    if (showExamStep) return STEP_ORDER;
    return STEP_ORDER.filter((s) => s !== 'exam_status');
  };

  const getVisibleLabels = () => {
    if (showExamStep) return STEP_LABELS;
    return STEP_LABELS.filter((_, i) => STEP_ORDER[i] !== 'exam_status');
  };

  const visibleSteps = getVisibleSteps();
  const visibleLabels = getVisibleLabels();
  const activeStepIndex = visibleSteps.indexOf(currentStep);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      {/* Header with logo */}
      <Box sx={{ textAlign: 'center', mb: 1 }}>
        <Typography
          variant="h5"
          sx={{ fontWeight: 700, color: 'primary.main', letterSpacing: '-0.02em' }}
        >
          Nexus
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Student Onboarding
        </Typography>
      </Box>

      {/* Logged-in user identity bar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          mb: 2,
          px: 2,
          py: 1,
          borderRadius: 2,
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <GraphAvatar self name={user?.name} size={36} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              lineHeight: 1.3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {user?.name || 'Student'}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {user?.email || ''}
          </Typography>
        </Box>
        <Tooltip title="Sign out & switch account">
          <IconButton
            onClick={signOut}
            size="small"
            sx={{
              color: 'text.secondary',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1.5,
              px: 1,
              '&:hover': { color: 'error.main', borderColor: 'error.light', bgcolor: 'error.50' },
            }}
            aria-label="Sign out and switch account"
          >
            <SwapHorizIcon sx={{ fontSize: '1.1rem' }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Stepper — compact on mobile */}
      {currentStep !== 'pending_review' && (
        <Stepper
          activeStep={activeStepIndex}
          alternativeLabel
          sx={{
            mb: 3,
            '& .MuiStepLabel-label': {
              fontSize: { xs: '0.65rem', sm: '0.75rem' },
              mt: 0.5,
            },
            '& .MuiStepIcon-root': {
              width: { xs: 24, sm: 28 },
              height: { xs: 24, sm: 28 },
            },
          }}
        >
          {visibleLabels.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
      )}

      {/* Error alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Step content */}
      <Box sx={{ flex: 1 }}>
        {currentStep === 'welcome' && (
          <WelcomeStep
            userName={user?.name || ''}
            onNext={() => goToStep('documents')}
          />
        )}

        {currentStep === 'documents' && (
          <DocumentsStep
            templates={requiredTemplates}
            uploadedDocs={uploadedDocs}
            classroomId={activeClassroom?.id}
            getToken={getToken}
            onNext={() => goToStep('student_info')}
            onDocsChange={(docs) => setUploadedDocs(docs)}
          />
        )}

        {currentStep === 'student_info' && (
          <StudentInfoStep
            suggestedAcademicYear={suggestedAcademicYear}
            initialStandard={onboardingData.current_standard}
            initialYear={onboardingData.academic_year}
            onNext={(standard, year) =>
              goToStep(
                standard === '12th' || standard === 'gap_year' ? 'exam_status' : 'device_setup',
                { current_standard: standard, academic_year: year }
              )
            }
            onBack={() => setCurrentStep('documents')}
          />
        )}

        {currentStep === 'exam_status' && (
          <ExamStatusStep
            getToken={getToken}
            onNext={() => goToStep('device_setup')}
            onBack={() => setCurrentStep('student_info')}
          />
        )}

        {currentStep === 'device_setup' && (
          <DeviceSetupStep
            onNext={() => goToStep('pending_review')}
            onBack={() =>
              setCurrentStep(showExamStep ? 'exam_status' : 'student_info')
            }
          />
        )}

        {currentStep === 'pending_review' && (
          <PendingReviewStep
            getToken={getToken}
            onboardingStatus={onboardingStatus}
            onApproved={() => refreshOnboardingStatus()}
          />
        )}
      </Box>
    </Box>
  );
}

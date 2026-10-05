'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Skeleton, Snackbar, Typography } from '@neram/ui';
import KeyboardArrowLeft from '@mui/icons-material/KeyboardArrowLeft';
import KeyboardArrowRight from '@mui/icons-material/KeyboardArrowRight';
import { LoginModal } from '@neram/ui';
import { useFirebaseAuth } from '@neram/auth';
import { useTranslations } from 'next-intl';
import { useFormContext } from './FormContext';
import type { ApplicationFormData, FormStep } from './types';
import StepShell from './StepShell';
import EntryChoices from './EntryChoices';
import ApplicationDashboard from './ApplicationDashboard';
import AboutYouStep from './steps/AboutYouStep';
import YourCourseStep from './steps/YourCourseStep';
import ReviewStep from './steps/ReviewStep';
import PayAndEnrolStep from './steps/PayAndEnrolStep';
import { trackTaxonomyEvent } from '@/lib/funnel-tracker';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3011';

function fireSignupConversion(transactionId: string | undefined, formData: ApplicationFormData) {
  if (typeof window === 'undefined' || !(window as any).gtag) return;
  const adsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
  const signupLabel = process.env.NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL;
  if (!adsId || !signupLabel) return;
  (window as any).gtag('event', 'conversion', {
    send_to: `${adsId}/${signupLabel}`,
    transaction_id: transactionId,
    utm_source: formData.utmSource || undefined,
    utm_medium: formData.utmMedium || undefined,
    utm_campaign: formData.utmCampaign || undefined,
    gclid: formData.gclid || undefined,
    wbraid: formData.wbraid || undefined,
  });
}

/**
 * The four steps. Step 0 opens with the entry choices for a new visitor and
 * with a welcome line for a signed-in one; Review writes the application and
 * moves to Pay; Pay renders the payment panel and has no Continue of its own.
 */
export default function ApplyFlow() {
  const t = useTranslations('apply');
  const { user } = useFirebaseAuth();
  const {
    formData,
    activeStep,
    setActiveStep,
    goToNextStep,
    goToPreviousStep,
    validateStep,
    showPhoneVerification,
    setShowPhoneVerification,
    onPhoneVerified,
    isSubmitting,
    submissionError,
    setSubmissionError,
    saveDraftToDb,
    isSavingDraft,
    isAuthenticated,
    isAuthLoading,
    isReturningUser,
    returnUserMode,
    returningUserCheckComplete,
    submitApplication,
    markApplicationStarted,
    prefilledFields,
  } = useFormContext();

  const [entryChosen, setEntryChosen] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const [saveSnackbar, setSaveSnackbar] = useState<{ open: boolean; success: boolean }>({ open: false, success: false });
  const autoPromptedRef = useRef(false);

  const currentValidation = validateStep(activeStep);
  const showEntryChoices = activeStep === 0 && !isAuthenticated && !entryChosen;

  // A signed-in user whose phone is not verified is asked once, after the form renders.
  useEffect(() => {
    if (
      isAuthenticated &&
      returningUserCheckComplete &&
      activeStep === 0 &&
      !formData.personal.phoneVerified &&
      !autoPromptedRef.current
    ) {
      autoPromptedRef.current = true;
      const timer = setTimeout(() => setShowPhoneVerification(true), 500);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, returningUserCheckComplete, activeStep, formData.personal.phoneVerified, setShowPhoneVerification]);

  const handleContinue = async () => {
    if (activeStep === 0 && !formData.personal.phoneVerified) {
      setShowPhoneVerification(true);
      return;
    }
    if (!currentValidation.isValid) {
      setShowValidationErrors(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setShowValidationErrors(false);

    if (activeStep === 2) {
      trackTaxonomyEvent('application_reviewed');
      const result = await submitApplication();
      if (!result.ok) return;
      trackTaxonomyEvent('application_completed', { application_id: result.id, edited: returnUserMode === 'edit' });
      fireSignupConversion(result.id, formData);
      setActiveStep(3);
      return;
    }

    if (isAuthenticated) {
      try {
        const saved = await saveDraftToDb(activeStep);
        setSaveSnackbar({ open: true, success: saved });
      } catch {
        setSaveSnackbar({ open: true, success: false });
      }
    }
    trackTaxonomyEvent('application_step_completed', { step: activeStep });
    goToNextStep();
  };

  if (isAuthLoading || (isAuthenticated && !returningUserCheckComplete)) {
    return (
      <StepShell step={0}>
        <Skeleton variant="text" width="60%" height={40} sx={{ mb: 1 }} />
        <Skeleton variant="text" width="80%" height={24} sx={{ mb: 3 }} />
        <Skeleton variant="rectangular" height={56} sx={{ borderRadius: 1, mb: 2 }} />
        <Skeleton variant="rectangular" height={56} sx={{ borderRadius: 1, mb: 2 }} />
        <Skeleton variant="rectangular" height={48} sx={{ borderRadius: 1 }} />
      </StepShell>
    );
  }

  if (isReturningUser && returnUserMode === 'dashboard') {
    return (
      <StepShell step={0}>
        <ApplicationDashboard />
      </StepShell>
    );
  }

  const firstName = formData.personal.firstName || user?.name?.split(' ')[0] || '';
  const welcomeLine =
    isAuthenticated && activeStep === 0 && prefilledFields.size > 0
      ? firstName
        ? t('aboutYou.welcomeBack', { name: firstName })
        : t('aboutYou.welcomeBackGeneric')
      : null;

  // No action bar while choosing how to start (the cards are the action) or on the pay step (the panel has its own button).
  const actions =
    activeStep === 3 || showEntryChoices ? undefined : (
      <>
        <Button
          variant="outlined"
          onClick={goToPreviousStep}
          disabled={activeStep === 0 || isSubmitting || isSavingDraft}
          startIcon={<KeyboardArrowLeft />}
          sx={{ minHeight: 48, flex: { xs: 1, sm: 'unset' } }}
        >
          {t('actions.back')}
        </Button>
        <Button
          variant="contained"
          onClick={handleContinue}
          disabled={isSubmitting || isSavingDraft}
          endIcon={isSubmitting || isSavingDraft ? <CircularProgress size={16} color="inherit" /> : <KeyboardArrowRight />}
          sx={{ minHeight: 48, flex: { xs: 2, sm: 'unset' }, minWidth: { sm: 220 } }}
        >
          {isSavingDraft
            ? t('actions.saving')
            : isSubmitting
            ? t('actions.submitting')
            : activeStep === 2
            ? returnUserMode === 'edit'
              ? t('actions.updateApplication')
              : t('actions.continueToPayment')
            : t('actions.continue')}
        </Button>
      </>
    );

  return (
    <>
      <StepShell step={activeStep} actions={actions}>
        {welcomeLine && (
          <Alert severity="success" icon={false} sx={{ mb: 2 }}>
            {welcomeLine}
          </Alert>
        )}

        {submissionError && (
          <Alert severity="error" role="alert" sx={{ mb: 2 }} onClose={() => setSubmissionError(null)}>
            {submissionError.startsWith('errors.') ? t(submissionError) : submissionError}
          </Alert>
        )}

        {showValidationErrors && !currentValidation.isValid && (
          <Alert severity="warning" role="alert" sx={{ mb: 2 }}>
            <Typography variant="body2" fontWeight={600}>
              {t('errors.heading')}
            </Typography>
            <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
              {currentValidation.errors.map((err) => (
                <li key={err.field}>{t(err.message)}</li>
              ))}
            </ul>
          </Alert>
        )}

        {showEntryChoices && (
          <>
            <Typography variant="h5" component="h1" gutterBottom fontWeight={700}>
              {t('aboutYou.title')}
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              {t('aboutYou.subtitle')}
            </Typography>
            <EntryChoices
              onManual={() => {
                markApplicationStarted();
                trackTaxonomyEvent('manual_entry_started');
                setEntryChosen(true);
              }}
              onSignIn={() => setShowLoginModal(true)}
            />
          </>
        )}

        {!showEntryChoices && activeStep === 0 && <AboutYouStep />}
        {activeStep === 1 && <YourCourseStep />}
        {activeStep === 2 && <ReviewStep onEditStep={(step) => setActiveStep(step as FormStep)} />}
        {activeStep === 3 && <PayAndEnrolStep />}
      </StepShell>

      <LoginModal
        open={showPhoneVerification}
        onClose={() => setShowPhoneVerification(false)}
        allowClose={false}
        initialPhone={formData.personal.phone}
        onAuthenticated={async (verifiedPhone) => {
          setShowPhoneVerification(false);
          let phone = verifiedPhone || '';
          if (!phone) {
            const { getFirebaseAuth } = await import('@neram/auth');
            phone = getFirebaseAuth().currentUser?.phoneNumber || user?.phone || formData.personal.phone || '';
          }
          onPhoneVerified(phone);
        }}
        apiBaseUrl={APP_URL}
        phoneOnly={true}
      />

      <LoginModal
        open={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        allowClose={true}
        onAuthenticated={() => {
          setShowLoginModal(false);
          setEntryChosen(true);
          markApplicationStarted();
        }}
        apiBaseUrl={APP_URL}
      />

      <Snackbar
        open={saveSnackbar.open}
        autoHideDuration={2000}
        onClose={() => setSaveSnackbar((prev) => ({ ...prev, open: false }))}
        message={saveSnackbar.success ? t('actions.saved') : t('actions.saveFailed')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </>
  );
}

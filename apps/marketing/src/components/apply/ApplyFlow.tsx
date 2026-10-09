'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Skeleton, Snackbar, Typography } from '@neram/ui';
import { LoginModal } from '@neram/ui';
import { useFirebaseAuth } from '@neram/auth';
import { useTranslations } from 'next-intl';
import { useFormContext } from './FormContext';
import type { ApplicationFormData, FormStep } from './types';
import StepShell, { type StepActions } from './StepShell';
import { useShellLogin } from './shell/ShellActionsContext';
import ApplicationDashboard from './ApplicationDashboard';
import AboutYouStep from './steps/AboutYouStep';
import YourCourseStep from './steps/YourCourseStep';
import ReviewStep from './steps/ReviewStep';
import PayAndEnrolStep from './steps/PayAndEnrolStep';
import { trackTaxonomyEvent } from '@/lib/funnel-tracker';
import { ensureAccount } from '@/lib/ensure-account';
import { getCountryConfig } from './countryConfig';
import { DemoExitIntent, DemoNotSureLink } from './DemoNudge';

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
 * The four steps. Step 0 opens with the Google card and the five fields for a
 * new visitor and with a welcome line for a signed-in one; Review asks the
 * remaining personal details, writes the application and moves to Pay; Pay
 * renders the payment panel and has no Continue of its own.
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
    isReturningAccount,
    refreshAccount,
  } = useFormContext();

  const [showLoginModal, setShowLoginModal] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const [saveSnackbar, setSaveSnackbar] = useState<{ open: boolean; success: boolean }>({ open: false, success: false });
  const autoPromptedRef = useRef(false);

  const currentValidation = validateStep(activeStep);

  // The shell header shows Log in until the visitor is signed in.
  const openLogin = useCallback(() => setShowLoginModal(true), []);
  useShellLogin(isAuthenticated ? null : openLogin);

  const country = getCountryConfig(formData.personal.phoneCountry);

  // A signed-in user whose phone is not verified is asked once, after the
  // account has loaded (so a verified one is never asked) and never while the
  // sign-in dialog is still running its own steps.
  useEffect(() => {
    if (
      isAuthenticated &&
      returningUserCheckComplete &&
      !showLoginModal &&
      !googleBusy &&
      activeStep === 0 &&
      !formData.personal.phoneVerified &&
      !autoPromptedRef.current
    ) {
      autoPromptedRef.current = true;
      setShowPhoneVerification(true);
    }
  }, [isAuthenticated, returningUserCheckComplete, showLoginModal, googleBusy, activeStep, formData.personal.phoneVerified, setShowPhoneVerification]);

  // Signed out again: the next sign-in may ask again.
  useEffect(() => {
    if (!isAuthenticated) autoPromptedRef.current = false;
  }, [isAuthenticated]);

  // The account turned out to be verified already: no dialog to dismiss.
  useEffect(() => {
    if (formData.personal.phoneVerified && showPhoneVerification) setShowPhoneVerification(false);
  }, [formData.personal.phoneVerified, showPhoneVerification, setShowPhoneVerification]);

  /**
   * "Continue with Google" on the form: straight to Google, no second dialog.
   * Then the phone OTP at once if the account has no verified number, and the
   * form fills itself from the account (FormContext).
   */
  const handleGoogleCard = async () => {
    setGoogleError(null);
    setGoogleBusy(true);
    try {
      const { signInWithGoogleOrRedirect } = await import('@neram/auth');
      const signedIn = await signInWithGoogleOrRedirect();
      if (!signedIn) return; // closed the popup, or redirecting to Google
      markApplicationStarted();
      autoPromptedRef.current = true;
      const account = await ensureAccount();
      if (!account?.phone_verified) setShowPhoneVerification(true);
    } catch {
      setGoogleError(t('aboutYou.googleFailed'));
    } finally {
      setGoogleBusy(false);
    }
  };

  /** Continue asked for the phone first: carry on by itself once it is verified. */
  const continueAfterVerifyRef = useRef(false);

  const handleContinue = async () => {
    if (activeStep === 0 && !formData.personal.phoneVerified) {
      continueAfterVerifyRef.current = true;
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

  useEffect(() => {
    if (
      continueAfterVerifyRef.current &&
      formData.personal.phoneVerified &&
      returningUserCheckComplete &&
      !showPhoneVerification &&
      activeStep === 0 &&
      !(isReturningUser && returnUserMode === 'dashboard')
    ) {
      continueAfterVerifyRef.current = false;
      handleContinue();
    }
  });

  const loadingAccount = isAuthLoading || (isAuthenticated && !returningUserCheckComplete);
  const showDashboard = !loadingAccount && isReturningUser && returnUserMode === 'dashboard';

  const firstName = (formData.personal.firstName || user?.name || '').trim().split(/\s+/)[0] || '';
  const welcomeLine =
    isAuthenticated && activeStep === 0 && isReturningAccount
      ? firstName
        ? t('aboutYou.welcomeBack', { name: firstName })
        : t('aboutYou.welcomeBackGeneric')
      : null;

  // No action block on the pay step: the payment panel has its own button.
  const busy = isSubmitting || isSavingDraft;
  const primaryLabel = isSavingDraft
    ? t('actions.saving')
    : isSubmitting
    ? t('actions.submitting')
    : activeStep === 2
    ? returnUserMode === 'edit'
      ? t('actions.updateApplication')
      : t('actions.continueToPayment')
    : activeStep === 1
    ? t('actions.reviewApplication')
    : t('actions.continueToCourse');
  const note = activeStep === 0 ? t('actions.noPaymentYet') : activeStep === 1 ? t('actions.nextReview') : t('actions.nextPayment');
  const actions: StepActions | undefined =
    activeStep === 3
      ? undefined
      : {
          primaryLabel,
          onPrimary: handleContinue,
          busy,
          onBack: activeStep === 0 ? undefined : goToPreviousStep,
          backDisabled: busy,
          note,
        };

  // The two dialogs stay mounted while the account loads: unmounting them
  // mid sign-in used to drop the student back to the first dialog step.
  return (
    <>
      {loadingAccount ? (
        <StepShell step={0}>
          <Skeleton variant="text" width="60%" height={40} sx={{ mb: 1 }} />
          <Skeleton variant="text" width="80%" height={24} sx={{ mb: 3 }} />
          <Skeleton variant="rectangular" height={56} sx={{ borderRadius: 1, mb: 2 }} />
          <Skeleton variant="rectangular" height={56} sx={{ borderRadius: 1, mb: 2 }} />
          <Skeleton variant="rectangular" height={48} sx={{ borderRadius: 1 }} />
        </StepShell>
      ) : showDashboard ? (
        <StepShell step={0}>
          <ApplicationDashboard />
        </StepShell>
      ) : (
        <StepShell
          step={activeStep}
          actions={actions}
          onStepClick={(step) => setActiveStep(step)}
          aside={
            (activeStep === 1 || activeStep === 2) && returnUserMode !== 'edit' ? (
              <DemoNotSureLink step={activeStep} />
            ) : undefined
          }
        >
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

          {activeStep === 0 && (
            <AboutYouStep
              onSignIn={isAuthenticated ? undefined : handleGoogleCard}
              signInBusy={googleBusy}
              signInError={googleError}
            />
          )}
          {activeStep === 1 && <YourCourseStep />}
          {activeStep === 2 && <ReviewStep onEditStep={(step) => setActiveStep(step as FormStep)} />}
          {activeStep === 3 && <PayAndEnrolStep />}
        </StepShell>
      )}

      {/* Desktop only, once per session: a free demo for a student about to leave unsure. */}
      <DemoExitIntent
        step={activeStep}
        enabled={
          !loadingAccount &&
          !showDashboard &&
          activeStep <= 2 &&
          returnUserMode !== 'edit' &&
          !showLoginModal &&
          !showPhoneVerification &&
          (activeStep >= 1 || !!formData.personal.firstName.trim())
        }
      />

      {/* Phone verification. Closable: Continue still needs a verified number, so closing never skips it. */}
      <LoginModal
        open={showPhoneVerification}
        onClose={() => {
          continueAfterVerifyRef.current = false;
          setShowPhoneVerification(false);
        }}
        allowClose={true}
        allowEscapeHatch
        requireEmailVerification
        initialPhone={formData.personal.phone}
        dialCode={country.phonePrefix}
        phoneLength={country.phoneLength}
        onAuthenticated={(verifiedPhone) => {
          setShowPhoneVerification(false);
          // No number back means the account was already verified: re-read it.
          if (verifiedPhone) onPhoneVerified(verifiedPhone);
          else refreshAccount();
        }}
        apiBaseUrl={APP_URL}
        phoneOnly={true}
      />

      {/* Header "Log in": Google, or email and password (with sign up). */}
      <LoginModal
        open={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        allowClose={true}
        allowEscapeHatch
        requireEmailVerification
        dialCode={country.phonePrefix}
        phoneLength={country.phoneLength}
        onAuthenticated={(verifiedPhone) => {
          setShowLoginModal(false);
          autoPromptedRef.current = true;
          markApplicationStarted();
          if (verifiedPhone) onPhoneVerified(verifiedPhone);
          else refreshAccount();
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

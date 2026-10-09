'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  CircularProgress,
  Divider,
  Slide,
  IconButton,
  Portal,
  Collapse,
} from '@mui/material';
import { useMediaQuery, useTheme } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import React from 'react';
import type { TransitionProps } from '@mui/material/transitions';
import { ConnectToOffice } from '../ChatWidget/ConnectToOffice';

/**
 * Where this visitor came from, for a cross-origin sign-up (the app cannot read
 * the marketing site's cookies from this request). The server validates the
 * anonymous id and keeps only known attribution keys, so the raw values are
 * sent as they are. Never throws.
 */
function signupOriginFields(): { anonymous_id?: string; first_touch?: unknown } {
  if (typeof document === 'undefined') return {};
  const out: { anonymous_id?: string; first_touch?: unknown } = {};
  try {
    for (const part of document.cookie.split(';')) {
      const [rawName, ...rest] = part.split('=');
      const name = rawName.trim();
      const value = decodeURIComponent(rest.join('=').trim());
      if (name === 'neram_anon_id' && value) out.anonymous_id = value;
      if (name === 'neram_attribution' && value) out.first_touch = JSON.parse(value);
    }
  } catch {
    // An unreadable cookie only means no first touch is recorded.
  }
  return out;
}

/**
 * Google Ads "Sign-up (1)": a sign-up with a verified phone, the account's one
 * primary conversion. Fired here because every OTP flow, in the app and on the
 * marketing site, ends in this modal. The label is set on production only, so
 * staging never counts. transaction_id is our user id (never the phone), and
 * stops a retry counting the same student twice. Never throws.
 */
export function firePhoneVerifiedConversion(userId: string | undefined) {
  const adsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
  const label = process.env.NEXT_PUBLIC_GOOGLE_ADS_PHONE_VERIFIED_LABEL;
  const gtag = typeof window !== 'undefined' ? (window as any).gtag : undefined;
  if (!adsId || !label || typeof gtag !== 'function') return;
  try {
    gtag('event', 'conversion', { send_to: `${adsId}/${label}`, transaction_id: userId });
  } catch {
    // Tracking never blocks sign-in.
  }
}

// ============================================
// TYPES
// ============================================

export interface FunnelEventData {
  funnel: 'auth' | 'onboarding' | 'application';
  event: string;
  status: 'started' | 'completed' | 'failed' | 'skipped';
  error_message?: string;
  error_code?: string;
  metadata?: Record<string, unknown>;
}

export interface LoginModalProps {
  open: boolean;
  onClose?: () => void;
  /** Can user dismiss the modal? Default: true */
  allowClose?: boolean;
  /** Called after login + phone verification complete. Passes verified phone number if available. */
  onAuthenticated?: (phoneNumber?: string) => void;
  /** Base URL for API calls. Empty string for same-origin, full URL for cross-origin */
  apiBaseUrl: string;
  /** Skip phone verification step (for already-verified users) */
  skipPhoneVerification?: boolean;
  /** Start directly at phone verification step */
  phoneOnly?: boolean;
  /** Pre-fill the phone number input */
  initialPhone?: string;
  /** Optional callback for funnel event tracking */
  onFunnelEvent?: (event: FunnelEventData) => void;
  /** Show "Get help" + "Skip for now" affordances after repeated failures. Default: false */
  allowEscapeHatch?: boolean;
  /** Number of failed OTP/reCAPTCHA attempts before the escape hatch appears. Default: 2 */
  maxAttemptsBeforeEscape?: number;
  /** Called when the user chooses "Skip for now" (only meaningful with allowEscapeHatch). */
  onSkip?: () => void;
  /** Called when the user opens the "Get help" panel (analytics hook). Setting it alone shows "Get help" after repeated failures. */
  onGetHelp?: () => void;
  /**
   * Email/password accounts must click the verification link before going on
   * to phone verification: the dialog waits on a "Check your inbox" step that
   * notices the click by itself. Default: false.
   */
  requireEmailVerification?: boolean;
  /** Country dialling code for the phone step. Default: '+91'. */
  dialCode?: string;
  /** Digits in a national mobile number for `dialCode`. Default: 10. */
  phoneLength?: number;
}

type ModalStep = 'login' | 'verifyEmail' | 'phone' | 'otp' | 'phoneInUse';

/** How often the "Check your inbox" step asks Firebase whether the link was clicked. */
const EMAIL_POLL_MS = 4000;

// ============================================
// SLIDE TRANSITION
// ============================================

const SlideTransition = React.forwardRef(function Transition(
  props: TransitionProps & { children: React.ReactElement },
  ref: React.Ref<unknown>
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

// ============================================
// FIREBASE ERROR MESSAGES
// ============================================

function getFirebaseErrorMessage(error: any): string {
  const code = error?.code || '';
  switch (code) {
    case 'auth/invalid-phone-number':
      return 'Invalid phone number format. Please check and try again.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a few minutes and try again.';
    case 'auth/quota-exceeded':
      return 'SMS quota exceeded. Please try again later.';
    case 'auth/invalid-verification-code':
      return 'Invalid OTP. Please check the code and try again.';
    case 'auth/code-expired':
      return 'OTP has expired. Please request a new one.';
    case 'auth/missing-verification-code':
      return 'Please enter the OTP.';
    case 'auth/credential-already-in-use':
      return 'This phone number is already linked to another account.';
    case 'auth/requires-recent-login':
      return 'Please sign out and sign in again to verify your phone.';
    case 'auth/captcha-check-failed':
      return 'Security check failed. Please refresh and try again.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection and try again.';
    case 'auth/internal-error':
      return 'Verification service error. Please try again.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
    case 'auth/user-cancelled':
      return '';
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google window. Allow pop-ups for this site and try again.';
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with this email. Try signing in with a different method.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Sign in instead, or use Continue with Google if you signed up with Google.';
    case 'auth/weak-password':
      return 'Choose a stronger password: at least 6 characters.';
    case 'auth/invalid-email':
      return 'That email address does not look right.';
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email or password is incorrect. Try again, or use Forgot password.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact Neram Classes.';
    case 'auth/missing-password':
      return 'Please enter your password.';
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not available right now. Please use Continue with Google.';
    default: {
      const message = String(error?.message || '');
      // Never show raw "Firebase: Error (auth/...)" text to a student.
      if (!message || message.startsWith('Firebase:')) return 'Something went wrong. Please try again.';
      return message;
    }
  }
}

// ============================================
// LOGIN MODAL COMPONENT
// ============================================

export default function LoginModal({
  open,
  onClose,
  allowClose = true,
  onAuthenticated,
  apiBaseUrl,
  skipPhoneVerification = false,
  phoneOnly = false,
  initialPhone = '',
  onFunnelEvent,
  allowEscapeHatch = false,
  maxAttemptsBeforeEscape = 2,
  onSkip,
  onGetHelp,
  requireEmailVerification = false,
  dialCode = '+91',
  phoneLength = 10,
}: LoginModalProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Step state
  const [step, setStep] = useState<ModalStep>(phoneOnly ? 'phone' : 'login');

  // Login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginNotice, setLoginNotice] = useState('');

  // "Check your inbox" state
  const [verifyEmailAddress, setVerifyEmailAddress] = useState('');
  const [emailResendTimer, setEmailResendTimer] = useState(0);
  const [emailChecking, setEmailChecking] = useState(false);
  const [emailNotice, setEmailNotice] = useState('');
  const advancingRef = useRef(false);

  // Phone state
  const [phoneNumber, setPhoneNumber] = useState(initialPhone);
  const [otp, setOtp] = useState('');
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [resendTimer, setResendTimer] = useState(0);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  /** The verified number belongs to another account; credential lets them sign in to it. */
  const [phoneInUse, setPhoneInUse] = useState<{ credential: unknown | null } | null>(null);
  const [switchLoading, setSwitchLoading] = useState(false);
  const recaptchaInitialized = useRef(false);
  const recaptchaContainerRef = useRef<HTMLDivElement | null>(null);

  const showEscapeHatch = (allowEscapeHatch || !!onGetHelp) && failedAttempts >= maxAttemptsBeforeEscape;
  const fullPhone = `${dialCode}${phoneNumber}`;

  // Reset state each time the dialog OPENS. Only on the closed-to-open edge: a
  // late change to initialPhone (say, a profile prefill arriving) must not wipe
  // an OTP the student is typing.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setStep(phoneOnly ? 'phone' : 'login');
      setLoginError('');
      setLoginNotice('');
      setPhoneError('');
      setEmail('');
      setPassword('');
      setFullName('');
      setPhoneNumber(initialPhone);
      setOtp('');
      setIsSignUp(false);
      setResendTimer(0);
      setFailedAttempts(0);
      setShowHelp(false);
      setPhoneInUse(null);
      setEmailNotice('');
      advancingRef.current = false;

      // Someone who closed "Check your inbox" earlier and is still signed in
      // with an unverified email goes back there, never straight to phone.
      if (requireEmailVerification) {
        import('@neram/auth').then(({ getFirebaseAuth }) => {
          const current = getFirebaseAuth().currentUser;
          const usesPassword = current?.providerData.some((p) => p.providerId === 'password');
          if (current && usesPassword && !current.emailVerified) {
            setVerifyEmailAddress(current.email || '');
            setStep('verifyEmail');
          }
        }).catch(() => undefined);
      }
    }
    wasOpenRef.current = open;
  }, [open, phoneOnly, initialPhone, requireEmailVerification]);

  // Reinitialize the reCAPTCHA verifier. Firebase consumes the verifier on every
  // signInWithPhoneNumber call, so we recreate it before each send. The container
  // lives in a stable portal that is always in the DOM, so no DOM-readiness wait
  // is needed.
  const reinitRecaptcha = useCallback(async () => {
    const { clearRecaptcha, initRecaptcha } = await import('@neram/auth');
    clearRecaptcha();
    initRecaptcha('recaptcha-container-login-modal');
    recaptchaInitialized.current = true;
  }, []);

  // Initialize reCAPTCHA once the (portaled) container is mounted and we reach the
  // phone step. Presence-based instead of a timer so it never races the mount.
  useEffect(() => {
    if (
      open &&
      step === 'phone' &&
      !recaptchaInitialized.current &&
      recaptchaContainerRef.current
    ) {
      (async () => {
        try {
          const { initRecaptcha } = await import('@neram/auth');
          initRecaptcha('recaptcha-container-login-modal');
          recaptchaInitialized.current = true;
        } catch (err) {
          console.error('Failed to initialize reCAPTCHA:', err);
        }
      })();
    }
  }, [open, step]);

  // Clean up reCAPTCHA when modal closes
  useEffect(() => {
    if (!open) {
      import('@neram/auth').then(({ clearRecaptcha }) => {
        clearRecaptcha();
        recaptchaInitialized.current = false;
      });
    }
  }, [open]);

  // Resend timer countdown
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  useEffect(() => {
    if (emailResendTimer > 0) {
      const timer = setTimeout(() => setEmailResendTimer(emailResendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [emailResendTimer]);

  // ---- API Helpers ----

  const registerUser = useCallback(async (idToken: string) => {
    const response = await fetch(`${apiBaseUrl}/api/auth/register-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, ...signupOriginFields() }),
    });
    if (!response.ok) {
      throw new Error(`Registration failed: ${response.status}`);
    }
    return response.json();
  }, [apiBaseUrl]);

  const verifyPhone = useCallback(async (idToken: string, phone: string) => {
    const response = await fetch(`${apiBaseUrl}/api/auth/verify-phone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, phoneNumber: phone }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (errorData.error === 'PHONE_ALREADY_EXISTS') {
        throw new Error(
          errorData.message ||
          'This phone number is already registered with another account. Please use a different number.'
        );
      }
      if (errorData.error === 'PHONE_NOT_VERIFIED') {
        throw new Error('We could not confirm this number on your account. Request a new OTP and try again.');
      }
      throw new Error('We could not save your verified number. Please try again.');
    }
    return response.json();
  }, [apiBaseUrl]);

  // ---- Post-Login Flow ----

  const handlePostLogin = useCallback(async () => {
    try {
      const { getFirebaseAuth } = await import('@neram/auth');
      const auth = getFirebaseAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const idToken = await currentUser.getIdToken();
      const { user: dbUser } = await registerUser(idToken);

      // An email/password account proves its address before anything else.
      const usesPassword = currentUser.providerData.some((p) => p.providerId === 'password');
      if (requireEmailVerification && usesPassword && !currentUser.emailVerified) {
        setVerifyEmailAddress(currentUser.email || '');
        setStep('verifyEmail');
        return;
      }

      if (skipPhoneVerification || dbUser.phone_verified) {
        // All done
        onAuthenticated?.();
      } else {
        // Need phone verification
        setStep('phone');
      }
    } catch (error) {
      console.error('Post-login registration failed:', error);
      // Still move to phone step even if register fails
      // The verify-phone route has fallback user creation
      if (!skipPhoneVerification) {
        setStep('phone');
      } else {
        onAuthenticated?.();
      }
    }
  }, [registerUser, skipPhoneVerification, onAuthenticated, requireEmailVerification]);

  // ---- Email verification ----

  /** Ask Firebase whether the link was clicked; if so, carry on to the phone step. */
  const checkEmailVerified = useCallback(async (manual: boolean) => {
    if (advancingRef.current) return;
    if (manual) {
      setEmailChecking(true);
      setEmailNotice('');
    }
    try {
      const { refreshEmailVerified } = await import('@neram/auth');
      const verified = await refreshEmailVerified();
      if (verified) {
        advancingRef.current = true;
        onFunnelEvent?.({ funnel: 'auth', event: 'email_verified', status: 'completed' });
        await handlePostLogin();
        advancingRef.current = false;
      } else if (manual) {
        setEmailNotice('Not verified yet. Open the email from Neram Classes and tap the link, then come back here.');
      }
    } catch (err: any) {
      if (manual) setEmailNotice(getFirebaseErrorMessage(err));
    } finally {
      if (manual) setEmailChecking(false);
    }
  }, [handlePostLogin, onFunnelEvent]);

  // While waiting on the link, check every few seconds (only when the tab is
  // visible) and the moment the student comes back to this tab.
  useEffect(() => {
    if (!open || step !== 'verifyEmail') return;
    const tick = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') checkEmailVerified(false);
    };
    const interval = setInterval(tick, EMAIL_POLL_MS);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', tick);
    };
  }, [open, step, checkEmailVerified]);

  const handleResendVerification = async () => {
    if (emailResendTimer > 0) return;
    setEmailNotice('');
    try {
      const { resendVerificationEmail } = await import('@neram/auth');
      await resendVerificationEmail();
      setEmailResendTimer(60);
      setEmailNotice(`We sent a new link to ${verifyEmailAddress}.`);
    } catch (err: any) {
      setEmailNotice(getFirebaseErrorMessage(err));
    }
  };

  /** "Use a different email": sign out of the unverified account and start again. */
  const handleUseDifferentEmail = async () => {
    const { firebaseSignOut } = await import('@neram/auth');
    await firebaseSignOut().catch(() => {});
    setStep('login');
    setIsSignUp(true);
    setPassword('');
    setEmailNotice('');
  };

  // ---- Login Handlers ----

  const handleGoogleSignIn = async () => {
    setLoginLoading(true);
    setLoginError('');
    try {
      const { signInWithGoogleOrRedirect } = await import('@neram/auth');
      // Null: the student closed the popup, or the page is redirecting to Google.
      const user = await signInWithGoogleOrRedirect();
      if (user) await handlePostLogin();
    } catch (err: any) {
      const msg = getFirebaseErrorMessage(err);
      if (msg) setLoginError(msg);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError('');
    try {
      if (isSignUp) {
        const { createAccountWithEmail } = await import('@neram/auth');
        await createAccountWithEmail(email.trim(), password, fullName.trim() || undefined);
        setEmailResendTimer(60);
        onFunnelEvent?.({ funnel: 'auth', event: 'email_signup', status: 'completed' });
      } else {
        const { signInWithEmail } = await import('@neram/auth');
        await signInWithEmail(email.trim(), password);
      }
      await handlePostLogin();
    } catch (err: any) {
      const msg = getFirebaseErrorMessage(err);
      if (msg) setLoginError(msg);
      // An existing address: switch to Sign In with the email kept.
      if (err?.code === 'auth/email-already-in-use') setIsSignUp(false);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setLoginError('');
    setLoginNotice('');
    if (!email.trim()) {
      setLoginError('Enter your email above, then tap Forgot password.');
      return;
    }
    try {
      const { resetPassword } = await import('@neram/auth');
      await resetPassword(email.trim());
    } catch (err: any) {
      // Never confirm whether an address has an account; only a malformed one is reported.
      if (err?.code === 'auth/invalid-email') {
        setLoginError(getFirebaseErrorMessage(err));
        return;
      }
    }
    setLoginNotice(`If ${email.trim()} has an account, a password reset link is on its way.`);
  };

  // ---- Phone Handlers ----

  const handleSendOtp = async () => {
    if (phoneNumber.length !== phoneLength) {
      setPhoneError(`Please enter a valid ${phoneLength}-digit phone number`);
      return;
    }

    onFunnelEvent?.({ funnel: 'auth', event: 'otp_requested', status: 'started' });
    setPhoneError('');
    setPhoneLoading(true);
    try {
      const { sendPhoneOTP, getFirebaseAuth } = await import('@neram/auth');

      // Capture phone number as lead BEFORE sending OTP so it's never lost
      // even if OTP fails or user drops off
      try {
        const auth = getFirebaseAuth();
        const currentUser = auth.currentUser;
        if (currentUser) {
          const idToken = await currentUser.getIdToken();
          await fetch(`${apiBaseUrl}/api/auth/capture-phone`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken, phoneNumber: fullPhone }),
          });
        }
      } catch {
        // Non-critical: don't block OTP send if capture fails
      }

      // Always reinitialize reCAPTCHA before each OTP attempt: Firebase consumes
      // the verifier on each signInWithPhoneNumber call.
      await reinitRecaptcha();

      await sendPhoneOTP(fullPhone);
      onFunnelEvent?.({ funnel: 'auth', event: 'otp_requested', status: 'completed' });
      setStep('otp');
      setResendTimer(60);
    } catch (err: any) {
      const errMsg = getFirebaseErrorMessage(err);
      onFunnelEvent?.({ funnel: 'auth', event: 'otp_request_failed', status: 'failed', error_message: errMsg, error_code: err?.code });
      // If reCAPTCHA or auth error, try reinitializing and retry once
      const isRetryable = err?.message?.includes('reCAPTCHA')
        || err?.code === 'auth/captcha-check-failed'
        || err?.code === 'auth/internal-error';
      if (isRetryable) {
        try {
          const { sendPhoneOTP } = await import('@neram/auth');
          await reinitRecaptcha();
          await sendPhoneOTP(fullPhone);
          onFunnelEvent?.({ funnel: 'auth', event: 'otp_requested', status: 'completed', metadata: { retry: true } });
          setStep('otp');
          setResendTimer(60);
          return;
        } catch (retryErr: any) {
          setPhoneError(getFirebaseErrorMessage(retryErr));
          setFailedAttempts((n) => n + 1);
          return;
        }
      }
      setPhoneError(errMsg);
      setFailedAttempts((n) => n + 1);
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) {
      setPhoneError('Please enter a valid 6-digit OTP');
      return;
    }

    onFunnelEvent?.({ funnel: 'auth', event: 'otp_entered', status: 'started' });
    setPhoneError('');
    setPhoneLoading(true);
    try {
      const { verifyPhoneAndLink, getFirebaseAuth } = await import('@neram/auth');

      // Signed in (Google or email): the phone is attached to THIS account.
      // Nobody signed in (phone-first): a normal phone sign-in. A bare
      // confirm() after Google used to replace the Google session.
      await verifyPhoneAndLink(otp);

      // Save to Supabase
      const auth = getFirebaseAuth();
      const currentUser = auth.currentUser;
      if (currentUser) {
        const idToken = await currentUser.getIdToken(true); // Force refresh to include phone claim
        const verified = await verifyPhone(idToken, fullPhone);
        firePhoneVerifiedConversion(verified?.user?.id);
      }

      onAuthenticated?.(phoneNumber);
    } catch (err: any) {
      const errMsg = err?.message || '';
      if (err?.code === 'neram/phone-in-use' || errMsg.includes('already registered')) {
        onFunnelEvent?.({ funnel: 'auth', event: 'phone_already_exists', status: 'failed', error_message: errMsg, error_code: 'PHONE_ALREADY_EXISTS' });
        // Firebase-level: the number is another sign-in, which they can switch to.
        // Database-level (409): only a different number or help.
        setPhoneInUse({ credential: err?.code === 'neram/phone-in-use' ? err.credential ?? null : null });
        setStep('phoneInUse');
        setOtp('');
        setFailedAttempts((n) => n + 1);
      } else {
        onFunnelEvent?.({ funnel: 'auth', event: 'otp_failed', status: 'failed', error_message: getFirebaseErrorMessage(err), error_code: err?.code });
        setPhoneError(getFirebaseErrorMessage(err));
        setFailedAttempts((n) => n + 1);
      }
    } finally {
      setPhoneLoading(false);
    }
  };

  /**
   * "Sign in with this number": switch to the account that owns the verified
   * number (no new OTP; the credential is already proven), ask the server to
   * fold the account made moments ago into it, then save the phone as usual.
   */
  const handleSignInWithNumber = async () => {
    if (!phoneInUse?.credential) return;
    setSwitchLoading(true);
    setPhoneError('');
    try {
      const { getFirebaseAuth, signInWithPhoneCredential } = await import('@neram/auth');
      const previousIdToken = await getFirebaseAuth().currentUser?.getIdToken().catch(() => undefined);
      const user = await signInWithPhoneCredential(phoneInUse.credential as any);
      const idToken = await user.getIdToken(true);
      if (previousIdToken) {
        await fetch(`${apiBaseUrl}/api/auth/adopt-account`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ previousIdToken, idToken }),
        }).catch(() => undefined);
      }
      await registerUser(idToken).catch(() => undefined);
      const verified = await verifyPhone(idToken, fullPhone);
      firePhoneVerifiedConversion(verified?.user?.id);
      onFunnelEvent?.({ funnel: 'auth', event: 'phone_account_switched', status: 'completed' });
      onAuthenticated?.(phoneNumber);
    } catch (err: any) {
      setPhoneError(getFirebaseErrorMessage(err));
      setFailedAttempts((n) => n + 1);
    } finally {
      setSwitchLoading(false);
    }
  };

  const handleChangePhone = async () => {
    setStep('phone');
    setOtp('');
    setPhoneError('');
    setPhoneInUse(null);
    // Re-initialize reCAPTCHA since it was consumed during OTP send
    try {
      await reinitRecaptcha();
    } catch (recaptchaErr) {
      console.error('Failed to reinitialize reCAPTCHA:', recaptchaErr);
    }
  };

  const handleResendOtp = async () => {
    if (resendTimer > 0) return;

    setPhoneError('');
    setPhoneLoading(true);
    try {
      const { sendPhoneOTP } = await import('@neram/auth');
      await reinitRecaptcha();
      await sendPhoneOTP(fullPhone);
      setResendTimer(60);
    } catch (err: any) {
      setPhoneError(getFirebaseErrorMessage(err));
      setFailedAttempts((n) => n + 1);
    } finally {
      setPhoneLoading(false);
    }
  };

  // ---- Render ----

  const handleClose = allowClose ? onClose : undefined;

  // Shown after repeated reCAPTCHA/OTP failures so a Google-authenticated user is
  // never permanently trapped behind a broken phone-verification step.
  const escapeHatch = showEscapeHatch ? (
    <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
      <Button
        variant="text"
        size="small"
        onClick={() => {
          setShowHelp((v) => !v);
          if (!showHelp) onGetHelp?.();
        }}
        sx={{ textTransform: 'none', fontWeight: 600 }}
      >
        {showHelp ? 'Hide help' : 'Having trouble? Get help'}
      </Button>
      <Collapse in={showHelp}>
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, mt: 1 }}>
          <ConnectToOffice />
        </Box>
      </Collapse>
      {onSkip && (
        <Button
          variant="text"
          size="small"
          fullWidth
          onClick={onSkip}
          sx={{ textTransform: 'none', mt: 1.5, color: 'text.secondary' }}
        >
          Skip for now and verify later
        </Button>
      )}
    </Box>
  ) : null;

  return (
    <>
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      fullScreen={isMobile}
      disableEscapeKeyDown={!allowClose}
      disableEnforceFocus
      disableScrollLock
      TransitionComponent={isMobile ? SlideTransition : undefined}
      sx={{
        '& .MuiDialog-paper': {
          borderRadius: isMobile ? '12px 12px 0 0' : 1.5,
          m: isMobile ? 0 : 2,
          position: isMobile ? 'fixed' : 'relative',
          bottom: isMobile ? 0 : 'auto',
          maxHeight: isMobile ? '90vh' : 'calc(100% - 64px)',
        },
      }}
    >
      <DialogTitle sx={{ pb: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h5" component="div" sx={{ fontWeight: 600 }}>
            {step === 'login' && (isSignUp ? 'Create your account' : 'Sign In')}
            {step === 'verifyEmail' && 'Check your inbox'}
            {step === 'phone' && 'Verify Your Phone'}
            {step === 'otp' && 'Enter OTP'}
            {step === 'phoneInUse' && 'This number already has an account'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {step === 'login' && 'Sign in to access your Neram Classes account'}
            {step === 'verifyEmail' && 'Confirm your email to keep your account safe'}
            {step === 'phone' && 'We need to verify your phone for account security'}
            {step === 'otp' && `Enter the OTP sent to ${dialCode} ${phoneNumber}`}
            {step === 'phoneInUse' && `${dialCode} ${phoneNumber} is already on a Neram account`}
          </Typography>
        </Box>
        {allowClose && onClose && (
          <IconButton onClick={onClose} sx={{ ml: 1 }}>
            <CloseIcon />
          </IconButton>
        )}
      </DialogTitle>

      <DialogContent>
        <Box sx={{ pt: 2 }}>
          {/* ---- LOGIN STEP ---- */}
          {step === 'login' && (
            <Box>
              {/* Google Sign In */}
              <Button
                fullWidth
                variant="outlined"
                size="large"
                onClick={handleGoogleSignIn}
                disabled={loginLoading}
                sx={{
                  py: 1.5,
                  textTransform: 'none',
                  fontSize: '1rem',
                  minHeight: 48,
                  borderColor: '#dadce0',
                  color: '#3c4043',
                  '&:hover': {
                    borderColor: '#d2d2d2',
                    bgcolor: '#f8f9fa',
                  },
                }}
              >
                {loginLoading ? (
                  <CircularProgress size={24} color="primary" />
                ) : (
                  <>
                    <Box component="span" sx={{ width: 20, height: 20, mr: 2, display: 'inline-block', fontSize: '20px', lineHeight: '20px' }}>
                      G
                    </Box>
                    Continue with Google
                  </>
                )}
              </Button>

              <Divider sx={{ my: 3 }}>
                <Typography variant="body2" color="text.secondary">
                  OR
                </Typography>
              </Divider>

              {/* Email/Password Form */}
              <form onSubmit={handleEmailAuth}>
                {isSignUp && (
                  <TextField
                    fullWidth
                    label="Full name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    sx={{ mb: 2 }}
                    autoComplete="name"
                    inputProps={{ style: { fontSize: '16px' } }}
                  />
                )}
                <TextField
                  fullWidth
                  type="email"
                  label="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  sx={{ mb: 2 }}
                  autoComplete="email"
                  inputProps={{ style: { fontSize: '16px' } }}
                />
                <TextField
                  fullWidth
                  type="password"
                  label="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  sx={{ mb: 2 }}
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  helperText={isSignUp ? 'At least 6 characters' : undefined}
                  inputProps={{ minLength: 6, style: { fontSize: '16px' } }}
                />

                {!isSignUp && (
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: -1, mb: 1 }}>
                    <Button variant="text" size="small" onClick={handleForgotPassword} sx={{ textTransform: 'none', minHeight: 44 }}>
                      Forgot password?
                    </Button>
                  </Box>
                )}

                {loginError && (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    {loginError}
                  </Alert>
                )}
                {loginNotice && (
                  <Alert severity="info" sx={{ mb: 2 }}>
                    {loginNotice}
                  </Alert>
                )}

                <Button
                  fullWidth
                  type="submit"
                  variant="contained"
                  size="large"
                  disabled={loginLoading}
                  sx={{ py: 1.5, minHeight: 48 }}
                >
                  {loginLoading ? (
                    <CircularProgress size={24} color="inherit" />
                  ) : isSignUp ? (
                    'Sign Up with Email'
                  ) : (
                    'Sign In with Email'
                  )}
                </Button>
              </form>

              <Box sx={{ mt: 2, textAlign: 'center' }}>
                <Button
                  variant="text"
                  size="small"
                  onClick={() => {
                    setIsSignUp(!isSignUp);
                    setLoginError('');
                    setLoginNotice('');
                  }}
                  sx={{ textTransform: 'none' }}
                >
                  {isSignUp
                    ? 'Already have an account? Sign In'
                    : "Don't have an account? Sign Up"}
                </Button>
              </Box>
            </Box>
          )}

          {/* ---- CHECK YOUR INBOX ---- */}
          {step === 'verifyEmail' && (
            <Box>
              <Alert severity="info" sx={{ mb: 2 }}>
                We sent a verification link to <strong>{verifyEmailAddress}</strong>. Open it on any device, then come back:
                this page continues by itself.
              </Alert>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                No email? Check Spam or Promotions, or send it again.
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary', mb: 1 }}>
                <CircularProgress size={14} />
                <Typography variant="body2">Waiting for you to tap the link</Typography>
              </Box>
              {emailNotice && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  {emailNotice}
                </Alert>
              )}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mt: 2 }}>
                <Button variant="text" size="small" onClick={handleUseDifferentEmail} sx={{ textTransform: 'none', minHeight: 44 }}>
                  Use a different email
                </Button>
                <Button
                  variant="text"
                  size="small"
                  onClick={handleResendVerification}
                  disabled={emailResendTimer > 0}
                  sx={{ textTransform: 'none', minHeight: 44 }}
                >
                  {emailResendTimer > 0 ? `Resend in ${emailResendTimer}s` : 'Resend email'}
                </Button>
              </Box>
            </Box>
          )}

          {/* ---- NUMBER ALREADY ON ANOTHER ACCOUNT ---- */}
          {step === 'phoneInUse' && (
            <Box>
              <Typography variant="body1" sx={{ mb: 2 }}>
                {phoneInUse?.credential
                  ? 'You may have signed up with this number before. Sign in with it to continue on that account, with everything you saved there.'
                  : 'Another Neram account already uses this number. Use a different number, or contact us and we will join the accounts.'}
              </Typography>
              {phoneError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {phoneError}
                </Alert>
              )}
              <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, mt: 1 }}>
                <ConnectToOffice />
              </Box>
            </Box>
          )}

          {/* ---- PHONE STEP ---- */}
          {step === 'phone' && (
            <Box>
              <Alert severity="info" sx={{ mb: 3 }}>
                A one-time password will be sent to your phone via SMS.
              </Alert>

              <Typography variant="body2" color="text.secondary" gutterBottom>
                Enter your {phoneLength}-digit mobile number
              </Typography>
              <TextField
                fullWidth
                label="Phone Number"
                placeholder="9876543210"
                value={phoneNumber}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, phoneLength);
                  setPhoneNumber(value);
                  setPhoneError('');
                }}
                InputProps={{
                  startAdornment: (
                    <Typography variant="body1" color="text.secondary" sx={{ mr: 1 }}>
                      {dialCode}
                    </Typography>
                  ),
                }}
                inputProps={{
                  inputMode: 'numeric',
                  pattern: '[0-9]*',
                  autoComplete: 'tel-national',
                  style: { fontSize: '18px' },
                }}
                sx={{
                  mt: 1,
                  '& .MuiInputBase-root': { height: 56 },
                }}
                autoFocus
              />

              {phoneError && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {phoneError}
                </Alert>
              )}

              {escapeHatch}
            </Box>
          )}

          {/* ---- OTP STEP ---- */}
          {step === 'otp' && (
            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Enter the 6-digit OTP
              </Typography>
              <TextField
                fullWidth
                label="OTP"
                placeholder="000000"
                value={otp}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setOtp(value);
                  setPhoneError('');
                }}
                inputProps={{
                  inputMode: 'numeric',
                  pattern: '[0-9]*',
                  autoComplete: 'one-time-code',
                  style: {
                    fontSize: '24px',
                    letterSpacing: '8px',
                    textAlign: 'center',
                  },
                }}
                sx={{
                  mt: 1,
                  '& .MuiInputBase-root': { height: 56 },
                }}
                autoFocus
              />

              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  mt: 2,
                }}
              >
                <Button
                  variant="text"
                  size="small"
                  onClick={handleChangePhone}
                  disabled={phoneLoading}
                >
                  Change Phone Number
                </Button>
                <Button
                  variant="text"
                  size="small"
                  onClick={handleResendOtp}
                  disabled={phoneLoading || resendTimer > 0}
                >
                  {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend OTP'}
                </Button>
              </Box>

              {phoneError && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {phoneError}
                </Alert>
              )}

              {escapeHatch}
            </Box>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 3, pt: 1, flexDirection: 'column', gap: 1, '& > :not(style) ~ :not(style)': { ml: 0 } }}>
        {step === 'verifyEmail' && (
          <Button
            variant="contained"
            fullWidth
            size="large"
            onClick={() => checkEmailVerified(true)}
            disabled={emailChecking}
            sx={{ py: 1.5, fontSize: '16px', minHeight: 48 }}
          >
            {emailChecking ? <CircularProgress size={24} color="inherit" /> : "I've verified my email"}
          </Button>
        )}

        {step === 'phoneInUse' && !!phoneInUse?.credential && (
          <Button
            variant="contained"
            fullWidth
            size="large"
            onClick={handleSignInWithNumber}
            disabled={switchLoading}
            sx={{ py: 1.5, fontSize: '16px', minHeight: 48 }}
          >
            {switchLoading ? <CircularProgress size={24} color="inherit" /> : 'Sign in with this number'}
          </Button>
        )}
        {step === 'phoneInUse' && (
          <Button
            variant={phoneInUse?.credential ? 'text' : 'contained'}
            fullWidth
            size="large"
            onClick={handleChangePhone}
            disabled={switchLoading}
            sx={{ py: 1.5, fontSize: '16px', minHeight: 48 }}
          >
            Use a different number
          </Button>
        )}

        {step === 'phone' && (
          <Button
            variant="contained"
            fullWidth
            size="large"
            onClick={handleSendOtp}
            disabled={phoneLoading || phoneNumber.length !== phoneLength}
            sx={{ py: 1.5, fontSize: '16px', minHeight: 48 }}
          >
            {phoneLoading ? <CircularProgress size={24} color="inherit" /> : 'Send OTP'}
          </Button>
        )}

        {step === 'otp' && (
          <Button
            variant="contained"
            fullWidth
            size="large"
            onClick={handleVerifyOtp}
            disabled={phoneLoading || otp.length !== 6}
            sx={{ py: 1.5, fontSize: '16px', minHeight: 48 }}
          >
            {phoneLoading ? <CircularProgress size={24} color="inherit" /> : 'Verify OTP'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
    {/*
      reCAPTCHA mounts here, in a portal at document.body OUTSIDE the Dialog.
      Firebase's visible image challenge is appended to document.body, and the
      Dialog runs with disableEnforceFocus so the challenge stays clickable.
      Keeping a single container (not one per step) avoids duplicate-id bugs.
    */}
    {open && (
      <Portal>
        <div
          ref={recaptchaContainerRef}
          id="recaptcha-container-login-modal"
          style={{ position: 'fixed', bottom: 0, left: 0, zIndex: 2147483647 }}
        />
      </Portal>
    )}
    </>
  );
}

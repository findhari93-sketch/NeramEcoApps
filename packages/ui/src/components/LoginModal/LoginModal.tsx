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
} from '@mui/material';
import { useMediaQuery, useTheme } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import React from 'react';
import type { TransitionProps } from '@mui/material/transitions';

// ============================================
// TYPES
// ============================================

export interface LoginModalProps {
  open: boolean;
  onClose?: () => void;
  /** Can user dismiss the modal? Default: true */
  allowClose?: boolean;
  /** Called after login + phone verification complete */
  onAuthenticated?: () => void;
  /** Base URL for API calls. Empty string for same-origin, full URL for cross-origin */
  apiBaseUrl: string;
  /** Skip phone verification step (for already-verified users) */
  skipPhoneVerification?: boolean;
  /** Start directly at phone verification step */
  phoneOnly?: boolean;
}

type ModalStep = 'login' | 'phone' | 'otp';

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
    case 'auth/popup-closed-by-user':
      return 'Sign-in popup was closed. Please try again.';
    case 'auth/cancelled-popup-request':
      return '';
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with this email. Try signing in with a different method.';
    default:
      return error?.message || 'An error occurred. Please try again.';
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
}: LoginModalProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Step state
  const [step, setStep] = useState<ModalStep>(phoneOnly ? 'phone' : 'login');

  // Login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Phone state
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [resendTimer, setResendTimer] = useState(0);
  const recaptchaInitialized = useRef(false);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (open) {
      setStep(phoneOnly ? 'phone' : 'login');
      setLoginError('');
      setPhoneError('');
      setEmail('');
      setPassword('');
      setPhoneNumber('');
      setOtp('');
      setIsSignUp(false);
      setResendTimer(0);
    }
  }, [open, phoneOnly]);

  // Initialize reCAPTCHA when entering phone step
  useEffect(() => {
    if (open && (step === 'phone') && !recaptchaInitialized.current) {
      const timer = setTimeout(async () => {
        try {
          const { initRecaptcha } = await import('@neram/auth');
          initRecaptcha('recaptcha-container-login-modal');
          recaptchaInitialized.current = true;
        } catch (err) {
          console.error('Failed to initialize reCAPTCHA:', err);
        }
      }, 500);
      return () => clearTimeout(timer);
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

  // ---- API Helpers ----

  const registerUser = useCallback(async (idToken: string) => {
    const response = await fetch(`${apiBaseUrl}/api/auth/register-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
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
      throw new Error(`Phone verification failed: ${response.status}`);
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
  }, [registerUser, skipPhoneVerification, onAuthenticated]);

  // ---- Login Handlers ----

  const handleGoogleSignIn = async () => {
    setLoginLoading(true);
    setLoginError('');
    try {
      const { signInWithGoogle } = await import('@neram/auth');
      await signInWithGoogle();
      await handlePostLogin();
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
        await createAccountWithEmail(email, password);
      } else {
        const { signInWithEmail } = await import('@neram/auth');
        await signInWithEmail(email, password);
      }
      await handlePostLogin();
    } catch (err: any) {
      const msg = getFirebaseErrorMessage(err);
      if (msg) setLoginError(msg);
    } finally {
      setLoginLoading(false);
    }
  };

  // ---- Phone Handlers ----

  const handleSendOtp = async () => {
    if (phoneNumber.length !== 10) {
      setPhoneError('Please enter a valid 10-digit phone number');
      return;
    }

    setPhoneError('');
    setPhoneLoading(true);
    try {
      const { sendPhoneOTP } = await import('@neram/auth');
      await sendPhoneOTP(phoneNumber);
      setStep('otp');
      setResendTimer(60);
    } catch (err: any) {
      setPhoneError(getFirebaseErrorMessage(err));
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) {
      setPhoneError('Please enter a valid 6-digit OTP');
      return;
    }

    setPhoneError('');
    setPhoneLoading(true);
    try {
      const { verifyPhoneOTP, verifyPhoneAndLink, getFirebaseAuth } = await import('@neram/auth');

      // When phoneOnly=true, the user is already signed in (e.g., via Google).
      // Use verifyPhoneAndLink to link phone to their existing account
      // instead of creating a new sign-in that would replace their session.
      if (phoneOnly) {
        await verifyPhoneAndLink(otp);
      } else {
        await verifyPhoneOTP(otp);
      }

      // Save to Supabase
      const auth = getFirebaseAuth();
      const currentUser = auth.currentUser;
      if (currentUser) {
        const idToken = await currentUser.getIdToken(true); // Force refresh to include phone claim
        await verifyPhone(idToken, `+91${phoneNumber}`);
      }

      onAuthenticated?.();
    } catch (err: any) {
      // Check if this is a duplicate phone error from our API
      const errMsg = err?.message || '';
      if (errMsg.includes('already registered')) {
        setPhoneError(errMsg);
        // Go back to phone step so user can enter a different number
        setStep('phone');
        setOtp('');
      } else {
        setPhoneError(getFirebaseErrorMessage(err));
      }
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleChangePhone = () => {
    setStep('phone');
    setOtp('');
    setPhoneError('');
  };

  const handleResendOtp = async () => {
    if (resendTimer > 0) return;

    setPhoneError('');
    setPhoneLoading(true);
    try {
      const { clearRecaptcha, initRecaptcha, sendPhoneOTP } = await import('@neram/auth');
      clearRecaptcha();
      recaptchaInitialized.current = false;

      // Wait for DOM to update after clearing, then reinitialize
      await new Promise((resolve) => setTimeout(resolve, 200));
      initRecaptcha('recaptcha-container-login-modal');
      recaptchaInitialized.current = true;

      await sendPhoneOTP(phoneNumber);
      setResendTimer(60);
    } catch (err: any) {
      setPhoneError(getFirebaseErrorMessage(err));
    } finally {
      setPhoneLoading(false);
    }
  };

  // ---- Render ----

  const handleClose = allowClose ? onClose : undefined;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      fullScreen={isMobile}
      disableEscapeKeyDown={!allowClose}
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
            {step === 'login' && 'Sign In'}
            {step === 'phone' && 'Verify Your Phone'}
            {step === 'otp' && 'Enter OTP'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {step === 'login' && 'Sign in to access your Neram Classes account'}
            {step === 'phone' && 'We need to verify your phone for account security'}
            {step === 'otp' && `Enter the OTP sent to +91 ${phoneNumber}`}
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
                  inputProps={{ minLength: 6, style: { fontSize: '16px' } }}
                />

                {loginError && (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    {loginError}
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

          {/* ---- PHONE STEP ---- */}
          {step === 'phone' && (
            <Box>
              <Alert severity="info" sx={{ mb: 3 }}>
                A one-time password will be sent to your phone via SMS.
              </Alert>

              <Typography variant="body2" color="text.secondary" gutterBottom>
                Enter your 10-digit mobile number
              </Typography>
              <TextField
                fullWidth
                label="Phone Number"
                placeholder="9876543210"
                value={phoneNumber}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 10);
                  setPhoneNumber(value);
                  setPhoneError('');
                }}
                InputProps={{
                  startAdornment: (
                    <Typography variant="body1" color="text.secondary" sx={{ mr: 1 }}>
                      +91
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

              {/* reCAPTCHA container - invisible */}
              <div id="recaptcha-container-login-modal"></div>
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

              {/* reCAPTCHA container for resend */}
              <div id="recaptcha-container-login-modal"></div>
            </Box>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 3, pt: 1 }}>
        {step === 'phone' && (
          <Button
            variant="contained"
            fullWidth
            size="large"
            onClick={handleSendOtp}
            disabled={phoneLoading || phoneNumber.length !== 10}
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
  );
}

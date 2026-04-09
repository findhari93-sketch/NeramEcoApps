'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  TextField,
  CircularProgress,
  Alert,
  Paper,
  Container,
} from '@neram/ui';
import PhoneIcon from '@mui/icons-material/Phone';
import LockIcon from '@mui/icons-material/Lock';
import { initRecaptcha, sendPhoneOTP, verifyPhoneOTP, getFirebaseAuth } from '@neram/auth/firebase';
import { signInWithCustomToken } from 'firebase/auth';

type ErrorType = 'invalid' | 'expired' | 'not_approved' | null;

interface Props {
  token: string;
  initialError: ErrorType;
  maskedPhone: string | null;
  applicationNumber: string | null;
  alreadyLinked: boolean; // informational only - we always show OTP for a fresh Firebase session
  getPhoneForToken: (token: string) => Promise<string | null>;
}

export default function PaymentLinkContent({
  token,
  initialError,
  maskedPhone,
  applicationNumber,
  alreadyLinked,
  getPhoneForToken,
}: Props) {
  const router = useRouter();
  const recaptchaRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState<'phone' | 'otp' | 'verifying' | 'redirecting'>('phone');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Always show OTP even if firebase_uid exists in DB.
  // We need a fresh Firebase session (custom token) that matches the stored firebase_uid.
  // The alreadyLinked flag is informational only - used in the verify API.

  const handleSendOtp = async () => {
    setLoading(true);
    setError(null);
    try {
      // Get full phone number via server action (not exposed in client-accessible API)
      const phone = await getPhoneForToken(token);
      if (!phone) {
        setError('Unable to send OTP. Please contact us.');
        return;
      }

      // Initialize invisible reCAPTCHA
      initRecaptcha('recaptcha-container', { size: 'invisible' });

      await sendPhoneOTP(phone);
      setStep('otp');
    } catch (err: any) {
      console.error('Send OTP error:', err);
      setError('Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) {
      setError('Please enter the 6-digit OTP.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Step 1: Verify the OTP with Firebase - this proves phone ownership
      const phoneUser = await verifyPhoneOTP(otp);
      const firebaseToken = await phoneUser.getIdToken();

      // Step 2: Send phone auth token to server.
      // Server verifies phone matches application, then returns a custom token
      // for the user's CANONICAL firebase_uid (Google OAuth UID if they have one,
      // phone auth UID otherwise). This prevents the Google vs phone UID mismatch.
      const res = await fetch(`/api/pay/link/${token}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firebaseToken }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === 'phone_mismatch') {
          setError('Phone number does not match. Please contact us for help.');
        } else if (data.error === 'invalid_or_expired') {
          setError('This payment link has expired. Please contact us for a new link.');
        } else {
          setError('Verification failed. Please try again.');
        }
        return;
      }

      // Step 3: Sign in with the custom token so the Firebase session matches
      // the firebase_uid stored in users table (works regardless of prior auth method)
      const auth = getFirebaseAuth();
      await signInWithCustomToken(auth, data.customToken);

      setStep('redirecting');
      router.replace(`/pay?app=${data.applicationNumber}`);
    } catch (err: any) {
      console.error('OTP verify error:', err);
      if (err?.code === 'auth/invalid-verification-code') {
        setError('Incorrect OTP. Please check and try again.');
      } else if (err?.code === 'auth/code-expired') {
        setError('OTP expired. Please go back and request a new one.');
      } else {
        setError('Verification failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Error states
  const errorMessages: Record<string, { title: string; body: string }> = {
    invalid: {
      title: 'Link not valid',
      body: 'This payment link is not valid. Please contact us on WhatsApp to get a new link.',
    },
    expired: {
      title: 'Link expired',
      body: 'This payment link has expired (valid for 7 days). Please contact us on WhatsApp to get a new link.',
    },
    not_approved: {
      title: 'Application under review',
      body: 'Your application is still under review. You will be notified once it is approved.',
    },
  };

  if (initialError) {
    const msg = errorMessages[initialError];
    return (
      <Container maxWidth="sm" sx={{ py: 8 }}>
        <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
          <Typography variant="h5" fontWeight={700} gutterBottom color="error">
            {msg.title}
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            {msg.body}
          </Typography>
          <Button
            variant="contained"
            color="success"
            href="https://wa.me/919344010001"
            target="_blank"
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            Contact us on WhatsApp
          </Button>
        </Paper>
      </Container>
    );
  }

  if (step === 'redirecting') {
    return (
      <Container maxWidth="sm" sx={{ py: 8 }}>
        <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
          <CircularProgress sx={{ mb: 2 }} />
          <Typography variant="body1">Taking you to the payment page...</Typography>
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ py: 6, minHeight: '80vh' }}>
      <Paper sx={{ p: { xs: 3, sm: 4 }, borderRadius: 2 }}>
        {/* Header */}
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              bgcolor: 'primary.light',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mx: 'auto',
              mb: 2,
            }}
          >
            {step === 'phone' ? (
              <PhoneIcon sx={{ color: 'primary.main', fontSize: 28 }} />
            ) : (
              <LockIcon sx={{ color: 'primary.main', fontSize: 28 }} />
            )}
          </Box>
          <Typography variant="h5" fontWeight={700} gutterBottom>
            {step === 'phone' ? 'Verify your phone' : 'Enter OTP'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {step === 'phone'
              ? 'We will send a one-time password to verify your identity.'
              : `Enter the 6-digit OTP sent to ${maskedPhone}.`}
          </Typography>
        </Box>

        {/* Phone step */}
        {step === 'phone' && (
          <Box>
            <Box
              sx={{
                bgcolor: 'grey.50',
                border: '1px solid',
                borderColor: 'grey.200',
                borderRadius: 1,
                px: 2,
                py: 1.5,
                mb: 3,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <PhoneIcon sx={{ color: 'text.secondary', fontSize: 18 }} />
              <Typography variant="body1" fontWeight={500}>
                {maskedPhone ?? 'Phone number not found'}
              </Typography>
            </Box>

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            {/* Invisible reCAPTCHA container */}
            <div id="recaptcha-container" />

            <Button
              variant="contained"
              fullWidth
              size="large"
              onClick={handleSendOtp}
              disabled={loading || !maskedPhone}
              sx={{ textTransform: 'none', fontWeight: 600, py: 1.5, borderRadius: 1.5 }}
            >
              {loading ? <CircularProgress size={22} color="inherit" /> : 'Send OTP'}
            </Button>
          </Box>
        )}

        {/* OTP step */}
        {step === 'otp' && (
          <Box>
            <TextField
              fullWidth
              label="6-digit OTP"
              value={otp}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                setOtp(val);
              }}
              inputProps={{
                inputMode: 'numeric',
                maxLength: 6,
                style: { fontSize: 24, letterSpacing: 8, textAlign: 'center' },
              }}
              sx={{ mb: 2 }}
              autoFocus
            />

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <Button
              variant="contained"
              fullWidth
              size="large"
              onClick={handleVerifyOtp}
              disabled={loading || otp.length !== 6}
              sx={{ textTransform: 'none', fontWeight: 600, py: 1.5, borderRadius: 1.5 }}
            >
              {loading ? <CircularProgress size={22} color="inherit" /> : 'Verify and Continue'}
            </Button>

            <Button
              fullWidth
              sx={{ mt: 1.5, textTransform: 'none', color: 'text.secondary' }}
              onClick={() => {
                setOtp('');
                setError(null);
                setStep('phone');
              }}
            >
              Resend OTP
            </Button>
          </Box>
        )}
      </Paper>
    </Container>
  );
}

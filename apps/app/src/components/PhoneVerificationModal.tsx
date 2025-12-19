'use client';

import { useState } from 'react';
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
} from '@neram/ui';

interface PhoneVerificationModalProps {
  open: boolean;
  onVerified: () => void;
}

export default function PhoneVerificationModal({
  open,
  onVerified,
}: PhoneVerificationModalProps) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSendOtp = async () => {
    if (phoneNumber.length !== 10) {
      setError('Please enter a valid 10-digit phone number');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // TODO: Implement Firebase Phone Auth
      // const appVerifier = new RecaptchaVerifier('recaptcha-container', {}, auth);
      // const confirmationResult = await signInWithPhoneNumber(auth, `+91${phoneNumber}`, appVerifier);

      // Mock implementation for now
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setOtpSent(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) {
      setError('Please enter a valid 6-digit OTP');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // TODO: Implement OTP verification
      // await confirmationResult.confirm(otp);

      // Mock implementation for now
      await new Promise((resolve) => setTimeout(resolve, 1000));
      onVerified();
    } catch (err: any) {
      setError(err.message || 'Invalid OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      maxWidth="sm"
      fullWidth
      disableEscapeKeyDown
      sx={{
        '& .MuiDialog-paper': {
          borderRadius: 2,
        },
      }}
    >
      <DialogTitle>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          Verify Your Phone Number
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 2 }}>
          <Alert severity="info" sx={{ mb: 3 }}>
            Please verify your phone number to access all features. This is required for
            security purposes.
          </Alert>

          {!otpSent ? (
            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Enter your 10-digit mobile number
              </Typography>
              <TextField
                fullWidth
                label="Phone Number"
                placeholder="Enter your phone number"
                value={phoneNumber}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 10);
                  setPhoneNumber(value);
                  setError('');
                }}
                inputProps={{
                  inputMode: 'numeric',
                  pattern: '[0-9]*',
                }}
                sx={{ mt: 1 }}
                autoFocus
              />
              <div id="recaptcha-container"></div>
            </Box>
          ) : (
            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Enter the 6-digit OTP sent to +91 {phoneNumber}
              </Typography>
              <TextField
                fullWidth
                label="OTP"
                placeholder="Enter 6-digit OTP"
                value={otp}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setOtp(value);
                  setError('');
                }}
                inputProps={{
                  inputMode: 'numeric',
                  pattern: '[0-9]*',
                }}
                sx={{ mt: 1 }}
                autoFocus
              />
              <Button
                variant="text"
                size="small"
                onClick={() => {
                  setOtpSent(false);
                  setOtp('');
                }}
                sx={{ mt: 1 }}
              >
                Change Phone Number
              </Button>
            </Box>
          )}

          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        {!otpSent ? (
          <Button
            variant="contained"
            fullWidth
            size="large"
            onClick={handleSendOtp}
            disabled={loading || phoneNumber.length !== 10}
          >
            {loading ? 'Sending...' : 'Send OTP'}
          </Button>
        ) : (
          <Button
            variant="contained"
            fullWidth
            size="large"
            onClick={handleVerifyOtp}
            disabled={loading || otp.length !== 6}
          >
            {loading ? 'Verifying...' : 'Verify OTP'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

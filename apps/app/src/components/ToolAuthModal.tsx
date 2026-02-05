'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Button,
  TextField,
  Typography,
  Alert,
  Divider,
  CircularProgress,
  IconButton,
} from '@neram/ui';
import { useFirebaseAuth } from '@neram/auth';

interface ToolAuthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  title?: string;
  description?: string;
}

export default function ToolAuthModal({
  open,
  onClose,
  onSuccess,
  title = 'Sign up to see your results',
  description = 'Create a free account to access your personalized results',
}: ToolAuthModalProps) {
  const { signInWithGoogle, signInWithEmail, createAccount } = useFirebaseAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(true); // Default to sign up for new users
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      await signInWithGoogle();
      onSuccess?.();
    } catch (err: any) {
      setError(err.message || 'Failed to sign in with Google');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isSignUp) {
        await createAccount(email, password);
      } else {
        await signInWithEmail(email, password);
      }
      onSuccess?.();
    } catch (err: any) {
      setError(err.message || `Failed to ${isSignUp ? 'sign up' : 'sign in'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { borderRadius: 2 },
      }}
    >
      <DialogTitle sx={{ pb: 0 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 600 }}>
              {title}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {description}
            </Typography>
          </Box>
          <IconButton onClick={onClose} size="small" sx={{ mt: -1, mr: -1 }}>
            ✕
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ pt: 2 }}>
          {/* Google Sign In - Primary CTA */}
          <Button
            fullWidth
            variant="contained"
            size="large"
            onClick={handleGoogleSignIn}
            disabled={loading}
            sx={{
              py: 1.5,
              textTransform: 'none',
              fontSize: '1rem',
              mb: 2,
            }}
          >
            {loading ? (
              <CircularProgress size={24} color="inherit" />
            ) : (
              <>
                <Box
                  component="span"
                  sx={{
                    width: 20,
                    height: 20,
                    mr: 2,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: 'white',
                    borderRadius: '50%',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    color: '#4285F4',
                  }}
                >
                  G
                </Box>
                Continue with Google
              </>
            )}
          </Button>

          <Divider sx={{ my: 2 }}>
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
              size="small"
              sx={{ mb: 2 }}
              autoComplete="email"
            />
            <TextField
              fullWidth
              type="password"
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              size="small"
              sx={{ mb: 2 }}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              inputProps={{ minLength: 6 }}
              helperText={isSignUp ? 'Minimum 6 characters' : undefined}
            />

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <Button
              fullWidth
              type="submit"
              variant="outlined"
              size="large"
              disabled={loading}
              sx={{ py: 1.25 }}
            >
              {loading ? (
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
              onClick={() => setIsSignUp(!isSignUp)}
              sx={{ textTransform: 'none' }}
            >
              {isSignUp
                ? 'Already have an account? Sign In'
                : "Don't have an account? Sign Up"}
            </Button>
          </Box>

          {/* Benefits */}
          <Box
            sx={{
              mt: 3,
              pt: 2,
              borderTop: 1,
              borderColor: 'divider',
            }}
          >
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, fontWeight: 500 }}>
              Why create an account?
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {[
                { icon: '📊', text: 'Save your results and track progress' },
                { icon: '🔔', text: 'Get notified about exam updates' },
                { icon: '🎁', text: 'Unlock exclusive discounts on courses' },
              ].map((benefit) => (
                <Box key={benefit.text} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <span style={{ fontSize: '1rem' }}>{benefit.icon}</span>
                  <Typography variant="body2" color="text.secondary">
                    {benefit.text}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>

          {/* Terms */}
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', mt: 2, textAlign: 'center' }}
          >
            By signing up, you agree to our Terms of Service and Privacy Policy
          </Typography>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

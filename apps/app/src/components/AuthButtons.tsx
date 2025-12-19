'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Button,
  TextField,
  Typography,
  Alert,
  Divider,
  CircularProgress,
} from '@neram/ui';
import { useFirebaseAuth } from '@neram/auth';

export default function AuthButtons() {
  const { signInWithGoogle, signInWithEmail, createAccount } = useFirebaseAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      await signInWithGoogle();
      router.push('/dashboard');
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
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || `Failed to ${isSignUp ? 'sign up' : 'sign in'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      {/* Google Sign In */}
      <Button
        fullWidth
        variant="outlined"
        size="large"
        onClick={handleGoogleSignIn}
        disabled={loading}
        sx={{
          py: 1.5,
          textTransform: 'none',
          fontSize: '1rem',
          borderColor: '#dadce0',
          color: '#3c4043',
          '&:hover': {
            borderColor: '#d2d2d2',
            bgcolor: '#f8f9fa',
          },
        }}
      >
        {loading ? (
          <CircularProgress size={24} />
        ) : (
          <>
            <Box
              component="span"
              sx={{
                width: 20,
                height: 20,
                mr: 2,
                display: 'inline-block',
              }}
            >
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
          inputProps={{ minLength: 6 }}
        />

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Button
          fullWidth
          type="submit"
          variant="contained"
          size="large"
          disabled={loading}
          sx={{ py: 1.5 }}
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

      {!isSignUp && (
        <Box sx={{ mt: 1, textAlign: 'center' }}>
          <Button
            variant="text"
            size="small"
            sx={{ textTransform: 'none', fontSize: '0.875rem' }}
          >
            Forgot Password?
          </Button>
        </Box>
      )}
    </Box>
  );
}

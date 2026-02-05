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
import { useFirebaseAuth, getAuthRedirectUrl, clearAuthRedirectUrl, getFirebaseAuth, signInWithGoogleYouTube } from '@neram/auth';

// Storage key for YouTube subscribe intent
const YOUTUBE_SUBSCRIBE_KEY = 'neram_youtube_subscribe_intent';

interface AuthButtonsProps {
  isYouTubeSubscribe?: boolean;
}

/**
 * Handle post-authentication redirect for YouTube subscribe flow
 * Uses the access token from Firebase Google sign-in to subscribe directly,
 * then redirects back to marketing site with coupon and auth token.
 */
async function handleYouTubeSubscribeRedirect(accessToken: string | null) {
  // Get the stored redirect URL
  const stored = sessionStorage.getItem(YOUTUBE_SUBSCRIBE_KEY);
  let redirectUrl = '';

  if (stored) {
    try {
      const data = JSON.parse(stored);
      redirectUrl = data.redirectUrl;
    } catch {
      // Ignore parse errors
    }
    sessionStorage.removeItem(YOUTUBE_SUBSCRIBE_KEY);
  }

  // If we don't have an access token, we can't proceed
  if (!accessToken) {
    console.error('No YouTube access token available');
    window.location.href = redirectUrl || '/dashboard';
    return;
  }

  try {
    // Get the Firebase ID token for server verification
    const auth = getFirebaseAuth();
    const user = auth.currentUser;
    if (!user) {
      console.error('No Firebase user found');
      window.location.href = redirectUrl || '/dashboard';
      return;
    }

    const idToken = await user.getIdToken();

    // Call the direct subscribe endpoint that handles:
    // 1. YouTube subscription
    // 2. Coupon generation
    // 3. Firebase custom token for cross-domain auth
    const response = await fetch('/api/youtube/subscribe-direct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idToken,
        accessToken,
        redirectUrl,
      }),
    });

    const result = await response.json();

    if (result.success && result.redirectUrl) {
      // Redirect to marketing site with coupon and auth token
      window.location.href = result.redirectUrl;
      return;
    }

    // Handle error
    console.error('YouTube subscription failed:', result.error);
    const errorUrl = new URL(redirectUrl || '/dashboard');
    errorUrl.searchParams.set('error', result.error || 'Subscription failed');
    window.location.href = errorUrl.toString();
  } catch (error) {
    console.error('Error during YouTube subscription:', error);
    window.location.href = redirectUrl || '/dashboard';
  }
}

/**
 * Handle post-authentication redirect
 *
 * Flow:
 * 1. After login, check if there's a pending cross-domain redirect
 * 2. If yes, immediately redirect back to marketing site with auth token
 *    (phone verification will happen on marketing site)
 * 3. If no redirect URL, go to dashboard normally
 *    (phone verification will happen on tools-app)
 */
async function handlePostAuthRedirect(router: ReturnType<typeof useRouter>) {
  const redirectUrl = getAuthRedirectUrl();

  if (redirectUrl) {
    // IMMEDIATE redirect - don't show dashboard
    try {
      const auth = getFirebaseAuth();
      const user = auth.currentUser;
      if (user) {
        const idToken = await user.getIdToken();

        // Call exchange-token API to get custom token
        const response = await fetch('/api/auth/exchange-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        });

        if (response.ok) {
          const { customToken } = await response.json();
          clearAuthRedirectUrl();

          // Redirect to marketing site with custom token
          const url = new URL(redirectUrl);
          url.searchParams.set('authToken', customToken);
          window.location.href = url.toString();
          return;
        }
      }
    } catch (error) {
      console.error('Error during cross-domain redirect:', error);
    }
  }

  // No redirect URL or error - go to dashboard normally
  router.push('/dashboard');
}

export default function AuthButtons({ isYouTubeSubscribe = false }: AuthButtonsProps) {
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
      if (isYouTubeSubscribe) {
        // Use YouTube-enabled Google sign-in
        const { accessToken } = await signInWithGoogleYouTube();
        await handleYouTubeSubscribeRedirect(accessToken);
      } else {
        // Regular Google sign-in
        await signInWithGoogle();
        await handlePostAuthRedirect(router);
      }
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
      await handlePostAuthRedirect(router);
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
        variant={isYouTubeSubscribe ? 'contained' : 'outlined'}
        size="large"
        onClick={handleGoogleSignIn}
        disabled={loading}
        sx={{
          py: 1.5,
          textTransform: 'none',
          fontSize: '1rem',
          ...(isYouTubeSubscribe
            ? {
                bgcolor: '#FF0000',
                color: 'white',
                '&:hover': {
                  bgcolor: '#CC0000',
                },
              }
            : {
                borderColor: '#dadce0',
                color: '#3c4043',
                '&:hover': {
                  borderColor: '#d2d2d2',
                  bgcolor: '#f8f9fa',
                },
              }),
        }}
      >
        {loading ? (
          <CircularProgress size={24} color={isYouTubeSubscribe ? 'inherit' : 'primary'} />
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
              {isYouTubeSubscribe ? (
                <svg viewBox="0 0 24 24" style={{ width: 20, height: 20, fill: 'currentColor' }}>
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
              ) : (
                'G'
              )}
            </Box>
            {isYouTubeSubscribe ? 'Subscribe with Google' : 'Continue with Google'}
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

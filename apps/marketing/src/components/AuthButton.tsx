'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Button,
  Avatar,
  Menu,
  MenuItem,
  Box,
  Typography,
  Divider,
  CircularProgress,
} from '@neram/ui';
import { useFirebaseAuth, firebaseSignOut, getFirebaseAuth } from '@neram/auth';
import { signInWithCustomToken } from 'firebase/auth';

// Auth app URL - uses NEXT_PUBLIC_APP_URL from environment
// Development: http://localhost:3001, Production: https://app.neramclasses.com
const AUTH_APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';

// Inner component that uses useSearchParams
function AuthButtonInner() {
  const { user, loading } = useFirebaseAuth();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();

  // Handle custom token from cross-domain auth
  useEffect(() => {
    const authToken = searchParams.get('authToken');
    if (authToken && !user && !loading && !signingIn) {
      setSigningIn(true);
      const auth = getFirebaseAuth();
      signInWithCustomToken(auth, authToken)
        .then(() => {
          // Remove authToken from URL without refresh
          const url = new URL(window.location.href);
          url.searchParams.delete('authToken');
          window.history.replaceState({}, '', url.toString());
        })
        .catch((error: Error) => {
          console.error('Error signing in with custom token:', error);
        })
        .finally(() => {
          setSigningIn(false);
        });
    }
  }, [searchParams, user, loading, signingIn]);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogin = () => {
    // Redirect to auth app with return URL
    // Note: (auth) is a route group in Next.js - the URL is /login, not /auth/login
    const returnUrl = encodeURIComponent(window.location.href);
    window.location.href = `${AUTH_APP_URL}/login?redirect=${returnUrl}`;
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await firebaseSignOut();
      handleMenuClose();
      // Refresh the page to clear any cached auth state
      window.location.reload();
    } catch (error) {
      console.error('Sign out error:', error);
    } finally {
      setSigningOut(false);
    }
  };

  const handleGoToApp = () => {
    window.location.href = AUTH_APP_URL;
  };

  // Loading state
  if (loading || signingIn) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', ml: 2 }}>
        <CircularProgress size={24} color="inherit" />
      </Box>
    );
  }

  // Not authenticated - show login button
  if (!user) {
    return (
      <Button
        variant="outlined"
        onClick={handleLogin}
        sx={{
          ml: 2,
          color: 'inherit',
          borderColor: 'rgba(255, 255, 255, 0.5)',
          '&:hover': {
            borderColor: 'white',
            bgcolor: 'rgba(255, 255, 255, 0.1)',
          },
        }}
      >
        Login
      </Button>
    );
  }

  // Authenticated - show avatar menu
  return (
    <Box sx={{ ml: 2 }}>
      <Avatar
        src={user.avatar || undefined}
        alt={user.name || user.email || 'User'}
        onClick={handleMenuOpen}
        sx={{
          cursor: 'pointer',
          width: 36,
          height: 36,
          bgcolor: 'secondary.main',
          '&:hover': {
            boxShadow: 2,
          },
        }}
      >
        {user.name?.[0] || user.email?.[0] || 'U'}
      </Avatar>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        PaperProps={{
          sx: { minWidth: 200, mt: 1 },
        }}
      >
        {/* User Info */}
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant="subtitle2" noWrap>
            {user.name || 'User'}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {user.email}
          </Typography>
        </Box>
        <Divider />

        {/* Menu Items */}
        <MenuItem onClick={handleGoToApp}>
          Go to App
        </MenuItem>
        <MenuItem onClick={handleSignOut} disabled={signingOut}>
          {signingOut ? 'Signing out...' : 'Sign Out'}
        </MenuItem>
      </Menu>
    </Box>
  );
}

// Wrapper component with Suspense boundary for useSearchParams
export default function AuthButton() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: 'flex', alignItems: 'center', ml: 2 }}>
          <CircularProgress size={24} color="inherit" />
        </Box>
      }
    >
      <AuthButtonInner />
    </Suspense>
  );
}

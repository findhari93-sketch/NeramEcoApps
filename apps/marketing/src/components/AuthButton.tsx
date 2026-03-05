'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Button,
  Avatar,
  Menu,
  MenuItem,
  Box,
  Typography,
  Divider,
  CircularProgress,
  LoginModal,
  Dialog,
  DialogTitle,
  DialogContent,
  LanguageIcon,
  ListItemIcon,
} from '@neram/ui';
import { useFirebaseAuth, firebaseSignOut, signInWithCustomToken } from '@neram/auth';
import { useGoToApp } from '@/hooks/useGoToApp';
import { usePathname, useRouter } from '@/i18n/routing';
import { useParams } from 'next/navigation';
import { locales, localeLabels, type Locale } from '@/i18n';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3011';

// Inner component that uses useSearchParams
function AuthButtonInner() {
  const { user, loading } = useFirebaseAuth();
  const { goToApp } = useGoToApp();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [langDialogOpen, setLangDialogOpen] = useState(false);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as Locale;

  // Handle custom token from cross-domain auth (backward compatibility)
  useEffect(() => {
    const authToken = searchParams.get('authToken');
    if (authToken && !user && !loading && !signingIn) {
      setSigningIn(true);
      signInWithCustomToken(authToken)
        .then(() => {
          // Remove authToken from URL without refresh
          const url = new URL(window.location.href);
          url.searchParams.delete('authToken');
          window.history.replaceState({}, '', url.toString());
        })
        .catch((error: Error) => {
          console.error('Error signing in with custom token:', error);
          // Remove authToken from URL to prevent retry loop
          const url = new URL(window.location.href);
          url.searchParams.delete('authToken');
          window.history.replaceState({}, '', url.toString());
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
    setLoginModalOpen(true);
  };

  const handleLoginModalClose = () => {
    setLoginModalOpen(false);
  };

  const handleAuthenticated = () => {
    setLoginModalOpen(false);
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await firebaseSignOut();
      handleMenuClose();
      // Clear SSO flag so next visit to tools app retries SSO
      try { sessionStorage.removeItem('neram_sso_attempted'); } catch {}
      // Sign out tools app via hidden iframe
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = `${APP_URL}/auth/signout`;
      document.body.appendChild(iframe);
      // Give iframe time to sign out, then reload
      setTimeout(() => {
        iframe.remove();
        window.location.reload();
      }, 500);
    } catch (error) {
      console.error('Sign out error:', error);
      window.location.reload();
    } finally {
      setSigningOut(false);
    }
  };

  const handleGoToApp = () => {
    handleMenuClose();
    goToApp();
  };

  const handleOpenLangDialog = () => {
    handleMenuClose();
    setLangDialogOpen(true);
  };

  const handleLocaleChange = (newLocale: Locale) => {
    router.replace(pathname, { locale: newLocale });
    setLangDialogOpen(false);
  };

  // Loading state
  if (loading || signingIn) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', ml: 2 }}>
        <CircularProgress size={24} color="inherit" />
      </Box>
    );
  }

  // Not authenticated - show login button + modal
  if (!user) {
    return (
      <>
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
        <LoginModal
          open={loginModalOpen}
          onClose={handleLoginModalClose}
          allowClose={true}
          onAuthenticated={handleAuthenticated}
          apiBaseUrl={APP_URL}
        />
      </>
    );
  }

  // Authenticated - show avatar menu
  return (
    <Box sx={{ ml: 2 }}>
      <Avatar
        src={user.avatar || undefined}
        alt={user.name || user.email || 'User'}
        imgProps={{ referrerPolicy: 'no-referrer' }}
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
        disableScrollLock
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
        <MenuItem onClick={handleOpenLangDialog}>
          <ListItemIcon sx={{ minWidth: 28 }}>
            <LanguageIcon fontSize="small" />
          </ListItemIcon>
          Change Language
        </MenuItem>
        <MenuItem onClick={handleSignOut} disabled={signingOut}>
          {signingOut ? 'Signing out...' : 'Sign Out'}
        </MenuItem>
      </Menu>

      {/* Language Dialog */}
      <Dialog
        open={langDialogOpen}
        onClose={() => setLangDialogOpen(false)}
        PaperProps={{ sx: { minWidth: 280, borderRadius: 2 } }}
      >
        <DialogTitle sx={{ pb: 1 }}>Change Language</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1, pt: '8px !important' }}>
          {locales.map((loc) => (
            <Button
              key={loc}
              variant={loc === locale ? 'contained' : 'outlined'}
              fullWidth
              onClick={() => handleLocaleChange(loc)}
              sx={{
                textTransform: 'none',
                justifyContent: 'flex-start',
                px: 2,
                py: 1,
                borderRadius: '8px',
              }}
            >
              {localeLabels[loc]}
            </Button>
          ))}
        </DialogContent>
      </Dialog>
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

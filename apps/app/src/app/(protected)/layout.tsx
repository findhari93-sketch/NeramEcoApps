'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Avatar,
  Menu,
  MenuItem,
  Container,
  Button,
  LoginModal,
} from '@neram/ui';
import { useFirebaseAuth, getFirebaseAuth } from '@neram/auth';
import { useSSOToken } from '@/hooks/useSSOToken';
import { OnboardingWizard } from '@/components/onboarding';
import Link from 'next/link';

const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL || 'http://localhost:3010';

// Icons (using text fallbacks for now)
const MenuIcon = () => <span>☰</span>;
const DashboardIcon = () => <span>📊</span>;
const CalculatorIcon = () => <span>🔢</span>;
const SchoolIcon = () => <span>🏫</span>;
const LocationIcon = () => <span>📍</span>;
const FormIcon = () => <span>📝</span>;
const ProfileIcon = () => <span>👤</span>;
const ApplicationsIcon = () => <span>📄</span>;

const menuItems = [
  { title: 'Dashboard', href: '/dashboard', icon: <DashboardIcon /> },
  { title: 'My Applications', href: '/my-applications', icon: <ApplicationsIcon /> },
  { title: 'Cutoff Calculator', href: '/tools/cutoff-calculator', icon: <CalculatorIcon /> },
  { title: 'College Predictor', href: '/tools/college-predictor', icon: <SchoolIcon /> },
  { title: 'Exam Centers', href: '/tools/exam-centers', icon: <LocationIcon /> },
  { title: 'Apply Now', href: '/apply', icon: <FormIcon /> },
  { title: 'Profile', href: '/profile', icon: <ProfileIcon /> },
];

// Supabase user type from API response
interface SupabaseUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  phone_verified: boolean;
  email_verified: boolean;
  user_type: string;
  status: string;
  onboarding_completed: boolean;
}

function ProtectedLayoutInner({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, signOut } = useFirebaseAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [checkingUser, setCheckingUser] = useState(true);
  const [registrationError, setRegistrationError] = useState(false);
  const [idToken, setIdToken] = useState<string | null>(null);
  const sso = useSSOToken();

  // Redirect to login if not authenticated (skip if SSO is processing)
  useEffect(() => {
    if (!loading && !user && !sso.processing && !sso.error) {
      router.push('/login');
    }
  }, [user, loading, router, sso.processing, sso.error]);

  // Register/check user in Supabase when Firebase user is available
  useEffect(() => {
    async function registerUser() {
      if (!user || loading) return;

      try {
        setRegistrationError(false);
        const auth = getFirebaseAuth();
        const currentUser = auth.currentUser;
        if (!currentUser) return;

        const idToken = await currentUser.getIdToken();

        const response = await fetch('/api/auth/register-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        });

        if (response.ok) {
          const { user: dbUser } = await response.json();
          setSupabaseUser(dbUser);
          setPhoneVerified(dbUser.phone_verified);
          setOnboardingCompleted(dbUser.onboarding_completed ?? false);
          setIdToken(idToken);
        } else {
          console.error('Register user failed:', response.status);
          setRegistrationError(true);
        }
      } catch (error) {
        console.error('Error registering user:', error);
        setRegistrationError(true);
      } finally {
        setCheckingUser(false);
      }
    }

    registerUser();
  }, [user, loading]);

  const handleRetryRegistration = async () => {
    setCheckingUser(true);
    setRegistrationError(false);

    try {
      const auth = getFirebaseAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const idToken = await currentUser.getIdToken(true); // Force refresh token

      const response = await fetch('/api/auth/register-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      if (response.ok) {
        const { user: dbUser } = await response.json();
        setSupabaseUser(dbUser);
        setPhoneVerified(dbUser.phone_verified);
        setOnboardingCompleted(dbUser.onboarding_completed ?? false);
        setIdToken(idToken);
      } else {
        console.error('Retry register user failed:', response.status);
        setRegistrationError(true);
      }
    } catch (error) {
      console.error('Error retrying registration:', error);
      setRegistrationError(true);
    } finally {
      setCheckingUser(false);
    }
  };

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleProfileMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleProfileMenuClose = () => {
    setAnchorEl(null);
  };

  const handleSignOut = async () => {
    handleProfileMenuClose();
    await signOut();

    // Sign out marketing app via hidden iframe, wait for completion
    await new Promise<void>((resolve) => {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = `${MARKETING_URL}/signout`;
      document.body.appendChild(iframe);

      const onMessage = (event: MessageEvent) => {
        if (event.data?.type === 'neram_signed_out') {
          window.removeEventListener('message', onMessage);
          iframe.remove();
          resolve();
        }
      };
      window.addEventListener('message', onMessage);

      // Fallback timeout in case the message is never received
      setTimeout(() => {
        window.removeEventListener('message', onMessage);
        iframe.remove();
        resolve();
      }, 2000);
    });

    // Clear SSO flag so future visits to / can auto-SSO from marketing
    try { sessionStorage.removeItem('neram_sso_attempted'); } catch {}

    // Navigate to login with signedOut param to skip auto-SSO for this navigation only
    router.push('/login?signedOut=true');
  };

  const handlePhoneVerified = async () => {
    setPhoneVerified(true);

    // Re-fetch user data from Supabase to update state with verified phone
    try {
      const auth = getFirebaseAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const idToken = await currentUser.getIdToken(true);
      const response = await fetch('/api/auth/register-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      if (response.ok) {
        const { user: dbUser } = await response.json();
        setSupabaseUser(dbUser);
      }
    } catch (error) {
      console.error('Error refreshing user data after phone verification:', error);
    }
  };

  if (loading || (checkingUser && !!user) || sso.processing) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
        }}
      >
        <Typography>Loading...</Typography>
      </Box>
    );
  }

  if (sso.error) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          gap: 2,
          p: 3,
          textAlign: 'center',
        }}
      >
        <Typography variant="h6" color="error">
          Sign-in Failed
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Automatic sign-in didn&apos;t work. Please log in directly.
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
          <Button
            variant="contained"
            onClick={() => router.push('/login')}
            sx={{ minHeight: 48, px: 3 }}
          >
            Login
          </Button>
          <Button
            variant="outlined"
            onClick={sso.retrySSO}
            sx={{ minHeight: 48, px: 3 }}
          >
            Retry
          </Button>
        </Box>
      </Box>
    );
  }

  if (!user) {
    return null;
  }

  if (registrationError) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          gap: 2,
          p: 3,
          textAlign: 'center',
        }}
      >
        <Typography variant="h6">Something went wrong</Typography>
        <Typography variant="body2" color="text.secondary">
          We couldn&apos;t connect to our servers. Please try again.
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
          <Button
            variant="contained"
            onClick={handleRetryRegistration}
            sx={{ minHeight: 48, px: 3 }}
          >
            Retry
          </Button>
          <Button
            variant="outlined"
            onClick={async () => {
              await signOut();
              router.push('/');
            }}
            sx={{ minHeight: 48, px: 3 }}
          >
            Sign Out
          </Button>
        </Box>
      </Box>
    );
  }

  const drawer = (
    <Box sx={{ pt: 2 }}>
      <Box sx={{ px: 2, mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Neram Tools
        </Typography>
      </Box>
      <List>
        {menuItems.map((item) => (
          <ListItem key={item.href} disablePadding>
            <ListItemButton
              component={Link}
              href={item.href}
              selected={pathname === item.href}
              onClick={() => setMobileOpen(false)}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.title} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* App Bar */}
      <AppBar
        position="fixed"
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Neram Classes
          </Typography>
          <IconButton onClick={handleProfileMenuOpen} sx={{ p: 0 }}>
            <Avatar
              alt={user.name || 'User'}
              src={user.avatar || undefined}
              sx={{ width: 32, height: 32 }}
            />
          </IconButton>
        </Toolbar>
      </AppBar>

      {/* Profile Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleProfileMenuClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
      >
        <MenuItem component={Link} href="/profile" onClick={handleProfileMenuClose}>
          Profile
        </MenuItem>
        <MenuItem onClick={handleSignOut}>Sign Out</MenuItem>
      </Menu>

      {/* Mobile Drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={handleDrawerToggle}
        ModalProps={{
          keepMounted: true, // Better mobile performance
        }}
        sx={{
          display: { xs: 'block', sm: 'none' },
          '& .MuiDrawer-paper': { boxSizing: 'border-box', width: 240 },
        }}
      >
        {drawer}
      </Drawer>

      {/* Desktop Drawer */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', sm: 'block' },
          width: 240,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            boxSizing: 'border-box',
            width: 240,
            mt: '64px',
          },
        }}
        open
      >
        {drawer}
      </Drawer>

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { sm: `calc(100% - 240px)` },
          mt: '64px',
        }}
      >
        <Container maxWidth="lg" sx={{ py: { xs: 2, md: 4 } }}>
          {children}
        </Container>
      </Box>

      {/* Phone Verification Modal */}
      {!phoneVerified && (
        <LoginModal
          open={!phoneVerified}
          allowClose={false}
          onAuthenticated={handlePhoneVerified}
          apiBaseUrl=""
          phoneOnly={true}
        />
      )}

      {/* Onboarding Wizard - shows after phone verification, before dashboard */}
      {phoneVerified && !onboardingCompleted && idToken && (
        <OnboardingWizard
          userToken={idToken}
          userName={user.name || undefined}
          sourceApp="app"
          onComplete={() => setOnboardingCompleted(true)}
          onSkip={() => setOnboardingCompleted(true)}
        />
      )}
    </Box>
  );
}

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '100vh',
          }}
        >
          <Typography>Loading...</Typography>
        </Box>
      }
    >
      <ProtectedLayoutInner>{children}</ProtectedLayoutInner>
    </Suspense>
  );
}

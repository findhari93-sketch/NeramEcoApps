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
  useScrollDirection,
  Collapse,
  Chip,
  Divider,
  ExpandMoreIcon,
  ExpandLessIcon,
} from '@neram/ui';
import { useFirebaseAuth, getFirebaseAuth } from '@neram/auth';
import { useSSOToken } from '@/hooks/useSSOToken';
import { OnboardingWizard } from '@/components/onboarding';
import UserNotificationBell from '@/components/UserNotificationBell';
import PendingEnrollmentBanner from '@/components/PendingEnrollmentBanner';
import Link from 'next/link';

const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL || 'http://localhost:3010';

// Icons (using text fallbacks for now)
const MenuIcon = () => <span>☰</span>;

// Navigation configuration
interface NavItem {
  title: string;
  href: string;
  icon: React.ReactNode;
  comingSoon?: boolean;
}

interface NavSection {
  id: string;
  title?: string;
  icon?: React.ReactNode;
  collapsible: boolean;
  items: NavItem[];
}

const navigationConfig: NavSection[] = [
  {
    id: 'general',
    collapsible: false,
    items: [
      { title: 'Dashboard', href: '/dashboard', icon: <span>📊</span> },
      { title: 'My Applications', href: '/my-applications', icon: <span>📄</span> },
      { title: 'Apply Now', href: '/apply', icon: <span>📝</span> },
    ],
  },
  {
    id: 'nata',
    title: 'NATA',
    icon: <span>🏛️</span>,
    collapsible: true,
    items: [
      { title: 'Exam Centers', href: '/tools/nata/exam-centers', icon: <span>📍</span> },
      { title: 'Cutoff Calculator', href: '/tools/nata/cutoff-calculator', icon: <span>🔢</span> },
      { title: 'College Predictor', href: '/tools/nata/college-predictor', icon: <span>🏫</span> },
      { title: 'Question Bank', href: '/tools/nata/question-bank', icon: <span>📚</span> },
      { title: 'Seat Matrix', href: '/tools/nata/seat-matrix', icon: <span>📊</span>, comingSoon: true },
      { title: 'College Reviews', href: '/tools/nata/college-reviews', icon: <span>⭐</span>, comingSoon: true },
      { title: 'Eligibility Checker', href: '/tools/nata/eligibility-checker', icon: <span>✅</span> },
      { title: 'Cost Calculator', href: '/tools/nata/cost-calculator', icon: <span>💰</span> },
      { title: 'Image Crop', href: '/tools/nata/image-crop', icon: <span>🖼️</span> },
    ],
  },
  {
    id: 'jee',
    title: 'JEE Paper 2',
    icon: <span>📐</span>,
    collapsible: true,
    items: [
      { title: 'Seat Matrix', href: '/tools/jee/seat-matrix', icon: <span>📊</span>, comingSoon: true },
      { title: 'Eligibility Checker', href: '/tools/jee/eligibility-checker', icon: <span>✅</span>, comingSoon: true },
      { title: 'Rank Predictor', href: '/tools/jee/rank-predictor', icon: <span>🎯</span>, comingSoon: true },
    ],
  },
  {
    id: 'bottom',
    collapsible: false,
    items: [
      { title: 'Support', href: '/support', icon: <span>🎫</span> },
      { title: 'Profile', href: '/profile', icon: <span>👤</span> },
      { title: 'Help', href: '/tools/help', icon: <span>❓</span> },
    ],
  },
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
  const { scrollDirection, isAtTop } = useScrollDirection();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
    // Auto-expand section matching current path
    const initial: Record<string, boolean> = { nata: true, jee: false };
    for (const section of navigationConfig) {
      if (section.collapsible && section.items.some(item => pathname.startsWith(item.href))) {
        initial[section.id] = true;
      }
    }
    return initial;
  });
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

  const isItemActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  const renderNavItem = (item: NavItem) => (
    <ListItem key={item.href} disablePadding>
      <ListItemButton
        component={Link}
        href={item.href}
        selected={isItemActive(item.href)}
        onClick={() => setMobileOpen(false)}
        sx={{ pl: 4, minHeight: 44 }}
      >
        <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
        <ListItemText
          primary={item.title}
          primaryTypographyProps={{
            fontSize: '0.875rem',
            color: item.comingSoon ? 'text.disabled' : 'text.primary',
          }}
        />
        {item.comingSoon && (
          <Chip label="Soon" size="small" sx={{ height: 20, fontSize: '0.65rem' }} />
        )}
      </ListItemButton>
    </ListItem>
  );

  const drawer = (
    <Box sx={{ pt: 1, overflowY: 'auto' }}>
      {navigationConfig.map((section, index) => (
        <Box key={section.id}>
          {/* Divider between General/NATA and JEE/Bottom */}
          {(section.id === 'nata' || section.id === 'bottom') && <Divider sx={{ my: 0.5 }} />}

          {section.collapsible ? (
            <>
              <ListItem disablePadding>
                <ListItemButton
                  onClick={() => toggleSection(section.id)}
                  sx={{ minHeight: 48 }}
                >
                  {section.icon && <ListItemIcon sx={{ minWidth: 36 }}>{section.icon}</ListItemIcon>}
                  <ListItemText
                    primary={section.title}
                    primaryTypographyProps={{ fontWeight: 600, fontSize: '0.9rem' }}
                  />
                  {expandedSections[section.id] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </ListItemButton>
              </ListItem>
              <Collapse in={expandedSections[section.id]} timeout="auto" unmountOnExit>
                <List disablePadding>
                  {section.items.map(renderNavItem)}
                </List>
              </Collapse>
            </>
          ) : (
            <List disablePadding>
              {section.items.map((item) => (
                <ListItem key={item.href} disablePadding>
                  <ListItemButton
                    component={Link}
                    href={item.href}
                    selected={isItemActive(item.href)}
                    onClick={() => setMobileOpen(false)}
                    sx={{ minHeight: 48 }}
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
                    <ListItemText primary={item.title} primaryTypographyProps={{ fontSize: '0.875rem' }} />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </Box>
      ))}
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* App Bar */}
      <AppBar
        position="fixed"
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          transform: scrollDirection === 'down' && !isAtTop && !mobileOpen
            ? 'translateY(-100%)'
            : 'translateY(0)',
          transition: 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)',
          '@media (prefers-reduced-motion: reduce)': {
            transition: 'none',
          },
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
          {phoneVerified && <UserNotificationBell />}
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
          {phoneVerified && onboardingCompleted && <PendingEnrollmentBanner />}
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

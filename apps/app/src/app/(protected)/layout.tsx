'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Box, Typography, Button, LoginModal } from '@neram/ui';
import { useFirebaseAuth, getFirebaseAuth } from '@neram/auth';
import { useSSOToken } from '@/hooks/useSSOToken';
import { OnboardingWizard } from '@/components/onboarding';
import AppShell from '@/components/shell/AppShell';

const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL || 'http://localhost:3010';

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

      const idToken = await currentUser.getIdToken(true);

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

  const handleSignOut = async () => {
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

      setTimeout(() => {
        window.removeEventListener('message', onMessage);
        iframe.remove();
        resolve();
      }, 2000);
    });

    try { sessionStorage.removeItem('neram_sso_attempted'); } catch {}
    router.push('/login?signedOut=true');
  };

  const handlePhoneVerified = async () => {
    setPhoneVerified(true);

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

  // Loading state
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

  // SSO error
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

  if (!user) return null;

  // Registration error
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

  return (
    <>
      <AppShell
        userName={user.name || 'Student'}
        userAvatar={user.avatar}
        userEmail={user.email}
        phoneVerified={phoneVerified}
        onboardingCompleted={onboardingCompleted}
        onSignOut={handleSignOut}
      >
        {children}
      </AppShell>

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

      {/* Onboarding Wizard */}
      {phoneVerified && !onboardingCompleted && idToken && (
        <OnboardingWizard
          userToken={idToken}
          userName={user.name || undefined}
          sourceApp="app"
          onComplete={() => setOnboardingCompleted(true)}
          onSkip={() => setOnboardingCompleted(true)}
        />
      )}
    </>
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

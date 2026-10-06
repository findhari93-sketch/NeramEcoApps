'use client';

/**
 * The signed-in student session: Supabase registration, phone verification,
 * onboarding, device and activity tracking, and the app shell around pages.
 *
 * mode="required" (dashboard, profile...): signed-out visitors go to /login
 * and come back to this page after signing in.
 * mode="optional" (public tool pages): never blocks rendering. Signed-out
 * visitors and crawlers get the page inside a light public header; signed-in
 * students get the full app shell around the same page.
 */

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Box, Typography, Button } from '@neram/ui';
import { useFirebaseAuth, getFirebaseAuth } from '@neram/auth';
import { useSSOToken } from '@/hooks/useSSOToken';
import { OnboardingWizard } from '@/components/onboarding';
import AppShell from '@/components/shell/AppShell';
import AppSplash from '@/components/shell/AppSplash';
import { readRegisteredUser, writeRegisteredUser, clearRegisteredUsers } from '@/lib/registered-user-cache';
import { GlobalErrorLogger } from '@/components/ErrorBoundary';
import ReportProblemFab from '@/components/ReportProblemFab';
import { ReporterAccessProvider } from '@/components/ReporterAccessContext';
import { installErrorCapture } from '@/lib/error-buffer';
import InstallPromptBanner from '@/components/InstallPromptBanner';
import PublicToolChrome from '@/components/shell/PublicToolChrome';
import { writeAuthHint } from '@/lib/auth-hint';
import { collectDeviceInfo, collectLocation } from '@/lib/device-collector';
import { useDeviceRegistration } from '@/hooks/useDeviceRegistration';
import { useActiveTimeTracker } from '@/hooks/useActiveTimeTracker';
import { trackFunnelEvent, trackFunnelEventImmediate, setFunnelTrackerToken } from '@/lib/funnel-tracker';

// Only phone-unverified students see this, so keep it out of every page's first load.
const LoginModal = dynamic(() => import('@neram/ui').then((m) => m.LoginModal), { ssr: false });

const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL || 'http://localhost:3010';

// Set when a user defers phone verification via the modal's "Skip for now".
// Lives in sessionStorage so it clears at session end and re-prompts next visit,
// while the DB keeps phone_verified=false (the captured lead is retained).
const PHONE_SKIP_KEY = 'phone_verification_skipped';

import type { AccountTier } from '@neram/database';

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
  account_tier: AccountTier;
  /** Set by /api/auth/register-user. Gates the "Report a problem" reporter. */
  is_enrolled_student?: boolean;
}

export type StudentSessionMode = 'required' | 'optional';

export default function StudentSession({
  mode,
  children,
}: {
  mode: StudentSessionMode;
  children: React.ReactNode;
}) {
  const { user, loading, signOut } = useFirebaseAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [phoneSkipped, setPhoneSkipped] = useState(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [checkingUser, setCheckingUser] = useState(true);
  const [registrationError, setRegistrationError] = useState(false);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [diagnosticSessionId, setDiagnosticSessionId] = useState<string | null>(null);
  const sso = useSSOToken();

  // Passively capture console/network errors for "Report a problem" tickets.
  useEffect(() => {
    installErrorCapture();
  }, []);

  // Device registration: auto-register current device on login
  const {
    deviceId: registeredDeviceId,
  } = useDeviceRegistration(idToken, !!supabaseUser);

  // Active time tracker: sends heartbeat every 60s
  useActiveTimeTracker({
    deviceId: registeredDeviceId,
    idToken,
    sessionId: diagnosticSessionId,
    enabled: !!registeredDeviceId && !!idToken,
  });

  // Pages that need an account send signed-out visitors to login (skip while
  // SSO is processing), and bring them back to this page once signed in.
  // The query is read from window, not useSearchParams, so this component
  // never forces a page to render client-side only.
  useEffect(() => {
    if (mode !== 'required') return;
    if (!loading && !user && !sso.processing && !sso.error) {
      const here = `${pathname}${window.location.search}`;
      router.push(pathname && pathname !== '/' ? `/login?redirect=${encodeURIComponent(here)}` : '/login');
    }
  }, [mode, user, loading, router, sso.processing, sso.error, pathname]);

  // Remember on this device whether someone is signed in, so a public tool
  // page can show the app frame instead of the public header on first paint.
  useEffect(() => {
    if (loading) return;
    writeAuthHint(!!user);
  }, [user, loading]);

  // Honor a same-session "Skip for now" so a user who deferred phone verification
  // is not re-blocked on every navigation within the session.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(PHONE_SKIP_KEY) === '1') setPhoneSkipped(true);
    } catch {
      // sessionStorage unavailable (e.g. privacy mode): just keep prompting.
    }
  }, []);

  // Register/check user in Supabase when Firebase user is available
  useEffect(() => {
    async function registerUser() {
      if (!user || loading) return;

      try {
        setRegistrationError(false);
        const auth = getFirebaseAuth();
        const currentUser = auth.currentUser;
        if (!currentUser) return;

        // Paint the shell from this tab's last confirmed profile, then
        // revalidate. A first visit has no cache and waits as before.
        cached = readRegisteredUser<SupabaseUser>(currentUser.uid);
        if (cached) {
          setSupabaseUser(cached);
          setPhoneVerified(cached.phone_verified);
          setOnboardingCompleted(cached.onboarding_completed ?? false);
          setCheckingUser(false);
        }

        const idToken = await currentUser.getIdToken();
        if (cached) {
          setIdToken(idToken);
          setFunnelTrackerToken(idToken);
        }

        const response = await fetch('/api/auth/register-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        });

        if (response.ok) {
          const { user: dbUser, isNewUser } = await response.json();
          setSupabaseUser(dbUser);
          setPhoneVerified(dbUser.phone_verified);
          setOnboardingCompleted(dbUser.onboarding_completed ?? false);
          setIdToken(idToken);
          setFunnelTrackerToken(idToken);
          writeRegisteredUser(currentUser.uid, dbUser);

          // Track phone screen shown if phone not yet verified
          if (!dbUser.phone_verified) {
            trackFunnelEvent({ funnel: 'auth', event: 'phone_screen_shown', status: 'started' });
          }

          // Fire Google Ads conversion for new registrations
          if (isNewUser && (window as any).gtag) {
            const adsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
            const signupLabel = process.env.NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL;
            if (adsId && signupLabel) {
              (window as any).gtag('event', 'conversion', {
                send_to: `${adsId}/${signupLabel}`,
              });
            }
          }
        } else {
          console.error('Register user failed:', response.status);
          // With a cached profile the student keeps working; the next load retries.
          if (!cached) setRegistrationError(true);
        }
      } catch (error) {
        console.error('Error registering user:', error);
        if (!cached) setRegistrationError(true);
      } finally {
        setCheckingUser(false);
      }
    }

    let cached: SupabaseUser | null = null;
    registerUser();
  }, [user, loading]);

  // Collect device info + location once per session after auth
  useEffect(() => {
    if (!idToken || !supabaseUser) return;

    const alreadyCollected = sessionStorage.getItem('neram_diagnostics_collected');
    if (alreadyCollected) return;

    async function collectAndSend() {
      try {
        sessionStorage.setItem('neram_diagnostics_collected', '1');
        const deviceInfo = collectDeviceInfo();
        const location = await collectLocation();

        const response = await fetch('/api/diagnostics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'session',
            idToken,
            ...deviceInfo,
            ...(location || {}),
            app_version: '1.0.0',
          }),
        });

        if (response.ok) {
          const { session_id } = await response.json();
          if (session_id) setDiagnosticSessionId(session_id);
        }
      } catch {
        // Diagnostics should never break the app
      }
    }

    collectAndSend();
  }, [idToken, supabaseUser]);


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
        writeRegisteredUser(currentUser.uid, dbUser);
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
    clearRegisteredUsers();
    await signOut();
    writeAuthHint(false);

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
    // Trust the DB, not an optimistic flag: re-fetch the user with a refreshed
    // token (now carrying the phone claim) and derive phoneVerified from the
    // authoritative response. This prevents a UI-vs-DB desync when the
    // verify-phone write fails silently.
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
        writeRegisteredUser(currentUser.uid, dbUser);
        if (!dbUser.phone_verified) {
          // OTP linked in Firebase but the DB write did not stick. Keep the
          // modal open and surface a recoverable error rather than letting the
          // user through with a false-positive verified state.
          setRegistrationError(true);
        }
      } else {
        console.error('Refresh after phone verification failed:', response.status);
        setRegistrationError(true);
      }
    } catch (error) {
      console.error('Error refreshing user data after phone verification:', error);
      setRegistrationError(true);
    }
  };

  // Public tool pages: render the page straight away for visitors and
  // crawlers. The demo inside swaps to the full tool once auth settles.
  if (mode === 'optional' && (loading || !user || sso.processing || sso.error)) {
    return <PublicToolChrome>{children}</PublicToolChrome>;
  }

  // Loading state
  if (loading || (checkingUser && !!user) || sso.processing) {
    return <AppSplash label={sso.processing ? 'Signing you in' : 'Loading aiArchitek'} />;
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
              clearRegisteredUsers();
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
    <ReporterAccessProvider canReport={supabaseUser?.is_enrolled_student === true}>
      {/* Global error/crash logger */}
      <GlobalErrorLogger idToken={idToken} sessionId={diagnosticSessionId} />

      {/* "Report a problem" button, enrolled students only */}
      <ReportProblemFab />

      <AppShell
        userName={user.name || 'Student'}
        userAvatar={user.avatar}
        userEmail={user.email}
        phoneVerified={phoneVerified}
        onboardingCompleted={onboardingCompleted}
        onSignOut={handleSignOut}
        accountTier={supabaseUser?.account_tier || 'visitor'}
      >
        {children}
      </AppShell>

      {/* Phone Verification Modal */}
      {!phoneVerified && !phoneSkipped && (
        <LoginModal
          open={!phoneVerified && !phoneSkipped}
          allowClose={false}
          onAuthenticated={handlePhoneVerified}
          apiBaseUrl=""
          phoneOnly={true}
          allowEscapeHatch
          maxAttemptsBeforeEscape={2}
          onGetHelp={() =>
            trackFunnelEventImmediate({ funnel: 'auth', event: 'phone_help_opened', status: 'started' })
          }
          onSkip={() => {
            try {
              sessionStorage.setItem(PHONE_SKIP_KEY, '1');
            } catch {
              // ignore storage failure; skip still applies for this render
            }
            setPhoneSkipped(true);
            trackFunnelEventImmediate({ funnel: 'auth', event: 'phone_verification_skipped', status: 'skipped' });
          }}
          onFunnelEvent={(evt) => {
            trackFunnelEvent(evt);
            if (evt.status === 'failed' || evt.status === 'completed') {
              trackFunnelEventImmediate(evt);
            }
          }}
        />
      )}

      {/* PWA Install Prompt */}
      {phoneVerified && onboardingCompleted && <InstallPromptBanner />}

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
    </ReporterAccessProvider>
  );
}

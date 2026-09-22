'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Box, Button, CircularProgress, Stack, Typography } from '@neram/ui';
import CloudOffOutlinedIcon from '@mui/icons-material/CloudOffOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import NoClassroomWelcome from '@/components/NoClassroomWelcome';
import ParentNoChildLinked from '@/components/ParentNoChildLinked';
import { getRoleDashboard } from '@/lib/role-home';
import { loginUrlWithReturn } from '@/lib/return-path';

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: ('admin' | 'teacher' | 'student' | 'parent')[];
  redirectTo?: string;
  /**
   * Where to send someone who is not signed in at all. Defaults to the
   * Microsoft login page. The parent area passes /parent/login, because a parent
   * whose session expired has no Microsoft account and would be stranded on a
   * sign-in screen they can never complete.
   */
  loginPath?: string;
}

/**
 * Guards routes based on the user's Nexus role.
 * Redirects unauthorized users to the appropriate route.
 * For students, access is governed solely by classroom membership: a student
 * with no active classroom sees NoClassroomWelcome (the "contact admin on
 * Teams" screen). There is no onboarding wizard or profile gate.
 */
export default function RoleGuard({
  children,
  allowedRoles,
  redirectTo,
  loginPath = '/login',
}: RoleGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, nexusRole, classrooms, loading, authUnavailable, refreshAuth, parentSession } =
    useNexusAuthContext();

  useEffect(() => {
    if (loading) return;

    // Nexus could not be reached. That says nothing about the session, so this is
    // not the moment to send a signed-in person to sign in: the screen below offers
    // a retry instead.
    if (!user && authUnavailable) return;

    if (!user) {
      // Carry the destination through sign-in. Without this, a student tapping
      // a shared assignment link while signed out lands on their dashboard and
      // the assignment they were sent to is silently lost, which is what made
      // every shared link useless to anyone not already signed in.
      //
      // Read the query straight off the browser URL rather than through the
      // useSearchParams hook. That hook opts its whole subtree out of static
      // prerendering unless a Suspense boundary sits above it, and RoleGuard
      // wraps essentially every authenticated page, so using it here failed the
      // production build on 104 routes at once. This effect only ever runs in
      // the browser, where window.location.search is the identical value.
      const query = typeof window !== 'undefined' ? window.location.search : '';
      router.push(loginUrlWithReturn(loginPath, `${pathname}${query}`));
      return;
    }

    if (nexusRole && !allowedRoles.includes(nexusRole)) {
      const target = redirectTo || getRoleDashboard(nexusRole);
      router.push(target);
      return;
    }
  }, [
    user,
    authUnavailable,
    nexusRole,
    loading,
    allowedRoles,
    redirectTo,
    loginPath,
    router,
    classrooms,
    pathname,
  ]);

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          gap: 2,
        }}
      >
        <CircularProgress size={40} />
        <Typography variant="body2" color="text.secondary">
          Loading...
        </Typography>
      </Box>
    );
  }

  if (!user && authUnavailable) {
    const query = typeof window !== 'undefined' ? window.location.search : '';
    return (
      <CouldNotReachNexus
        onRetry={() => void refreshAuth()}
        // A parent's sign-in page sends any live parent session straight back here,
        // so offering it to a parent would only bounce.
        signInHref={parentSession?.active ? null : loginUrlWithReturn(loginPath, `${pathname}${query}`)}
      />
    );
  }

  if (!user || !nexusRole || !allowedRoles.includes(nexusRole)) {
    return null;
  }

  // Authenticated but with no classrooms. That is two different failures with
  // two different remedies: a student needs to be ADDED to a classroom, while a
  // parent needs to be LINKED to a student. Showing a parent the student's
  // "ask admin on Teams" screen would tell them to do something they cannot do,
  // through a tool they do not have.
  //
  // For a parent, `classrooms` is their CHILD's classroom list (see the parent
  // branch of /api/auth/me), so an empty list here means no live linked child.
  if (classrooms.length === 0) {
    return nexusRole === 'parent' ? <ParentNoChildLinked /> : <NoClassroomWelcome />;
  }

  return <>{children}</>;
}

/**
 * Full-screen stand-in for the app when /api/auth/me could not be reached: laid out
 * like the loading spinner it replaces, announced as an alert, with the retry
 * focused so a keyboard user lands on it. Pressing it re-runs the sign-in check,
 * which puts the spinner back until the answer arrives.
 */
function CouldNotReachNexus({ onRetry, signInHref }: { onRetry: () => void; signInHref: string | null }) {
  return (
    <Box
      role="alert"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: 2,
        px: 3,
        textAlign: 'center',
      }}
    >
      <CloudOffOutlinedIcon aria-hidden sx={{ fontSize: 48, color: 'text.secondary' }} />
      <Typography variant="h6" component="h1">
        Could not reach Nexus
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 360 }}>
        Check your internet connection and try again. If it keeps happening, sign in again.
      </Typography>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        sx={{ width: { xs: '100%', sm: 'auto' }, maxWidth: 360, mt: 1 }}
      >
        <Button variant="contained" onClick={onRetry} autoFocus sx={{ minHeight: 48, px: 3 }}>
          Try again
        </Button>
        {signInHref && (
          <Button component={Link} href={signInHref} variant="text" sx={{ minHeight: 48, px: 3 }}>
            Sign in again
          </Button>
        )}
      </Stack>
    </Box>
  );
}

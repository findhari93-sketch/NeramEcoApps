'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Box, CircularProgress, Typography } from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import NoClassroomWelcome from '@/components/NoClassroomWelcome';
import ParentNoChildLinked from '@/components/ParentNoChildLinked';

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
  const { user, nexusRole, classrooms, loading } = useNexusAuthContext();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.push(loginPath);
      return;
    }

    if (nexusRole && !allowedRoles.includes(nexusRole)) {
      const target = redirectTo || getRoleDashboard(nexusRole);
      router.push(target);
      return;
    }
  }, [user, nexusRole, loading, allowedRoles, redirectTo, loginPath, router, classrooms]);

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

function getRoleDashboard(role: string): string {
  // Return canonical landing routes that actually exist (matching the root
  // page.tsx redirects). The bare /teacher, /student, /parent paths have no
  // index page and would 404 — this surfaced when impersonation flips the role
  // mid-session and the guard redirects.
  switch (role) {
    case 'admin':
    case 'teacher':
      return '/teacher/dashboard';
    case 'student':
      return '/student/dashboard';
    case 'parent':
      return '/parent/dashboard';
    default:
      return '/login';
  }
}

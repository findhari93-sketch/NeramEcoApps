'use client';

import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import AlumniAccessEnded from '@/components/AlumniAccessEnded';

/**
 * Central full-screen lockout: when the signed-in user is blocked at the
 * /api/auth/me gate, render a friendly screen instead of the app, for every
 * route at once. Unauthenticated users and active users render children.
 *
 *   reason 'alumni' -> the student graduated (warm "you've graduated").
 *
 * Students who are simply not enrolled in a classroom are NOT blocked here;
 * they get a 200 from /api/auth/me and see NoClassroomWelcome via RoleGuard.
 */
export default function AccessGate({ children }: { children: React.ReactNode }) {
  const { accessEnded } = useNexusAuthContext();

  if (accessEnded?.reason === 'alumni') {
    return <AlumniAccessEnded message={accessEnded.message} />;
  }

  return <>{children}</>;
}

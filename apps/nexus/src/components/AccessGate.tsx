'use client';

import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import AlumniAccessEnded from '@/components/AlumniAccessEnded';
import NexusClosedScreen from '@/components/NexusClosedScreen';

/**
 * Central full-screen lockout: when the signed-in user is blocked at the
 * /api/auth/me gate, render a friendly screen instead of the app, for every
 * route at once. Unauthenticated users and active users render children.
 *
 *   reason 'alumni'       -> the student graduated (warm "you've graduated").
 *   reason 'nexus_closed' -> Nexus is closed to this student during the 2026-27
 *                            rebuild ("preparing your classroom").
 */
export default function AccessGate({ children }: { children: React.ReactNode }) {
  const { accessEnded } = useNexusAuthContext();

  if (accessEnded?.reason === 'alumni') {
    return <AlumniAccessEnded message={accessEnded.message} />;
  }

  if (accessEnded?.reason === 'nexus_closed') {
    return <NexusClosedScreen message={accessEnded.message} />;
  }

  return <>{children}</>;
}

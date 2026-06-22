'use client';

import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import AlumniAccessEnded from '@/components/AlumniAccessEnded';

/**
 * Central lockout: when the signed-in user has been graduated to alumni, render
 * the "you've graduated" screen instead of the app, for every route at once.
 * Unauthenticated users and active users render children normally.
 */
export default function AlumniGate({ children }: { children: React.ReactNode }) {
  const { accessEnded } = useNexusAuthContext();

  if (accessEnded?.reason === 'alumni') {
    return <AlumniAccessEnded message={accessEnded.message} />;
  }

  return <>{children}</>;
}

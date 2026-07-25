'use client';

import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import AlumniAccessEnded from '@/components/AlumniAccessEnded';
import PhotoRequiredGate from '@/components/PhotoRequiredGate';

/**
 * Central full-screen lockout: when the signed-in user is blocked at the
 * /api/auth/me gate, render a friendly screen instead of the app, for every
 * route at once. Unauthenticated users and active users render children.
 *
 *   reason 'alumni'     -> the student graduated (warm "you've graduated").
 *   photoGate.required  -> a student with no approved profile photo. Self-serve:
 *                          the screen contains the upload widget, so they clear
 *                          it themselves. Students only, never while a teacher
 *                          is using "View as Student", and only when the
 *                          student.photo-gate feature flag is on.
 *
 * Order matters: alumni wins, so a graduated student is never asked for a photo
 * on the way out.
 *
 * Students who are simply not enrolled in a classroom are NOT blocked here;
 * they get a 200 from /api/auth/me and see NoClassroomWelcome via RoleGuard.
 */
export default function AccessGate({ children }: { children: React.ReactNode }) {
  const { accessEnded, photoGate } = useNexusAuthContext();

  if (accessEnded?.reason === 'alumni') {
    return <AlumniAccessEnded message={accessEnded.message} />;
  }

  if (photoGate?.required) {
    return <PhotoRequiredGate />;
  }

  return <>{children}</>;
}

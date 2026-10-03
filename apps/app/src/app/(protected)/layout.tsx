'use client';

import { Suspense } from 'react';
import { SidebarProvider } from '@/contexts/SidebarContext';
import StudentSession from '@/components/shell/StudentSession';
import AppSplash from '@/components/shell/AppSplash';

/**
 * Pages that need an account: dashboard, profile, the signed-in tools hub.
 * The Suspense boundary stays for pages below that call useSearchParams.
 */
export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <Suspense fallback={<AppSplash />}>
        <StudentSession mode="required">{children}</StudentSession>
      </Suspense>
    </SidebarProvider>
  );
}

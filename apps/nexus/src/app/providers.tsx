'use client';

import { NexusAuthProvider } from '@/hooks/useNexusAuth';
import SidebarProvider from '@/components/SidebarProvider';
import ImpersonationBanner from '@/components/ImpersonationBanner';
import AccessGate from '@/components/AccessGate';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NexusAuthProvider>
      <SidebarProvider>
        <ImpersonationBanner />
        <AccessGate>{children}</AccessGate>
      </SidebarProvider>
    </NexusAuthProvider>
  );
}

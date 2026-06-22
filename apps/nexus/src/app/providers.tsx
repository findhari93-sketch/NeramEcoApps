'use client';

import { NexusAuthProvider } from '@/hooks/useNexusAuth';
import SidebarProvider from '@/components/SidebarProvider';
import ImpersonationBanner from '@/components/ImpersonationBanner';
import AlumniGate from '@/components/AlumniGate';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NexusAuthProvider>
      <SidebarProvider>
        <ImpersonationBanner />
        <AlumniGate>{children}</AlumniGate>
      </SidebarProvider>
    </NexusAuthProvider>
  );
}

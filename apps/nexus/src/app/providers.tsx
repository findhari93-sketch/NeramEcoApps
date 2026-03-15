'use client';

import { NexusAuthProvider } from '@/hooks/useNexusAuth';
import SidebarProvider from '@/components/SidebarProvider';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NexusAuthProvider>
      <SidebarProvider>{children}</SidebarProvider>
    </NexusAuthProvider>
  );
}

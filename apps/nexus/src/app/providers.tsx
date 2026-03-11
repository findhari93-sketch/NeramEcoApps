'use client';

import { NexusAuthProvider } from '@/hooks/useNexusAuth';

export default function Providers({ children }: { children: React.ReactNode }) {
  return <NexusAuthProvider>{children}</NexusAuthProvider>;
}

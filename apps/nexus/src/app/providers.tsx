'use client';

import { useState } from 'react';
import { SWRConfig, type Cache } from 'swr';
import { NexusAuthProvider } from '@/hooks/useNexusAuth';
import SidebarProvider from '@/components/SidebarProvider';
import ImpersonationBanner from '@/components/ImpersonationBanner';
import AccessGate from '@/components/AccessGate';
import { createPersistentCache } from '@/lib/swr-cache';
import { readCachedAuth } from '@/lib/auth-cache';

/**
 * Cache defaults for every read in the app.
 *
 * `revalidateOnFocus` is off deliberately. It is SWR's headline feature and the
 * wrong default here: a teacher alt-tabbing between Nexus and Teams would fire a
 * fresh round of serverless invocations every time they came back, which is the
 * one thing the repo's cost rules ask us not to do. Staleness is handled by the
 * explicit mutate() calls that follow every write instead.
 *
 * `keepPreviousData` is left off for the same reason it sounds appealing: the
 * class panel re-keys when the teacher selects a different class, and holding the
 * previous data would show one class's roster under another class's name.
 */
/**
 * Build the cache once, on the client, before the first render.
 *
 * Not at module scope: this reads localStorage, which does not exist while the module
 * is being evaluated on the server. Not in a `useEffect` either, because by then the
 * first frame has already been painted empty, which is the frame we are here to fill.
 * A lazy `useState` initialiser is the one hook that runs client-side and still beats
 * the first paint.
 *
 * The account comes from the cached /api/auth/me answer, which is the only identity
 * available this early. When it turns out to be the wrong one, useNexusAuth clears
 * both caches and the app simply pays for one cold screen.
 */
function usePersistentCache() {
  const [cache] = useState(() =>
    typeof window === 'undefined' ? undefined : createPersistentCache(readCachedAuth()?.oid ?? null),
  );
  return cache;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const cache = usePersistentCache();

  return (
    <SWRConfig
      value={{
        // Survives a reload, not just an unmount. See lib/swr-cache.ts.
        //
        // A Map already satisfies everything SWR asks of a cache (keys/get/set/delete);
        // the cast is only because SWR types its entries as its own internal State
        // shape, which this module deliberately does not depend on.
        provider: cache ? () => cache as unknown as Cache<unknown> : undefined,
        revalidateOnFocus: false,
        revalidateOnReconnect: true,
        // Two sections asking for the same URL in the same tick share one
        // request, and a tab reopened within the window costs nothing at all.
        dedupingInterval: 15_000,
        errorRetryCount: 2,
      }}
    >
      <NexusAuthProvider>
        <SidebarProvider>
          <ImpersonationBanner />
          <AccessGate>{children}</AccessGate>
        </SidebarProvider>
      </NexusAuthProvider>
    </SWRConfig>
  );
}

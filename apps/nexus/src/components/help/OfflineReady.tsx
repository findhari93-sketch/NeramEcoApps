'use client';

import { useEffect } from 'react';

export const SERVICE_WORKER_URL = '/nexus-sw.js';

/**
 * Registers the Nexus service worker (public/nexus-sw.js) and tells it which
 * build is running, so its saved copy of /offline always matches the live
 * script files. That worker is what shows the rescue screen instead of
 * Android's "Can't connect to the site" box when a page cannot load.
 *
 * Production only: `next dev` serves script files that change on every edit.
 * A few seconds after start, so it never competes with the screen being opened.
 * Renders nothing, and does nothing where service workers are unavailable.
 */
export async function setUpOfflineWorker(build: string): Promise<'registered' | 'skipped'> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return 'skipped';

  await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: '/' });
  const registration = await navigator.serviceWorker.ready;
  registration.active?.postMessage({ type: 'nexus-build', build });
  return 'registered';
}

export default function OfflineReady() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    const build = process.env.NEXT_PUBLIC_BUILD_STAMP || 'unknown';
    const timer = window.setTimeout(() => {
      setUpOfflineWorker(build).catch(() => undefined);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, []);
  return null;
}

import type { Metadata } from 'next';
import OfflineScreen from '@/components/help/OfflineScreen';

/**
 * /offline: precached by the service worker and served in place of any page
 * that fails to load (next.config.js `fallbacks`). Static and signed-out on
 * purpose: it renders from the phone's cache with no server behind it.
 */
export const metadata: Metadata = {
  title: "Can't connect | Nexus",
};

export default function OfflinePage() {
  return <OfflineScreen />;
}

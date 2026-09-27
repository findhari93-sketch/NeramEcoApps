'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { classifyPageView } from '@/lib/analytics/page-events';

/**
 * First-party page-view events for the home page, course and coaching pages and
 * tool landing pages (lifecycle plan M3b). Renders nothing. The tracker is loaded
 * only when the path is one we track, and events are batched by funnel-tracker.
 */
export default function PageViewBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    const view = classifyPageView(pathname || '/');
    if (!view) return;
    let cancelled = false;
    import('@/lib/funnel-tracker')
      .then(({ trackTaxonomyEvent }) => {
        if (!cancelled) trackTaxonomyEvent(view.event, view.metadata);
      })
      .catch(() => {
        // Analytics must never affect the page.
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return null;
}

'use client';

import DrawingsHubShell from '@/components/drawings/DrawingsHubShell';
import InspirationBrowser from '@/components/inspiration/InspirationBrowser';

/**
 * Inspiration is a tab of the Drawings hub that keeps its own route, because it
 * carries a URL full of filters, a Saved list and a page per drawing. See
 * lib/drawings-hub for why the bar holds both kinds of tab.
 */
export default function TeacherInspirationPage() {
  return (
    <DrawingsHubShell
      role="teacher"
      active="inspiration"
      subtitle="What students see when they look for ideas"
      backHref="/teacher/dashboard"
    >
      <InspirationBrowser mode="staff" chrome="embedded" />
    </DrawingsHubShell>
  );
}

'use client';

import DrawingsHubShell from '@/components/drawings/DrawingsHubShell';
import InspirationBrowser from '@/components/inspiration/InspirationBrowser';

/**
 * Inspiration is a tab of the Drawings hub that keeps its own route, because it
 * carries a URL full of filters, a Saved list and a page per drawing. See
 * lib/drawings-hub for why the bar holds both kinds of tab.
 */
export default function StudentInspirationPage() {
  return (
    <DrawingsHubShell
      role="student"
      active="inspiration"
      subtitle="Search drawings by Neram teachers, classmates and alumni"
      backHref="/student/dashboard"
    >
      <InspirationBrowser mode="student" chrome="embedded" />
    </DrawingsHubShell>
  );
}

'use client';

/**
 * Error boundary for everything the (teacher) and (student) boundaries cannot
 * catch (PERF-0028).
 *
 * A segment's error.tsx does not catch errors thrown by its own layout, so a crash
 * in a shell (TopBar, the badge and stage-fact providers), anywhere under (pad) or
 * (auth), or on a top-level page fell through to global-error.tsx. That one
 * replaces the whole document, spoke to students only, and its "Reload" re-rendered
 * from the same cached data. This sits inside the root layout, so the theme and the
 * auth context survive, and it speaks to whoever is signed in.
 */

import RouteErrorScreen from '@/components/RouteErrorScreen';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorScreen
      error={error}
      reset={reset}
      fullScreen
      title="Something went wrong"
      body="This screen stopped working. Try again first. If it keeps happening, clearing this device's saved data usually fixes it, and you stay signed in."
      reportTitle="A Nexus screen crashed"
    />
  );
}

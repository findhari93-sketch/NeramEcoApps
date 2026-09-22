'use client';

/**
 * Error boundary for any uncaught render error on a parent page (PERF-0028).
 *
 * There was none, so a crash here fell to global-error.tsx and replaced the whole
 * app with a screen written for students. Sitting inside (parent)/layout.tsx, the
 * parent keeps their menu and can go to any other page.
 */

import RouteErrorScreen from '@/components/RouteErrorScreen';

export default function ParentError({
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
      title="This page hit an error"
      body="Only this page stopped. You can carry on from the menu. Try again first, and if it keeps happening, clear this device's saved data."
      reportTitle="A parent page crashed"
    />
  );
}

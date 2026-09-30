'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Box, CircularProgress } from '@neram/ui';
import HelpRequestForm from '@/components/help/HelpRequestForm';
import { safeReturnPath } from '@/lib/support-contact';

/**
 * /help: ask the Neram team for help without signing in.
 *
 * Reached from the offline screen, the login page, the slow-start panel and the
 * error screens. `?from=` is where Back and Done return to (only a path inside
 * Nexus, otherwise /login); `?problem=` preselects what is wrong.
 */
function HelpContent() {
  const params = useSearchParams();
  return <HelpRequestForm returnTo={safeReturnPath(params.get('from'))} initialProblem={params.get('problem')} />;
}

export default function HelpPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <CircularProgress aria-label="Loading" />
        </Box>
      }
    >
      <HelpContent />
    </Suspense>
  );
}

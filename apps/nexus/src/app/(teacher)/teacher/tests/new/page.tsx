'use client';

// NOTE: this route is /teacher/tests/new, NOT /teacher/tests/build, on purpose.
// The repo root .gitignore has a bare `build` pattern (line 13) that swallows ANY
// folder named build, so a build/ route folder silently never gets committed.

import { Suspense } from 'react';
import { Box, Skeleton } from '@neram/ui';
import TestWizard from '@/components/tests/wizard/TestWizard';

/**
 * One wizard for every kind of test.
 *
 * This replaced two separate routes: a bank-picker builder here, and a
 * paste-the-AI-reply wizard at ./import. They asked for the same test in two
 * different orders and neither could reach the other's questions, which is why
 * a chapter test built from a PDF could not borrow a single bank question.
 *
 * The step lives in the query string rather than in a nested route, because the
 * draft holds up to 200 unsaved questions and a segment change would remount it.
 * ?step= and ?src= also make the branch deep-linkable, which is how a class page
 * can send a teacher straight to "generate from this transcript".
 */
export default function NewTestPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ px: { xs: 2, md: 3 }, py: 2, maxWidth: 1100, mx: 'auto' }}>
          <Skeleton variant="rounded" height={56} sx={{ mb: 2 }} />
          <Skeleton variant="rounded" height={320} />
        </Box>
      }
    >
      <TestWizard />
    </Suspense>
  );
}

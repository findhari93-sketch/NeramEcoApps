'use client';

/**
 * The performance dashboard absorbed this page's job (a chart, a monthly
 * breakdown, and every attempt this student has made) as its own tab on
 * /student/tests, so this route just forwards there now. Kept as a redirect
 * rather than deleted outright: a bookmark or an old push notification
 * pointing here should not 404.
 *
 * A client-side `router.replace`, not `redirect()` from next/navigation: this
 * app's (student) segment renders under a client-side auth/shell layout, and
 * a Server Component redirect() here was silently absorbed somewhere in that
 * boundary rather than navigating. Every sibling under this directory is
 * already a Client Component, so this follows the same, proven pattern.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Skeleton } from '@neram/ui';

export default function StudentTestHistoryRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/student/tests?tab=performance');
  }, [router]);

  return (
    <Box sx={{ px: { xs: 2, md: 3 }, py: 2, maxWidth: 800, mx: 'auto' }}>
      <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 2 }} />
    </Box>
  );
}

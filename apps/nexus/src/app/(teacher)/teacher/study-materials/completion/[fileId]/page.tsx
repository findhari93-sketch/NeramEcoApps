'use client';

/**
 * This dashboard moved: it is now the Students tab of the chapter workspace
 * page, at `/teacher/study-materials/[fileId]?tab=students`. Every in-app
 * link already points there; this stub only exists so a bookmarked or still-
 * open tab from before the move lands somewhere useful instead of a 404.
 */

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Box, Skeleton } from '@neram/ui';

export default function CompletionRedirectPage() {
  const { fileId } = useParams<{ fileId: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/teacher/study-materials/${fileId}?tab=students`);
  }, [fileId, router]);

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2 }, maxWidth: 1100, mx: 'auto' }}>
      <Skeleton variant="rounded" height={200} />
    </Box>
  );
}

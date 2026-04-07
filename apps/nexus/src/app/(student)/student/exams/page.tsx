'use client';

import { Suspense } from 'react';
import { Box, Skeleton } from '@neram/ui';
import UnifiedExamsContainer from '@/components/exams/UnifiedExamsContainer';

function ExamsContent() {
  return <UnifiedExamsContainer />;
}

export default function ExamsPage() {
  return (
    <Box>
      <Suspense fallback={
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Skeleton variant="rounded" height={70} />
          <Skeleton variant="rounded" height={48} />
          <Skeleton variant="rounded" height={200} />
        </Box>
      }>
        <ExamsContent />
      </Suspense>
    </Box>
  );
}

'use client';

import { Suspense } from 'react';
import { Box, Skeleton } from '@neram/ui';
import UnifiedExamsContainer from '@/components/exams/UnifiedExamsContainer';

function TeacherExamsContent() {
  return <UnifiedExamsContainer />;
}

export default function TeacherExamsPage() {
  return (
    <Box>
      <Suspense fallback={
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Skeleton variant="rounded" height={70} />
          <Skeleton variant="rounded" height={200} />
        </Box>
      }>
        <TeacherExamsContent />
      </Suspense>
    </Box>
  );
}

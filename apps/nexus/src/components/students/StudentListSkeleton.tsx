'use client';

import { Box, Skeleton } from '@neram/ui';
import type { ViewMode } from './studentRow.types';

/** Per-view loading skeleton (shape matches the chosen density). */
export default function StudentListSkeleton({ viewMode }: { viewMode: ViewMode }) {
  if (viewMode === 'cards') {
    return (
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 1.5 }}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} variant="rectangular" height={158} sx={{ borderRadius: 2.5 }} />
        ))}
      </Box>
    );
  }
  const h = viewMode === 'compact' ? 56 : 92;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: viewMode === 'compact' ? 1 : 1.5 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} variant="rectangular" height={h} sx={{ borderRadius: 2 }} />
      ))}
    </Box>
  );
}

'use client';

import { Box, Skeleton } from '@neram/ui';
import type { ViewMode } from './studentRow.types';

/** Per-view loading skeleton (shape matches the chosen density). */
export default function StudentListSkeleton({ viewMode }: { viewMode: ViewMode }) {
  if (viewMode === 'cards') {
    return (
      // The same container query the real grid uses, so the columns do not move
      // when the students land. See the comment on the grid in the page.
      <Box sx={{ containerType: 'inline-size' }}>
        <Box
          sx={{
            display: 'grid',
            gap: 1.5,
            gridTemplateColumns: '1fr',
            '@container (min-width: 560px)': { gridTemplateColumns: 'repeat(2, 1fr)' },
            '@container (min-width: 900px)': { gridTemplateColumns: 'repeat(3, 1fr)' },
          }}
        >
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} variant="rectangular" sx={{ borderRadius: 2.5, height: 198 }} />
          ))}
        </Box>
      </Box>
    );
  }
  // Measured against real rows, which are much taller on a phone: the chips, the
  // email and the status line all wrap there. One flat number left a 60px jump
  // when the students landed.
  const h = viewMode === 'compact' ? { xs: 132, sm: 80 } : { xs: 168, sm: 108 };
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: viewMode === 'compact' ? 1 : 1.5 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} variant="rectangular" sx={{ borderRadius: 2, height: h }} />
      ))}
    </Box>
  );
}

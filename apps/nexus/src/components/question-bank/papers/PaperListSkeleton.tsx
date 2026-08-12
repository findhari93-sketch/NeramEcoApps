'use client';

import { Box, Skeleton } from '@neram/ui';
import type { PaperView } from './paperTypes';

/** Roughly what each view's row actually measures, so nothing jumps on load. */
const ROW_HEIGHT: Record<PaperView, number> = {
  table: 56,
  grid: 200,
  cards: 240,
};

/**
 * Placeholders shaped like the view that is about to replace them.
 *
 * The old skeleton was a fixed 140px card in every case, which meant switching
 * to the table and reloading showed three card-shaped blocks and then snapped
 * to a table. Reserving the right space is the point of a skeleton.
 */
export default function PaperListSkeleton({ view }: { view: PaperView }) {
  const rows = view === 'table' ? 8 : view === 'grid' ? 6 : 3;
  const height = ROW_HEIGHT[view];

  return (
    <Box
      sx={
        view === 'grid'
          ? {
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
              gap: 1.5,
            }
          : { display: 'flex', flexDirection: 'column', gap: view === 'table' ? 0.75 : 1.5 }
      }
    >
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} variant="rectangular" height={height} sx={{ borderRadius: 1 }} />
      ))}
    </Box>
  );
}

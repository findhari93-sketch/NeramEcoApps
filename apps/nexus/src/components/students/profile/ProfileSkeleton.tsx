'use client';

import { Box, Paper, Skeleton } from '@neram/ui';

/**
 * The loading state, shaped like the page it precedes.
 *
 * Skeletons, not a spinner: the house rule, and here it also stops the layout
 * jumping when the header and the first two sections arrive. The rhythm matches
 * the real page, one header plus a stack of collapsed section bars.
 */
export default function ProfileSkeleton() {
  return (
    <Box>
      <Skeleton variant="rectangular" height={40} width={160} sx={{ borderRadius: 1, mb: 2 }} />

      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          <Skeleton variant="circular" width={48} height={48} />
          <Box sx={{ flex: 1 }}>
            <Skeleton variant="text" width="60%" height={24} />
            <Skeleton variant="text" width="80%" height={16} />
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.75, mt: 1.5 }}>
          <Skeleton variant="rounded" width={90} height={24} />
          <Skeleton variant="rounded" width={70} height={24} />
        </Box>
      </Paper>

      {/* Two expanded sections, then the collapsed bars, as the real page opens. */}
      <Skeleton variant="rectangular" height={180} sx={{ borderRadius: 1, mb: 1 }} />
      <Skeleton variant="rectangular" height={180} sx={{ borderRadius: 1, mb: 1 }} />
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} variant="rectangular" height={56} sx={{ borderRadius: 1, mb: 1 }} />
      ))}
    </Box>
  );
}

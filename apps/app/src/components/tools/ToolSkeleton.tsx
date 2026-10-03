import { Box, Skeleton } from '@neram/ui';

/** Placeholder with the rough shape of a tool page: header, then form and results. */
export default function ToolSkeleton() {
  return (
    <Box role="status" aria-live="polite" aria-busy="true" sx={{ minHeight: 480 }}>
      <span className="visually-hidden">Loading the tool</span>
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mb: 3 }}>
        <Skeleton variant="rounded" width={44} height={44} />
        <Box sx={{ flex: 1 }}>
          <Skeleton variant="text" sx={{ fontSize: '1.5rem', maxWidth: 320 }} />
          <Skeleton variant="text" sx={{ maxWidth: 480 }} />
        </Box>
      </Box>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
        <Skeleton variant="rounded" height={280} />
        <Skeleton variant="rounded" height={280} sx={{ display: { xs: 'none', md: 'block' } }} />
      </Box>
    </Box>
  );
}

import { Box, Container, Skeleton, Stack } from '@neram/ui';

/** Loading state for the review and story pages: same shape as the real page, no spinner. */
export default function ReviewsSkeleton() {
  return (
    <Box sx={{ py: { xs: 3, md: 6 } }} aria-busy="true">
      <Container maxWidth="md" sx={{ px: { xs: 2, sm: 3 } }}>
        <Skeleton variant="text" width={180} height={20} />
        <Skeleton variant="text" sx={{ fontSize: '2rem', maxWidth: 420 }} />
        <Skeleton variant="text" sx={{ maxWidth: 560 }} />
        <Skeleton variant="text" sx={{ maxWidth: 480, mb: 3 }} />
        <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
          {[120, 80, 120].map((w, i) => (
            <Skeleton key={i} variant="rounded" width={w} height={48} sx={{ borderRadius: 999 }} />
          ))}
        </Stack>
        <Skeleton variant="rounded" height={160} sx={{ borderRadius: 3, mb: 3 }} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rounded" height={200} sx={{ borderRadius: 3 }} />
          ))}
        </Box>
      </Container>
    </Box>
  );
}

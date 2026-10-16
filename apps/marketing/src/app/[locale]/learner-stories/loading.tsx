import { Box, Skeleton } from '@neram/ui';
import { Surface, tokens as t } from '@/design-system';

/** Loading state in the page's own shape: dark hero, then a grid of card skeletons. No spinner. */
export default function Loading() {
  return (
    <Box aria-busy="true">
      <Surface tone="dark" component="div">
        <Box sx={{ maxWidth: t.container.page, mx: 'auto', px: { xs: 2, sm: 3 }, pt: { xs: 6, md: 9 }, pb: { xs: 6, md: 7 }, boxSizing: 'content-box' }}>
          <Skeleton variant="text" width={180} sx={{ bgcolor: t.navy700 }} />
          <Skeleton variant="text" sx={{ fontSize: '2.5rem', maxWidth: 520, bgcolor: t.navy700 }} />
          <Skeleton variant="text" sx={{ maxWidth: 600, bgcolor: t.navy700 }} />
          <Skeleton variant="text" sx={{ maxWidth: 480, bgcolor: t.navy700 }} />
        </Box>
      </Surface>
      <Box sx={{ bgcolor: t.ground }}>
        <Box
          sx={{
            maxWidth: t.container.page,
            mx: 'auto',
            px: { xs: 2, sm: 3 },
            py: { xs: 7, md: 10 },
            boxSizing: 'content-box',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))',
            gap: { xs: 2, md: 2.5 },
          }}
        >
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Box key={i} sx={{ p: 2.5, bgcolor: t.surface, border: `1px solid ${t.line}`, borderRadius: `${t.radius}px` }}>
              <Box sx={{ display: 'flex', gap: 1.75, alignItems: 'center' }}>
                <Skeleton variant="circular" width={52} height={52} />
                <Box sx={{ flex: 1 }}>
                  <Skeleton variant="text" width="70%" />
                  <Skeleton variant="text" width="40%" />
                </Box>
              </Box>
              <Skeleton variant="text" width="60%" sx={{ mt: 1.5 }} />
              <Skeleton variant="text" width="85%" />
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

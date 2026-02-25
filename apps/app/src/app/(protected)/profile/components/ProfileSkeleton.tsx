'use client';

import { Box, Skeleton, Paper, Grid } from '@neram/ui';

export default function ProfileSkeleton() {
  return (
    <Box sx={{ pb: 4 }}>
      <Skeleton variant="text" width={200} height={40} sx={{ mb: 3 }} />
      <Grid container spacing={3}>
        {/* Sidebar */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, textAlign: 'center' }}>
            <Skeleton variant="circular" width={120} height={120} sx={{ mx: 'auto' }} />
            <Skeleton variant="text" width="60%" sx={{ mx: 'auto', mt: 2 }} />
            <Skeleton variant="text" width="40%" sx={{ mx: 'auto' }} />
            <Skeleton variant="rectangular" height={40} sx={{ mt: 3, borderRadius: 1 }} />
          </Paper>
          <Paper sx={{ p: 2, mt: 2 }}>
            <Skeleton variant="text" width="50%" />
            <Skeleton variant="text" width="100%" sx={{ mt: 1 }} />
            <Skeleton variant="text" width="100%" />
          </Paper>
        </Grid>
        {/* Main content */}
        <Grid item xs={12} md={8}>
          {[1, 2, 3].map((i) => (
            <Paper key={i} sx={{ p: 3, mb: 3 }}>
              <Skeleton variant="text" width={180} height={32} />
              <Skeleton variant="rectangular" height={1} sx={{ my: 2 }} />
              <Grid container spacing={2}>
                {[1, 2, 3, 4].map((j) => (
                  <Grid item xs={12} sm={6} key={j}>
                    <Skeleton variant="rectangular" height={56} sx={{ borderRadius: 1 }} />
                  </Grid>
                ))}
              </Grid>
            </Paper>
          ))}
        </Grid>
      </Grid>
    </Box>
  );
}

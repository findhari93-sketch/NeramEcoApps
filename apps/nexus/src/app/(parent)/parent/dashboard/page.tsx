'use client';

import { Box, Typography, Paper, Grid } from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

/**
 * Parent dashboard - read-only view of their child's progress.
 * Full implementation comes in Phase 1, Week 3.
 */
export default function ParentDashboard() {
  const { user } = useNexusAuthContext();

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          Parent Dashboard
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Welcome, {user?.name || 'Parent'}
        </Typography>
      </Box>

      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="body1" color="text.secondary">
          Parent portal is being set up. You will be able to view your child&apos;s
          attendance, checklist progress, and upcoming classes here.
        </Typography>
      </Paper>
    </Box>
  );
}

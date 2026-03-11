'use client';

import { Box, Typography, Paper } from '@neram/ui';

/**
 * Support Tickets - placeholder page for parent portal.
 */
export default function TicketsPage() {
  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          Support Tickets
        </Typography>
      </Box>

      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="body1" color="text.secondary">
          Support ticket system coming soon. You can raise concerns through your
          child&apos;s teacher.
        </Typography>
      </Paper>
    </Box>
  );
}

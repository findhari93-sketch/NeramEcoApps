'use client';

import {
  Box,
  Typography,
  Paper,
  Chip,
} from '@neram/ui';

export default function StudentTickets() {
  return (
    <Box>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mb: 2 }}>
        Support Tickets
      </Typography>

      <Paper sx={{ p: { xs: 3, sm: 4 }, textAlign: 'center' }}>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
          Support ticket system coming soon. Contact your teacher directly for now.
        </Typography>
        <Chip
          label="Coming Soon"
          disabled
          sx={{ minHeight: 36 }}
        />
      </Paper>
    </Box>
  );
}

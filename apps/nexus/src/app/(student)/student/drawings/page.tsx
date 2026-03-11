'use client';

import {
  Box,
  Typography,
  Paper,
  Chip,
} from '@neram/ui';

export default function StudentDrawings() {
  return (
    <Box>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mb: 2 }}>
        Drawing Exercises
      </Typography>

      <Paper sx={{ p: { xs: 3, sm: 4 }, textAlign: 'center' }}>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
          Drawing exercises and submissions will be available soon.
        </Typography>
        <Chip
          label="Coming in Phase 2"
          disabled
          sx={{ minHeight: 36 }}
        />
      </Paper>
    </Box>
  );
}

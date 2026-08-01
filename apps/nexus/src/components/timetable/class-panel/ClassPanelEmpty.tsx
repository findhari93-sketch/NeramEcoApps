'use client';

import { Box, Typography, useTheme } from '@neram/ui';
import { RADIUS } from '../timetable-theme';

/**
 * The docked rail with nothing selected.
 *
 * It stays mounted rather than disappearing: it is a layout column, and pulling
 * it out would reflow the week list every time a teacher deselects.
 */
export default function ClassPanelEmpty() {
  const theme = useTheme();
  return (
    <Box
      sx={{
        border: `1px dashed ${theme.palette.divider}`,
        borderRadius: RADIUS.card,
        p: 4,
        textAlign: 'center',
      }}
    >
      <Typography variant="body2" color="text.secondary">
        Pick a day to set up its class.
      </Typography>
    </Box>
  );
}

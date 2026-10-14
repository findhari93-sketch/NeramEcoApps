'use client';

import { Box, Typography } from '@neram/ui';
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded';

/**
 * Says which missed part is playing while "Play the parts I missed" runs, so a
 * student who sees the picture jump knows why and how much is left.
 *
 * `role="status"` (polite): a screen reader hears "Missed part 2 of 4" when it
 * changes without being interrupted mid-sentence. Not interactive, so it takes
 * no pointer events and a tap still reaches the picture; pausing or moving the
 * playhead is how a student leaves this mode.
 */
export default function CatchUpChip({ index, total }: { index: number; total: number }) {
  return (
    <Box
      role="status"
      sx={{
        position: 'absolute',
        top: { xs: 8, sm: 16 },
        left: '50%',
        transform: 'translateX(-50%)',
        bgcolor: 'rgba(0,0,0,0.82)',
        color: '#fff',
        px: 1.75,
        py: 0.75,
        borderRadius: 99,
        maxWidth: '90%',
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        zIndex: 5,
        pointerEvents: 'none',
      }}
    >
      <ReplayRoundedIcon aria-hidden sx={{ fontSize: 16 }} />
      <Typography sx={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>
        Missed part {index + 1} of {total}
      </Typography>
    </Box>
  );
}

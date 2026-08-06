'use client';

import { Box, Typography } from '@neram/ui';
import LockRoundedIcon from '@mui/icons-material/LockRounded';

/**
 * The line that explains a refusal.
 *
 * `role="status"` rather than `alert`: it is an explanation of something the
 * student just tried, not an interruption, and a screen reader should finish
 * what it is saying first.
 */

export default function Nudge({ message }: { message: string }) {
  return (
    <Box
      role="status"
      sx={{
        position: 'absolute',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        bgcolor: 'rgba(0,0,0,0.82)',
        color: '#fff',
        px: 2,
        py: 1,
        borderRadius: 2,
        maxWidth: '90%',
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        zIndex: 5,
        pointerEvents: 'none',
      }}
    >
      <LockRoundedIcon sx={{ fontSize: 16 }} />
      <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{message}</Typography>
    </Box>
  );
}

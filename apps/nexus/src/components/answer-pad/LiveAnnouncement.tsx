'use client';

import { Box } from '@neram/ui';

/**
 * A line only screen readers hear, saying what just changed ("Question 3 is
 * open"). Keeping the live region to this one line means the buttons never sit
 * inside it, and a changing counter is not read out every two seconds.
 */
export default function LiveAnnouncement({ message }: { message: string }) {
  return (
    <Box
      role="status"
      aria-live="polite"
      aria-atomic="true"
      sx={{
        position: 'absolute',
        width: '1px',
        height: '1px',
        p: 0,
        m: '-1px',
        overflow: 'hidden',
        clip: 'rect(0 0 0 0)',
        whiteSpace: 'nowrap',
        border: 0,
      }}
    >
      {message}
    </Box>
  );
}

'use client';

import { Box, Typography } from '@neram/ui';

/**
 * The title, over the top of the picture, on the same fade as the control bar.
 *
 * Only rendered in fullscreen. Inline, the page around the player already says
 * what the video is, and repeating it over the first few seconds of the picture
 * is noise. In fullscreen the page is gone and there is nothing else to say it.
 */

export default function TitleBar({ title }: { title: string }) {
  return (
    <Box
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        px: { xs: 2, sm: 3 },
        pt: { xs: 1.5, sm: 2 },
        pb: 4,
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.75), rgba(0,0,0,0))',
        pointerEvents: 'none',
        zIndex: 4,
      }}
    >
      <Typography
        sx={{
          color: '#fff',
          fontSize: { xs: 14, sm: 16 },
          fontWeight: 700,
          // Long class titles are the norm, and a wrapped title over the picture
          // reads badly. One line, truncated.
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {title}
      </Typography>
    </Box>
  );
}

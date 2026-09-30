'use client';

/**
 * A single reference image, shown inline at a size that can actually be read.
 *
 * The image always fills the width. A tall one (a long worksheet or poster of
 * exercises) used to be squeezed into a short box as a thin unreadable strip;
 * here it shows its top at full width, fades out at the cap, and says there is
 * more. The whole tile is a button that opens the full-screen viewer.
 */
import { useState } from 'react';
import { Box, Typography } from '@neram/ui';
import OpenInFullRoundedIcon from '@mui/icons-material/OpenInFullRounded';

/** The tallest the inline preview grows before it crops, by breakpoint. */
const MAX_HEIGHT = { xs: 420, md: 520 };

export default function ReferenceImagePreview({
  src,
  label = 'Open the reference image',
  onOpen,
}: {
  src: string;
  /** What the button does, for a screen reader. */
  label?: string;
  onOpen: (src: string) => void;
}) {
  // Whether the image runs past the cap, so the "there is more" cue is honest.
  const [cropped, setCropped] = useState(false);

  return (
    <Box
      component="button"
      type="button"
      onClick={() => onOpen(src)}
      aria-label={label}
      sx={{
        position: 'relative',
        display: 'block',
        width: '100%',
        // A laptop does not need a 900px-wide poster top; keep it a card.
        maxWidth: { md: 560 },
        maxHeight: MAX_HEIGHT,
        p: 0,
        overflow: 'hidden',
        cursor: 'zoom-in',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        bgcolor: 'grey.50',
        '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 },
      }}
    >
      <Box
        component="img"
        src={src}
        alt=""
        loading="lazy"
        onLoad={(e: React.SyntheticEvent<HTMLImageElement>) => {
          const img = e.currentTarget;
          const box = img.parentElement;
          if (box) setCropped(img.offsetHeight > box.clientHeight + 1);
        }}
        sx={{ display: 'block', width: '100%', height: 'auto' }}
      />

      {cropped && (
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 96,
            background: 'linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0.96))',
            pointerEvents: 'none',
          }}
        />
      )}

      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          right: 8,
          bottom: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          minHeight: 36,
          px: 1.5,
          borderRadius: 999,
          bgcolor: 'rgba(0,0,0,0.72)',
          color: '#fff',
          pointerEvents: 'none',
        }}
      >
        <OpenInFullRoundedIcon sx={{ fontSize: 16 }} />
        <Typography component="span" variant="body2" sx={{ fontWeight: 600, color: 'inherit' }}>
          {cropped ? 'See full image' : 'Full screen'}
        </Typography>
      </Box>
    </Box>
  );
}

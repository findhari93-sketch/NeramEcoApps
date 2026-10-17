'use client';

import { Box, Button, Typography } from '@neram/ui';
import PlayCircleOutlineRoundedIcon from '@mui/icons-material/PlayCircleOutlineRounded';
import { videoOverlayDialogProps } from '../overlay-dialog';

/**
 * "Skipped 0:38 of quiet · Watch it", for a few seconds after the playhead
 * passes a pause the trim took out (founder, 2026-10-16: speaking only by
 * default, any skipped part one tap away).
 *
 * One 48px pill, the whole of it the button, so it is an easy target on a
 * phone without crowding a 211px tall player. It sits inside the player's own
 * container, so it shows in fullscreen too, and declares itself an overlay so
 * the player's tap and swipe gestures leave it alone.
 *
 * The caller decides when it shows; the wrapper announces it politely, so a
 * screen reader hears it without being interrupted.
 */
export interface SkippedPartChipProps {
  /** Seconds the trim removed here. */
  seconds: number;
  onWatch: () => void;
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function SkippedPartChip({ seconds, onWatch }: SkippedPartChipProps) {
  return (
    <Box
      role="status"
      {...videoOverlayDialogProps}
      sx={{
        position: 'absolute',
        top: { xs: 8, sm: 16 },
        right: { xs: 8, sm: 16 },
        maxWidth: 'calc(100% - 16px)',
        zIndex: 6,
        animation: 'skippedChipIn 200ms ease-out',
        '@keyframes skippedChipIn': { from: { opacity: 0 }, to: { opacity: 1 } },
        '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
      }}
    >
      <Button
        onClick={onWatch}
        data-testid="skipped-part-chip"
        aria-label={`The trim skipped ${clock(seconds)} of quiet here. Watch it`}
        sx={{
          minHeight: 48,
          minWidth: 0,
          px: 1.75,
          textTransform: 'none',
          gap: 0.75,
          borderRadius: 99,
          bgcolor: 'rgba(0,0,0,0.82)',
          color: '#fff',
          border: '1px solid rgba(255,255,255,0.28)',
          cursor: 'pointer',
          transition: 'background-color 150ms ease',
          '&:hover': { bgcolor: 'rgba(0,0,0,0.92)' },
          '&.Mui-focusVisible': { outline: '3px solid #90CAF9', outlineOffset: 2 },
        }}
      >
        <PlayCircleOutlineRoundedIcon aria-hidden sx={{ fontSize: 20 }} />
        <Typography component="span" sx={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', opacity: 0.85 }}>
          Skipped {clock(seconds)} of quiet
        </Typography>
        <Typography component="span" sx={{ fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', color: '#90CAF9' }}>
          Watch it
        </Typography>
      </Button>
    </Box>
  );
}

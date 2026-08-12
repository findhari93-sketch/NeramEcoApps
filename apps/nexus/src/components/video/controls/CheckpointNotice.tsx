'use client';

import { Box, Typography } from '@neram/ui';
import QuizRoundedIcon from '@mui/icons-material/QuizRounded';

/**
 * Why the video just stopped.
 *
 * The gate pauses playback the moment it reaches a checkpoint, and until this
 * existed the only thing on screen was a stopped picture. In fullscreen that was
 * the whole experience: the quiz was portalled somewhere the browser does not
 * paint, so a student sat looking at a frozen frame with nothing to act on. The
 * portal is fixed now, but the explanation should not depend on the quiz having
 * loaded, or on the caller having wired anything at all.
 *
 * `role="status"` rather than `alert`: it explains a state, it does not
 * interrupt. `pointerEvents: none` so it never eats a tap meant for the picture.
 */

export default function CheckpointNotice() {
  return (
    <Box
      role="status"
      sx={{
        position: 'absolute',
        inset: 0,
        // Above every control the player draws, below the quiz itself (10).
        zIndex: 6,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'rgba(0,0,0,0.45)',
        pointerEvents: 'none',
        px: 2,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          maxWidth: 420,
          px: 2.5,
          py: 1.75,
          borderRadius: 3,
          bgcolor: 'rgba(0,0,0,0.82)',
          color: '#fff',
        }}
      >
        <QuizRoundedIcon sx={{ fontSize: 28, flexShrink: 0 }} />
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '1rem', lineHeight: 1.3 }}>
            Checkpoint reached
          </Typography>
          <Typography sx={{ fontSize: '0.85rem', lineHeight: 1.45, color: 'rgba(255,255,255,0.82)' }}>
            Answer the questions to keep watching.
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

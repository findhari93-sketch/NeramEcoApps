'use client';

import { Box, IconButton, Typography, CircularProgress } from '@neram/ui';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import Forward10RoundedIcon from '@mui/icons-material/Forward10Rounded';
import Replay10RoundedIcon from '@mui/icons-material/Replay10Rounded';
import SpeedRoundedIcon from '@mui/icons-material/SpeedRounded';
import type { Ripple } from '../hooks/useTouchGestures';

/**
 * Everything that lives over the middle of the picture: the big play target, the
 * buffering spinner, and the double-tap ripples.
 *
 * The spinner is new and the reason is specific to how this video is delivered.
 * The byte proxy answers at most 4MB per request, so a weak connection stalls
 * often and briefly. With nothing on screen a stall was indistinguishable from a
 * freeze, and a student's reasonable response to a frozen player is to reload,
 * which throws away the buffer and starts the stall again.
 */

export interface CenterOverlayProps {
  playing: boolean;
  buffering: boolean;
  ripple: Ripple | null;
  holdingSpeed: boolean;
  speed: number;
  onTogglePlay: () => void;
}

export default function CenterOverlay({
  playing,
  buffering,
  ripple,
  holdingSpeed,
  speed,
  onTogglePlay,
}: CenterOverlayProps) {
  return (
    <>
      {buffering && (
        <Box
          role="status"
          aria-label="Buffering"
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 3,
            pointerEvents: 'none',
          }}
        >
          <CircularProgress size={44} thickness={3} sx={{ color: 'rgba(255,255,255,0.9)' }} />
        </Box>
      )}

      {/* Big centre target while paused. Easiest thing to hit on a phone.
          Hidden while buffering so the two never stack. */}
      {!playing && !buffering && (
        <IconButton
          onClick={onTogglePlay}
          aria-label="Play"
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 72,
            height: 72,
            bgcolor: 'rgba(0,0,0,0.55)',
            color: '#fff',
            zIndex: 3,
            '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' },
          }}
        >
          <PlayArrowRoundedIcon sx={{ fontSize: 44 }} />
        </IconButton>
      )}

      {ripple && (
        <Box
          key={ripple.key}
          aria-hidden
          sx={{
            position: 'absolute',
            top: '50%',
            [ripple.side]: '12%',
            transform: 'translateY(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 0.5,
            color: '#fff',
            bgcolor: 'rgba(0,0,0,0.45)',
            borderRadius: '50%',
            width: 88,
            height: 88,
            justifyContent: 'center',
            zIndex: 3,
            pointerEvents: 'none',
          }}
        >
          {ripple.side === 'left' ? (
            <Replay10RoundedIcon sx={{ fontSize: 28 }} />
          ) : (
            <Forward10RoundedIcon sx={{ fontSize: 28 }} />
          )}
          <Typography sx={{ fontSize: 12, fontWeight: 800 }}>
            {ripple.side === 'left' ? '-' : '+'}
            {ripple.seconds}s
          </Typography>
        </Box>
      )}

      {holdingSpeed && (
        <Box
          role="status"
          sx={{
            position: 'absolute',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            bgcolor: 'rgba(0,0,0,0.82)',
            color: '#fff',
            px: 1.5,
            py: 0.75,
            borderRadius: 2,
            zIndex: 3,
            pointerEvents: 'none',
          }}
        >
          <SpeedRoundedIcon sx={{ fontSize: 16 }} />
          <Typography sx={{ fontSize: 12, fontWeight: 800 }}>{speed}x</Typography>
        </Box>
      )}
    </>
  );
}

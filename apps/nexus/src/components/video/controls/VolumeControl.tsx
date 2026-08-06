'use client';

import { Box, IconButton, Slider } from '@neram/ui';
import VolumeUpRoundedIcon from '@mui/icons-material/VolumeUpRounded';
import VolumeDownRoundedIcon from '@mui/icons-material/VolumeDownRounded';
import VolumeOffRoundedIcon from '@mui/icons-material/VolumeOffRounded';

/**
 * Mute, plus a slider that grows out of it on hover.
 *
 * The slider is not rendered at all when the surface reports volume is not
 * settable, which is every iPhone: iOS ignores writes to `video.volume` and
 * leaves only the hardware buttons. A slider that moves and changes nothing is
 * worse than no slider. Mute IS honoured there, so the button always stays.
 */

export interface VolumeControlProps {
  volume: number;
  muted: boolean;
  settable: boolean;
  onVolumeChange: (value: number) => void;
  onToggleMute: () => void;
}

export default function VolumeControl({
  volume,
  muted,
  settable,
  onVolumeChange,
  onToggleMute,
}: VolumeControlProps) {
  const effective = muted ? 0 : volume;
  const Icon = effective === 0 ? VolumeOffRoundedIcon : effective < 0.5 ? VolumeDownRoundedIcon : VolumeUpRoundedIcon;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        // The slider is revealed by intent rather than always taking up room,
        // which keeps the bar usable at 375px.
        '&:hover .volume-slider, &:focus-within .volume-slider': { width: 72, opacity: 1, ml: 0.5 },
      }}
    >
      <IconButton
        onClick={onToggleMute}
        aria-label={muted || effective === 0 ? 'Unmute' : 'Mute'}
        sx={{ color: '#fff', width: 48, height: 48 }}
      >
        <Icon sx={{ fontSize: 22 }} />
      </IconButton>

      {settable && (
        <Box
          className="volume-slider"
          sx={{
            width: 0,
            opacity: 0,
            overflow: 'hidden',
            transition: 'width 160ms ease, opacity 160ms ease, margin-left 160ms ease',
            '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            // No hover on touch, so there is nothing to reveal it. Those devices
            // get the gesture and the hardware buttons instead.
            '@media (hover: none)': { display: 'none' },
          }}
        >
          <Slider
            size="small"
            value={effective}
            min={0}
            max={1}
            step={0.01}
            onChange={(_, v) => onVolumeChange(Number(v))}
            aria-label="Volume"
            sx={{
              color: '#fff',
              py: 1.5,
              '& .MuiSlider-thumb': { width: 12, height: 12 },
              '& .MuiSlider-rail': { opacity: 0.35 },
            }}
          />
        </Box>
      )}
    </Box>
  );
}

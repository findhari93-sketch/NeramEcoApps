'use client';

import { Box, IconButton, Typography } from '@neram/ui';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import PauseRoundedIcon from '@mui/icons-material/PauseRounded';
import Replay10RoundedIcon from '@mui/icons-material/Replay10Rounded';
import Forward10RoundedIcon from '@mui/icons-material/Forward10Rounded';
import FullscreenRoundedIcon from '@mui/icons-material/FullscreenRounded';
import FullscreenExitRoundedIcon from '@mui/icons-material/FullscreenExitRounded';
import PictureInPictureAltRoundedIcon from '@mui/icons-material/PictureInPictureAltRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import SeekBar, { type SeekMark } from './SeekBar';
import VolumeControl from './VolumeControl';
import SettingsMenu from './SettingsMenu';
import { formatClock, type TimeRange } from '../format';
import type { TextTrackDescriptor } from '../types';

/**
 * Layout only. Every control it renders takes a callback the player supplied,
 * and none of them can reach a transport or recompute a boundary.
 */

export interface ControlBarProps {
  visible: boolean;
  playing: boolean;
  current: number;
  duration: number;
  seekCeiling: number;
  buffered: ReadonlyArray<TimeRange>;
  marks?: SeekMark[];
  onSeek: (seconds: number) => void;
  onRefusedSeek: () => void;
  onScrubbingChange: (scrubbing: boolean) => void;
  onTogglePlay: () => void;
  onSkip: (delta: number) => void;

  speed: number;
  maxRate: number;
  onSpeedChange: (speed: number) => void;

  volume: number;
  muted: boolean;
  volumeSettable: boolean;
  onVolumeChange: (value: number) => void;
  onToggleMute: () => void;

  tracks: ReadonlyArray<TextTrackDescriptor>;
  activeTrack: string | null;
  onTrackChange: (id: string | null) => void;

  showFullscreen: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;

  showPip: boolean;
  pipActive: boolean;
  onTogglePip: () => void;

  /** Keeps the settings menu inside the fullscreen subtree. */
  menuContainer?: HTMLElement | null;
}

export default function ControlBar(props: ControlBarProps) {
  const {
    visible,
    playing,
    current,
    duration,
    seekCeiling,
    buffered,
    marks,
    onSeek,
    onRefusedSeek,
    onScrubbingChange,
    onTogglePlay,
    onSkip,
    speed,
    maxRate,
    onSpeedChange,
    volume,
    muted,
    volumeSettable,
    onVolumeChange,
    onToggleMute,
    tracks,
    activeTrack,
    onTrackChange,
    showFullscreen,
    isFullscreen,
    onToggleFullscreen,
    showPip,
    pipActive,
    onTogglePip,
    menuContainer,
  } = props;

  const bounded = Number.isFinite(seekCeiling);
  const lockedAhead = bounded && duration > 0 && seekCeiling < duration - 1;
  // A control that is visibly present and silently does nothing reads as broken,
  // so forward-10 is disabled once there is nothing ahead to reach.
  const forwardBlocked = bounded && current >= seekCeiling - 0.5;

  return (
    <Box
      sx={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        px: { xs: 1, sm: 2 },
        pb: { xs: 0.5, sm: 1 },
        pt: 4,
        background: 'linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0))',
        opacity: visible ? 1 : 0,
        // Not just invisible: an invisible bar still swallows the tap that was
        // meant to bring it back.
        pointerEvents: visible ? 'auto' : 'none',
        transition: 'opacity 200ms ease',
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        zIndex: 4,
      }}
    >
      <SeekBar
        current={current}
        duration={duration}
        seekCeiling={seekCeiling}
        buffered={buffered}
        marks={marks}
        onSeek={onSeek}
        onRefused={onRefusedSeek}
        onScrubbingChange={onScrubbingChange}
        disabled={duration <= 0}
      />

      <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0, sm: 0.5 }, mt: -0.5 }}>
        <IconButton
          onClick={onTogglePlay}
          aria-label={playing ? 'Pause' : 'Play'}
          sx={{ color: '#fff', width: 48, height: 48 }}
        >
          {playing ? <PauseRoundedIcon /> : <PlayArrowRoundedIcon />}
        </IconButton>

        <IconButton
          onClick={() => onSkip(-10)}
          aria-label="Back 10 seconds"
          sx={{ color: '#fff', width: 48, height: 48 }}
        >
          <Replay10RoundedIcon />
        </IconButton>

        <IconButton
          onClick={() => onSkip(10)}
          aria-label="Forward 10 seconds"
          disabled={forwardBlocked}
          sx={{
            color: '#fff',
            width: 48,
            height: 48,
            '&.Mui-disabled': { color: 'rgba(255,255,255,0.3)' },
          }}
        >
          <Forward10RoundedIcon />
        </IconButton>

        <Typography
          sx={{
            color: '#fff',
            fontSize: 12,
            fontVariantNumeric: 'tabular-nums',
            ml: 0.5,
            whiteSpace: 'nowrap',
          }}
        >
          {formatClock(current)} / {formatClock(duration)}
        </Typography>

        <Box sx={{ flex: 1 }} />

        <VolumeControl
          volume={volume}
          muted={muted}
          settable={volumeSettable}
          onVolumeChange={onVolumeChange}
          onToggleMute={onToggleMute}
        />

        <SettingsMenu
          speed={speed}
          maxRate={maxRate}
          onSpeedChange={onSpeedChange}
          tracks={tracks}
          activeTrack={activeTrack}
          onTrackChange={onTrackChange}
          container={menuContainer}
        />

        {showPip && (
          <IconButton
            onClick={onTogglePip}
            aria-label={pipActive ? 'Exit picture in picture' : 'Picture in picture'}
            sx={{
              color: '#fff',
              width: 48,
              height: 48,
              display: { xs: 'none', sm: 'inline-flex' },
            }}
          >
            <PictureInPictureAltRoundedIcon sx={{ fontSize: 20 }} />
          </IconButton>
        )}

        {showFullscreen && (
          <IconButton
            onClick={onToggleFullscreen}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            sx={{ color: '#fff', width: 48, height: 48 }}
          >
            {isFullscreen ? <FullscreenExitRoundedIcon /> : <FullscreenRoundedIcon />}
          </IconButton>
        )}
      </Box>

      {lockedAhead && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, pb: 0.5, px: 0.5 }}>
          <LockRoundedIcon sx={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }} />
          <Typography sx={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
            The rest unlocks when you pass this checkpoint
          </Typography>
        </Box>
      )}
    </Box>
  );
}

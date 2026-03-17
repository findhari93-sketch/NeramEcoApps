'use client';

import {
  Box,
  Typography,
  IconButton,
  Slider,
  Chip,
  Select,
  MenuItem,
  alpha,
  useTheme,
} from '@neram/ui';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import Replay10Icon from '@mui/icons-material/Replay10';
import Forward10Icon from '@mui/icons-material/Forward10';
import SpeedIcon from '@mui/icons-material/Speed';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AudioTrack {
  id: string;
  language: string;
  language_label: string;
  audio_url: string;
  audio_duration_seconds: number | null;
}

interface AudioPlayerProps {
  tracks: AudioTrack[];
  initialPosition?: number;
  initialLanguage?: string;
  onPositionChange?: (seconds: number, language: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
const AUTO_SAVE_INTERVAL = 30_000; // 30 seconds

function formatTime(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AudioPlayer({
  tracks,
  initialPosition = 0,
  initialLanguage,
  onPositionChange,
}: AudioPlayerProps) {
  const theme = useTheme();
  const audioRef = useRef<HTMLAudioElement>(null);

  // ---- state ----
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(initialPosition);
  const [duration, setDuration] = useState(0);
  const [speedIndex, setSpeedIndex] = useState(
    SPEED_OPTIONS.indexOf(1) // default 1x
  );
  const [minimized, setMinimized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Track selection
  const [activeLanguage, setActiveLanguage] = useState(
    initialLanguage ?? tracks[0]?.language ?? ''
  );
  const activeTrack = tracks.find((t) => t.language === activeLanguage) ?? tracks[0];

  // Refs for auto-save debounce
  const lastSavedRef = useRef(0);
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingSeekRef = useRef<number | null>(null);

  // ------------------------------------------------------------------
  // Audio element event handlers
  // ------------------------------------------------------------------

  const handleLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setDuration(audio.duration);
    setIsLoading(false);
    setError(null);

    // Resume from initial position or pending seek
    const seekTo = pendingSeekRef.current ?? initialPosition;
    if (seekTo > 0 && seekTo < audio.duration) {
      audio.currentTime = seekTo;
      setCurrentTime(seekTo);
    }
    pendingSeekRef.current = null;
  }, [initialPosition]);

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentTime(audio.currentTime);
  }, []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const handleError = useCallback(() => {
    setIsPlaying(false);
    setIsLoading(false);
    setError('Failed to load audio');
  }, []);

  const handleWaiting = useCallback(() => {
    setIsLoading(true);
  }, []);

  const handleCanPlay = useCallback(() => {
    setIsLoading(false);
  }, []);

  // ------------------------------------------------------------------
  // Playback controls
  // ------------------------------------------------------------------

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || error) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().catch(() => setError('Playback failed'));
      setIsPlaying(true);
    }
  }, [isPlaying, error]);

  const skip = useCallback((delta: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const next = Math.max(0, Math.min(audio.duration || 0, audio.currentTime + delta));
    audio.currentTime = next;
    setCurrentTime(next);
  }, []);

  const handleSeek = useCallback((_: Event | React.SyntheticEvent, value: number | number[]) => {
    const audio = audioRef.current;
    if (!audio) return;
    const v = Array.isArray(value) ? value[0] : value;
    audio.currentTime = v;
    setCurrentTime(v);
  }, []);

  const cycleSpeed = useCallback(() => {
    setSpeedIndex((prev) => {
      const next = (prev + 1) % SPEED_OPTIONS.length;
      if (audioRef.current) {
        audioRef.current.playbackRate = SPEED_OPTIONS[next];
      }
      return next;
    });
  }, []);

  // ------------------------------------------------------------------
  // Language switch — maintain position
  // ------------------------------------------------------------------

  const switchLanguage = useCallback(
    (lang: string) => {
      if (lang === activeLanguage) return;
      const audio = audioRef.current;
      const pos = audio ? audio.currentTime : currentTime;
      const wasPlaying = isPlaying;

      if (audio) {
        audio.pause();
      }
      setIsPlaying(false);
      pendingSeekRef.current = pos;
      setActiveLanguage(lang);

      // After src changes and metadata loads, the loadedmetadata handler
      // will seek to pendingSeekRef and we resume if needed.
      if (wasPlaying) {
        // Small delay to let the new source start loading
        const resumeAfterLoad = () => {
          audioRef.current?.play().catch(() => {});
          setIsPlaying(true);
          audioRef.current?.removeEventListener('canplay', resumeAfterLoad);
        };
        // We attach via a timeout so the src has changed
        setTimeout(() => {
          audioRef.current?.addEventListener('canplay', resumeAfterLoad, { once: true });
        }, 0);
      }
    },
    [activeLanguage, currentTime, isPlaying]
  );

  // ------------------------------------------------------------------
  // Auto-save position every 30s while playing
  // ------------------------------------------------------------------

  useEffect(() => {
    if (!onPositionChange) return;

    if (isPlaying) {
      autoSaveTimerRef.current = setInterval(() => {
        const audio = audioRef.current;
        if (!audio) return;
        const pos = Math.floor(audio.currentTime);
        if (pos !== lastSavedRef.current) {
          lastSavedRef.current = pos;
          onPositionChange(pos, activeLanguage);
        }
      }, AUTO_SAVE_INTERVAL);
    }

    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [isPlaying, onPositionChange, activeLanguage]);

  // Save position on unmount
  useEffect(() => {
    return () => {
      if (onPositionChange && audioRef.current) {
        onPositionChange(Math.floor(audioRef.current.currentTime), activeLanguage);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------------
  // Sync playback rate when speed changes
  // ------------------------------------------------------------------

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = SPEED_OPTIONS[speedIndex];
    }
  }, [speedIndex]);

  // ------------------------------------------------------------------
  // Early return if no tracks
  // ------------------------------------------------------------------

  if (!tracks.length || !activeTrack) return null;

  const speed = SPEED_OPTIONS[speedIndex];
  const effectiveDuration = duration || activeTrack.audio_duration_seconds || 0;

  // ------------------------------------------------------------------
  // Minimized view
  // ------------------------------------------------------------------

  if (minimized) {
    return (
      <Box
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: 40,
          zIndex: theme.zIndex.appBar + 10,
          bgcolor: alpha(theme.palette.background.paper, 0.85),
          backdropFilter: 'blur(12px)',
          borderTop: `1px solid ${alpha(theme.palette.divider, 0.15)}`,
          display: 'flex',
          alignItems: 'center',
          px: 1,
          gap: 0.5,
        }}
      >
        {/* Hidden audio element */}
        <audio
          ref={audioRef}
          src={activeTrack.audio_url}
          preload="metadata"
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          onError={handleError}
          onWaiting={handleWaiting}
          onCanPlay={handleCanPlay}
        />

        <IconButton size="small" onClick={togglePlay} disabled={!!error}>
          {isPlaying ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
        </IconButton>

        <Slider
          size="small"
          value={currentTime}
          max={effectiveDuration || 1}
          onChange={handleSeek}
          sx={{
            flex: 1,
            mx: 1,
            '& .MuiSlider-thumb': { width: 10, height: 10 },
            '& .MuiSlider-rail': { opacity: 0.3 },
          }}
        />

        <Typography variant="caption" sx={{ minWidth: 40, textAlign: 'right' }}>
          {formatTime(currentTime)}
        </Typography>

        <IconButton size="small" onClick={() => setMinimized(false)}>
          <ExpandLessIcon fontSize="small" />
        </IconButton>
      </Box>
    );
  }

  // ------------------------------------------------------------------
  // Full player
  // ------------------------------------------------------------------

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 64,
        zIndex: theme.zIndex.appBar + 10,
        bgcolor: alpha(theme.palette.background.paper, 0.88),
        backdropFilter: 'blur(12px)',
        borderTop: `1px solid ${alpha(theme.palette.divider, 0.15)}`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        px: { xs: 1, sm: 2 },
      }}
    >
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={activeTrack.audio_url}
        preload="metadata"
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onError={handleError}
        onWaiting={handleWaiting}
        onCanPlay={handleCanPlay}
      />

      {/* ---- Top row: seek bar ---- */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
        <Typography
          variant="caption"
          sx={{ minWidth: 36, textAlign: 'right', fontSize: '0.7rem' }}
        >
          {formatTime(currentTime)}
        </Typography>

        <Slider
          size="small"
          value={currentTime}
          max={effectiveDuration || 1}
          onChange={handleSeek}
          sx={{
            flex: 1,
            '& .MuiSlider-thumb': {
              width: 12,
              height: 12,
              transition: 'none',
              '&:hover, &.Mui-focusVisible': {
                boxShadow: `0 0 0 6px ${alpha(theme.palette.primary.main, 0.16)}`,
              },
            },
            '& .MuiSlider-rail': { opacity: 0.28 },
          }}
        />

        <Typography
          variant="caption"
          sx={{ minWidth: 36, textAlign: 'left', fontSize: '0.7rem' }}
        >
          {formatTime(effectiveDuration)}
        </Typography>
      </Box>

      {/* ---- Bottom row: controls ---- */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: { xs: 0.5, sm: 1 },
          mt: -0.5,
        }}
      >
        {/* Language selector (only if multiple tracks) */}
        {tracks.length > 1 && (
          <Select
            size="small"
            value={activeLanguage}
            onChange={(e) => switchLanguage(e.target.value as string)}
            variant="standard"
            disableUnderline
            sx={{
              fontSize: '0.75rem',
              minWidth: 56,
              '& .MuiSelect-select': { py: 0, pr: '20px !important' },
              display: { xs: 'none', sm: 'inline-flex' },
            }}
          >
            {tracks.map((t) => (
              <MenuItem key={t.id} value={t.language} sx={{ fontSize: '0.8rem' }}>
                {t.language_label}
              </MenuItem>
            ))}
          </Select>
        )}

        {/* Skip back */}
        <IconButton
          size="small"
          onClick={() => skip(-15)}
          sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
        >
          <Replay10Icon fontSize="small" />
        </IconButton>

        {/* Play / Pause */}
        <IconButton
          onClick={togglePlay}
          disabled={!!error}
          sx={{
            bgcolor: alpha(theme.palette.primary.main, 0.12),
            '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.22) },
            width: 40,
            height: 40,
          }}
        >
          {isLoading ? (
            <Box
              sx={{
                width: 20,
                height: 20,
                border: `2px solid ${alpha(theme.palette.primary.main, 0.3)}`,
                borderTopColor: theme.palette.primary.main,
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
                '@keyframes spin': { to: { transform: 'rotate(360deg)' } },
              }}
            />
          ) : isPlaying ? (
            <PauseIcon />
          ) : (
            <PlayArrowIcon />
          )}
        </IconButton>

        {/* Skip forward */}
        <IconButton
          size="small"
          onClick={() => skip(15)}
          sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
        >
          <Forward10Icon fontSize="small" />
        </IconButton>

        {/* Speed chip */}
        <Chip
          icon={<SpeedIcon sx={{ fontSize: 14 }} />}
          label={`${speed}x`}
          size="small"
          variant="outlined"
          onClick={cycleSpeed}
          sx={{
            fontSize: '0.7rem',
            height: 24,
            cursor: 'pointer',
            '& .MuiChip-icon': { ml: '4px' },
          }}
        />

        {/* Language chip for mobile (when multiple tracks) */}
        {tracks.length > 1 && (
          <Chip
            label={activeTrack.language_label}
            size="small"
            variant="outlined"
            onClick={() => {
              const idx = tracks.findIndex((t) => t.language === activeLanguage);
              const next = tracks[(idx + 1) % tracks.length];
              switchLanguage(next.language);
            }}
            sx={{
              fontSize: '0.7rem',
              height: 24,
              cursor: 'pointer',
              display: { xs: 'inline-flex', sm: 'none' },
            }}
          />
        )}

        {/* Minimize */}
        <IconButton size="small" onClick={() => setMinimized(true)} sx={{ ml: 'auto' }}>
          <ExpandMoreIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Error message */}
      {error && (
        <Typography
          variant="caption"
          color="error"
          sx={{
            position: 'absolute',
            bottom: 2,
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: '0.65rem',
          }}
        >
          {error}
        </Typography>
      )}
    </Box>
  );
}

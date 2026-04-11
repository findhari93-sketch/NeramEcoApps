'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { Box, Snackbar, Button, IconButton, Slider, Typography, alpha, useTheme } from '@neram/ui';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import type { NexusFoundationSectionWithQuiz } from '@neram/database/types';

declare global {
  // eslint-disable-next-line no-var
  var onYouTubeIframeAPIReady: (() => void) | undefined;
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}

interface VideoPlayerProps {
  videoId: string;
  sections: NexusFoundationSectionWithQuiz[];
  currentSectionIndex: number;
  resumePosition?: number;
  onSectionEnd: (sectionIndex: number) => void;
  onTimeUpdate?: (seconds: number) => void;
}

export default function VideoPlayer({
  videoId,
  sections,
  currentSectionIndex,
  resumePosition,
  onSectionEnd,
  onTimeUpdate,
}: VideoPlayerProps) {
  const theme = useTheme();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasTriggeredQuizRef = useRef<Set<number>>(new Set());
  const isRewatchingRef = useRef(false);
  const rewatchMaxTimeRef = useRef(0);
  const isPlayerReady = useRef(false);

  // Stable refs for values used in polling — prevents player re-creation
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;
  const currentSectionIndexRef = useRef(currentSectionIndex);
  currentSectionIndexRef.current = currentSectionIndex;
  const onSectionEndRef = useRef(onSectionEnd);
  onSectionEndRef.current = onSectionEnd;
  const onTimeUpdateRef = useRef(onTimeUpdate);
  onTimeUpdateRef.current = onTimeUpdate;

  const [showResume, setShowResume] = useState(false);
  const [resumeTime, setResumeTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const hideControlsTimer = useRef<NodeJS.Timeout | null>(null);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const scheduleHideControls = useCallback(() => {
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    setShowControls(true);
    if (isPlaying) {
      hideControlsTimer.current = setTimeout(() => setShowControls(false), 3000);
    }
  }, [isPlaying]);

  // startPolling reads from refs — never changes identity
  const startPolling = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      if (!playerRef.current?.getCurrentTime) return;

      const time = playerRef.current.getCurrentTime();
      const dur = playerRef.current.getDuration?.() || 0;
      setCurrentTime(time);
      if (dur > 0) setDuration(dur);
      onTimeUpdateRef.current?.(Math.floor(time));

      // Check ALL sections for quiz triggers (earliest untriggered first)
      // This ensures quizzes trigger even if currentSectionIndex is stale
      const allSections = sectionsRef.current;
      const videoDuration = playerRef.current?.getDuration?.() || 0;
      for (let i = 0; i < allSections.length; i++) {
        const section = allSections[i];
        // Skip sections whose quiz is already passed (e.g. when user seeks forward)
        if (section.quiz_attempt?.passed && !hasTriggeredQuizRef.current.has(i)) {
          hasTriggeredQuizRef.current.add(i);
          continue;
        }
        // For the last section, clamp end_timestamp to (videoDuration - 10)
        // so the quiz triggers before the video ends (handles cases where
        // section end_timestamp exceeds actual video duration)
        const isLastSection = i === allSections.length - 1;
        const effectiveEnd = isLastSection && videoDuration > 0
          ? Math.min(section.end_timestamp_seconds, videoDuration - 10)
          : section.end_timestamp_seconds;
        if (
          time >= effectiveEnd &&
          !hasTriggeredQuizRef.current.has(i)
        ) {
          hasTriggeredQuizRef.current.add(i);
          isRewatchingRef.current = false;
          rewatchMaxTimeRef.current = 0;
          // Auto-pause video so the mandatory quiz can be taken
          if (playerRef.current?.pauseVideo) {
            playerRef.current.pauseVideo();
          }
          onSectionEndRef.current(i);
          return;
        }
      }

      // Anti-gaming: prevent seeking past section end during rewatch
      if (isRewatchingRef.current && time > rewatchMaxTimeRef.current) {
        playerRef.current?.seekTo?.(rewatchMaxTimeRef.current - 2, true);
        return;
      }
    }, 500);
  }, []); // No dependencies — reads from refs

  // initPlayer only depends on videoId — player is created once per video
  const initPlayer = useCallback(() => {
    if (!containerRef.current || !window.YT?.Player) return;

    playerRef.current = new window.YT.Player(containerRef.current, {
      videoId,
      playerVars: {
        playsinline: 1,
        rel: 0,
        modestbranding: 1,
        controls: 0,
        disablekb: 1,
        fs: 0,
        iv_load_policy: 3,
        cc_load_policy: 0,
        showinfo: 0,
        origin: typeof window !== 'undefined' ? window.location.origin : '',
      },
      events: {
        onReady: () => {
          isPlayerReady.current = true;
          const dur = playerRef.current?.getDuration?.() || 0;
          if (dur > 0) setDuration(dur);
          if (resumePosition && resumePosition > 10) {
            setResumeTime(resumePosition);
            setShowResume(true);
          }
        },
        onStateChange: (event: any) => {
          if (event.data === window.YT.PlayerState.PLAYING) {
            // If quiz is open, force re-pause (handles BUFFERING→PLAYING race)
            if ((window as any).__foundationPlayer?.quizPaused) {
              playerRef.current?.pauseVideo?.();
              return;
            }
            setIsPlaying(true);
            startPolling();
          } else if (event.data === window.YT.PlayerState.PAUSED) {
            setIsPlaying(false);
            if (intervalRef.current) clearInterval(intervalRef.current);
          } else if (event.data === window.YT.PlayerState.ENDED) {
            setIsPlaying(false);
            if (intervalRef.current) clearInterval(intervalRef.current);
            // Fallback: trigger any remaining untriggered section quiz
            // (handles case where last section end_timestamp > video duration)
            const allSections = sectionsRef.current;
            for (let i = 0; i < allSections.length; i++) {
              // Skip already-passed sections
              if (allSections[i].quiz_attempt?.passed) {
                hasTriggeredQuizRef.current.add(i);
                continue;
              }
              if (!hasTriggeredQuizRef.current.has(i)) {
                hasTriggeredQuizRef.current.add(i);
                onSectionEndRef.current(i);
                break;
              }
            }
          }
        },
      },
    });
  }, [videoId, resumePosition, startPolling]);

  useEffect(() => {
    if (window.YT?.Player) {
      initPlayer();
      return;
    }

    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScript = document.getElementsByTagName('script')[0];
    firstScript?.parentNode?.insertBefore(tag, firstScript);

    window.onYouTubeIframeAPIReady = () => {
      initPlayer();
    };

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      isPlayerReady.current = false;
      if (playerRef.current?.destroy) playerRef.current.destroy();
      window.onYouTubeIframeAPIReady = undefined;
    };
  }, [initPlayer]);

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const handlePlayPause = () => {
    if (!playerRef.current || !isPlayerReady.current) return;
    if (isPlaying) {
      playerRef.current.pauseVideo?.();
    } else {
      playerRef.current.playVideo?.();
    }
    scheduleHideControls();
  };

  const handleSeek = (_: Event, value: number | number[]) => {
    const seekTime = value as number;
    // Block seeking during rewatch mode
    if (isRewatchingRef.current && seekTime > rewatchMaxTimeRef.current) return;
    playerRef.current?.seekTo?.(seekTime, true);
    setCurrentTime(seekTime);
    scheduleHideControls();
  };

  const handleFullscreen = async () => {
    if (!wrapperRef.current) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await wrapperRef.current.requestFullscreen();
    }
    scheduleHideControls();
  };

  const handleResume = () => {
    if (isPlayerReady.current) {
      playerRef.current?.seekTo?.(resumeTime, true);
      playerRef.current?.playVideo?.();
    }
    setShowResume(false);
  };

  const handleStartOver = () => {
    if (isPlayerReady.current) {
      playerRef.current?.seekTo?.(0, true);
      playerRef.current?.playVideo?.();
    }
    setShowResume(false);
  };

  // Expose methods for external control
  useEffect(() => {
    (window as any).__foundationPlayer = {
      seekTo: (seconds: number) => {
        if (isPlayerReady.current) playerRef.current?.seekTo?.(seconds, true);
      },
      play: () => {
        if (isPlayerReady.current) playerRef.current?.playVideo?.();
      },
      pause: () => {
        if (isPlayerReady.current) playerRef.current?.pauseVideo?.();
      },
      getCurrentTime: () => playerRef.current?.getCurrentTime?.() || 0,
      resetSectionTrigger: (index: number) => hasTriggeredQuizRef.current.delete(index),
      setRewatchMode: (enabled: boolean, maxTime: number) => {
        isRewatchingRef.current = enabled;
        rewatchMaxTimeRef.current = maxTime;
      },
      quizPaused: false,
    };
    return () => {
      delete (window as any).__foundationPlayer;
    };
  }, []);

  return (
    <Box sx={{ position: 'relative', width: '100%' }}>
      {/* 16:9 aspect ratio container */}
      <Box
        ref={wrapperRef}
        onContextMenu={(e) => e.preventDefault()}
        onMouseMove={scheduleHideControls}
        onTouchStart={scheduleHideControls}
        onClick={(e) => {
          // Only toggle play/pause if clicking the overlay area (not controls)
          if ((e.target as HTMLElement).closest('[data-controls]')) return;
          handlePlayPause();
        }}
        sx={{
          position: 'relative',
          width: '100%',
          pt: isFullscreen ? 0 : '56.25%',
          height: isFullscreen ? '100vh' : 'auto',
          bgcolor: '#000',
          borderRadius: isFullscreen ? 0 : { xs: 0, sm: 2 },
          overflow: 'hidden',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        {/* YouTube iframe */}
        <Box
          ref={containerRef}
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
          }}
        />

        {/* Overlay — blocks YouTube clicks + hides YouTube UI when paused */}
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            zIndex: 2,
            bgcolor: !isPlaying ? 'rgba(0,0,0,0.6)' : 'transparent',
            transition: 'background-color 300ms ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Large play button when paused */}
          {!isPlaying && (
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                bgcolor: 'rgba(255,255,255,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <PlayArrowIcon sx={{ fontSize: 40, color: '#fff' }} />
            </Box>
          )}
        </Box>

        {/* Custom controls bar */}
        <Box
          data-controls
          sx={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 3,
            background: 'linear-gradient(transparent, rgba(0,0,0,0.75))',
            px: { xs: 1, sm: 2 },
            pt: 3,
            pb: { xs: 0.5, sm: 1 },
            opacity: showControls || !isPlaying ? 1 : 0,
            transition: 'opacity 300ms ease',
          }}
        >
          {/* Progress slider */}
          <Slider
            value={currentTime}
            min={0}
            max={duration || 100}
            onChange={handleSeek}
            size="small"
            sx={{
              color: theme.palette.primary.main,
              height: 4,
              py: 0.5,
              '& .MuiSlider-thumb': {
                width: 14,
                height: 14,
                transition: 'width 150ms, height 150ms',
                '&:hover, &.Mui-focusVisible': { width: 18, height: 18 },
              },
              '& .MuiSlider-rail': { opacity: 0.3, bgcolor: '#fff' },
              '& .MuiSlider-track': { border: 'none' },
            }}
          />

          {/* Controls row */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: { xs: 0.5, sm: 1 },
              mt: -0.5,
            }}
          >
            <IconButton
              onClick={(e) => { e.stopPropagation(); handlePlayPause(); }}
              sx={{ color: '#fff', p: { xs: 0.75, sm: 1 } }}
            >
              {isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
            </IconButton>

            <Typography
              variant="caption"
              sx={{ color: '#fff', fontFamily: 'monospace', fontSize: { xs: '0.7rem', sm: '0.8rem' }, minWidth: 80 }}
            >
              {formatTime(currentTime)} / {formatTime(duration)}
            </Typography>

            <Box sx={{ flex: 1 }} />

            <IconButton
              onClick={(e) => { e.stopPropagation(); handleFullscreen(); }}
              sx={{ color: '#fff', p: { xs: 0.75, sm: 1 } }}
            >
              {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
            </IconButton>
          </Box>
        </Box>
      </Box>

      {/* Resume snackbar */}
      <Snackbar
        open={showResume}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        message={`Resume from ${formatTime(resumeTime)}?`}
        action={
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button color="primary" size="small" onClick={handleResume} sx={{ fontWeight: 600 }}>
              Resume
            </Button>
            <Button color="inherit" size="small" onClick={handleStartOver}>
              Start Over
            </Button>
          </Box>
        }
      />
    </Box>
  );
}

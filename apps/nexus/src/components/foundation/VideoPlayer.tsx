'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { Box, Snackbar, Button } from '@neram/ui';
import type { NexusFoundationSection } from '@neram/database/types';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}

interface VideoPlayerProps {
  videoId: string;
  sections: NexusFoundationSection[];
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
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasTriggeredQuizRef = useRef<Set<number>>(new Set());
  const [showResume, setShowResume] = useState(false);
  const [resumeTime, setResumeTime] = useState(0);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const startPolling = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      if (!playerRef.current?.getCurrentTime) return;

      const currentTime = playerRef.current.getCurrentTime();
      onTimeUpdate?.(Math.floor(currentTime));

      // Check if we've reached a section end
      const currentSection = sections[currentSectionIndex];
      if (
        currentSection &&
        currentTime >= currentSection.end_timestamp_seconds &&
        !hasTriggeredQuizRef.current.has(currentSectionIndex)
      ) {
        hasTriggeredQuizRef.current.add(currentSectionIndex);
        playerRef.current.pauseVideo();
        onSectionEnd(currentSectionIndex);
      }
    }, 500);
  }, [sections, currentSectionIndex, onSectionEnd, onTimeUpdate]);

  const initPlayer = useCallback(() => {
    if (!containerRef.current || !window.YT?.Player) return;

    playerRef.current = new window.YT.Player(containerRef.current, {
      videoId,
      playerVars: {
        playsinline: 1,
        rel: 0,
        modestbranding: 1,
        cc_load_policy: 0,
      },
      events: {
        onReady: () => {
          // Check for resume position
          if (resumePosition && resumePosition > 10) {
            setResumeTime(resumePosition);
            setShowResume(true);
          }
        },
        onStateChange: (event: any) => {
          if (event.data === window.YT.PlayerState.PLAYING) {
            startPolling();
          } else if (event.data === window.YT.PlayerState.PAUSED) {
            if (intervalRef.current) clearInterval(intervalRef.current);
          }
        },
      },
    });
  }, [videoId, resumePosition, startPolling]);

  useEffect(() => {
    // Load YouTube IFrame API
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
      if (playerRef.current?.destroy) playerRef.current.destroy();
      window.onYouTubeIframeAPIReady = undefined;
    };
  }, [initPlayer]);

  // Reset triggered quizzes when section changes
  useEffect(() => {
    // Allow the current section to trigger again if navigated back
  }, [currentSectionIndex]);

  const handleResume = () => {
    if (playerRef.current?.seekTo) {
      playerRef.current.seekTo(resumeTime, true);
      playerRef.current.playVideo();
    }
    setShowResume(false);
  };

  const handleStartOver = () => {
    if (playerRef.current?.seekTo) {
      playerRef.current.seekTo(0, true);
      playerRef.current.playVideo();
    }
    setShowResume(false);
  };

  // Expose methods for external control
  useEffect(() => {
    (window as any).__foundationPlayer = {
      seekTo: (seconds: number) => playerRef.current?.seekTo(seconds, true),
      play: () => playerRef.current?.playVideo(),
      pause: () => playerRef.current?.pauseVideo(),
      getCurrentTime: () => playerRef.current?.getCurrentTime() || 0,
    };
    return () => {
      delete (window as any).__foundationPlayer;
    };
  }, []);

  return (
    <Box sx={{ position: 'relative', width: '100%' }}>
      {/* 16:9 aspect ratio container */}
      <Box
        sx={{
          position: 'relative',
          width: '100%',
          pt: '56.25%', // 16:9
          bgcolor: '#000',
          borderRadius: { xs: 0, sm: 2 },
          overflow: 'hidden',
        }}
      >
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

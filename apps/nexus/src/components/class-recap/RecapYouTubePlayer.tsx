'use client';

import { useEffect, useRef } from 'react';
import { Box } from '@neram/ui';
import type { RecapPlayerSection } from './RecapPlayer';

/**
 * Gated player for a recap whose durable copy is an unlisted YouTube video.
 * Uses the YouTube IFrame Player API (youtube-nocookie) and a polling loop to
 * reproduce the SharePoint player's checkpoint gating: pause at each checkpoint
 * end, fire onSectionEnd for the quiz, and clamp seeking past the checkpoint end
 * during a rewatch. Registers the same window.__recapPlayer handle so the page's
 * quiz/seek/rewatch logic is identical to the SharePoint path.
 */

interface RecapYouTubePlayerProps {
  youtubeId: string;
  sections: RecapPlayerSection[];
  onSectionEnd: (sectionIndex: number) => void;
  onTimeUpdate?: (seconds: number) => void;
}

let apiReadyPromise: Promise<void> | null = null;

/** Load the YouTube IFrame API once and resolve when window.YT is ready. */
function loadYouTubeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  const w = window as any;
  if (w.YT && w.YT.Player) return Promise.resolve();
  if (apiReadyPromise) return apiReadyPromise;

  apiReadyPromise = new Promise<void>((resolve) => {
    const existingReady = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      existingReady?.();
      resolve();
    };
    if (!document.getElementById('youtube-iframe-api')) {
      const tag = document.createElement('script');
      tag.id = 'youtube-iframe-api';
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
  });
  return apiReadyPromise;
}

export default function RecapYouTubePlayer({
  youtubeId,
  sections,
  onSectionEnd,
  onTimeUpdate,
}: RecapYouTubePlayerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);

  const hasTriggeredQuizRef = useRef<Set<number>>(new Set());
  const isRewatchingRef = useRef(false);
  const rewatchMaxTimeRef = useRef(0);
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;
  const onSectionEndRef = useRef(onSectionEnd);
  onSectionEndRef.current = onSectionEnd;
  const onTimeUpdateRef = useRef(onTimeUpdate);
  onTimeUpdateRef.current = onTimeUpdate;

  useEffect(() => {
    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | null = null;

    // Polling replaces the <video> "timeupdate" event (the YT API has none).
    const tick = () => {
      const player = playerRef.current;
      if (!player || typeof player.getCurrentTime !== 'function') return;
      const time = player.getCurrentTime() || 0;
      const duration = typeof player.getDuration === 'function' ? player.getDuration() || 0 : 0;
      onTimeUpdateRef.current?.(time);

      const allSections = sectionsRef.current;
      for (let i = 0; i < allSections.length; i++) {
        const section = allSections[i];
        if (section.passed && !hasTriggeredQuizRef.current.has(i)) {
          hasTriggeredQuizRef.current.add(i);
          continue;
        }
        const isLast = i === allSections.length - 1;
        const effectiveEnd =
          isLast && duration > 0
            ? Math.min(section.end_timestamp_seconds, duration - 5)
            : section.end_timestamp_seconds;
        if (time >= effectiveEnd && !hasTriggeredQuizRef.current.has(i)) {
          hasTriggeredQuizRef.current.add(i);
          isRewatchingRef.current = false;
          rewatchMaxTimeRef.current = 0;
          player.pauseVideo();
          onSectionEndRef.current(i);
          return;
        }
      }

      // Anti-gaming: block seeking past the checkpoint end during a rewatch.
      if (isRewatchingRef.current && time > rewatchMaxTimeRef.current) {
        player.seekTo(Math.max(0, rewatchMaxTimeRef.current - 2), true);
      }
    };

    loadYouTubeApi().then(() => {
      if (cancelled || !hostRef.current) return;
      const w = window as any;
      playerRef.current = new w.YT.Player(hostRef.current, {
        videoId: youtubeId,
        host: 'https://www.youtube-nocookie.com',
        playerVars: {
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          controls: 1,
          fs: 1,
        },
        events: {
          onReady: () => {
            // Register the same control handle the SharePoint player exposes.
            (window as any).__recapPlayer = {
              seekTo: (seconds: number) => playerRef.current?.seekTo(seconds, true),
              play: () => playerRef.current?.playVideo(),
              pause: () => playerRef.current?.pauseVideo(),
              getCurrentTime: () => playerRef.current?.getCurrentTime?.() ?? 0,
              resetSectionTrigger: (index: number) => hasTriggeredQuizRef.current.delete(index),
              setRewatchMode: (enabled: boolean, maxTime: number) => {
                isRewatchingRef.current = enabled;
                rewatchMaxTimeRef.current = maxTime;
              },
            };
            poll = setInterval(tick, 300);
          },
        },
      });
    });

    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
      if ((window as any).__recapPlayer) delete (window as any).__recapPlayer;
      try {
        playerRef.current?.destroy?.();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
    };
  }, [youtubeId]);

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%', bgcolor: '#000' }}>
      {/* YT API replaces this div with the iframe. */}
      <Box
        ref={hostRef}
        sx={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
      />
    </Box>
  );
}

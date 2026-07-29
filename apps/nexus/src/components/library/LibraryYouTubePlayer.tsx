'use client';

/**
 * The Library player.
 *
 * A bare iframe embed cannot be controlled, so chapters could not seek and the
 * watch tracker (which needs a real player instance) never had one to attach
 * to. This uses the YouTube IFrame Player API instead.
 *
 * Unlike RecapYouTubePlayer there is no checkpoint pause and no anti-seek clamp.
 * A recap is a gated lesson you have to earn your way through; the Library is a
 * reference shelf, and a student jumping straight to "Building the first box" is
 * exactly the behaviour this whole feature is for.
 *
 * The player instance is handed back through `playerRef` so the parent can seek
 * to a chapter and pass the same ref to useWatchTracker.
 */

import { useEffect, useRef } from 'react';
import { Box } from '@neram/ui';

interface LibraryYouTubePlayerProps {
  youtubeId: string;
  /** Filled with the YT.Player instance once it is ready. */
  playerRef: React.MutableRefObject<any>;
  onReady?: () => void;
}

let apiReadyPromise: Promise<void> | null = null;

/** Load the YouTube IFrame API once and resolve when window.YT is ready. */
function loadYouTubeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  const w = window as any;
  if (w.YT && w.YT.Player) return Promise.resolve();
  if (apiReadyPromise) return apiReadyPromise;

  apiReadyPromise = new Promise<void>((resolve) => {
    // Chain rather than replace: the recap player registers the same global, and
    // whichever mounts second must not silently drop the first one's callback.
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

export default function LibraryYouTubePlayer({
  youtubeId,
  playerRef,
  onReady,
}: LibraryYouTubePlayerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    let cancelled = false;

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
          onReady: () => onReadyRef.current?.(),
        },
      });
    });

    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy?.();
      } catch {
        /* the iframe may already be gone */
      }
      playerRef.current = null;
    };
  }, [youtubeId, playerRef]);

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%', bgcolor: '#000' }}>
      {/* The YT API replaces this div with the iframe. */}
      <Box
        ref={hostRef}
        sx={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
      />
    </Box>
  );
}

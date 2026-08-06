'use client';

import { useEffect, useRef } from 'react';
import { Box } from '@neram/ui';
import type { VideoSurfaceProps, VideoTransport } from '../types';

/**
 * The YouTube half of the player, for recordings whose only durable copy is an
 * unlisted upload.
 *
 * Be honest about the ceiling. The video id is in the DOM and the iframe is
 * YouTube's, so this deters casual skipping rather than preventing it. What it
 * must not do is deter LESS than the proxied path, which is exactly what
 * happened before: this path ran `controls: 1` with a clamp that only armed
 * during a post-failure rewatch, and because a YouTube-backed recap cannot use
 * Focus Mode at all, that loose player was the only one its students ever saw.
 *
 * The IFrame API has no timeupdate, no seeked and no ratechange, so a poll
 * stands in for all three. The gating rules are not repeated here; the player
 * reads the same lib/video-gate.ts as the <video> path.
 */

const POLL_MS = 300;

interface YouTubeSurfaceProps extends VideoSurfaceProps {
  youtubeId: string;
  onClick?: () => void;
  /**
   * The raw YT.Player, handed back for callers that need more than the transport
   * exposes. The Library's watch tracker is the one that does: it attaches to a
   * real player instance rather than to timestamps.
   */
  rawPlayerRef?: React.MutableRefObject<any>;
}

/**
 * The one place in the video stack that sniffs the user agent, because there is
 * nothing else to go on.
 *
 * On the proxied path `isVolumeSettable` probes the real <video> element and
 * believes the answer. Here the element lives inside someone else's iframe: the
 * IFrame API's getVolume() reports the value we asked for whether or not iOS
 * acted on it, so a probe always says yes. Hiding a dead slider is worth one
 * narrow check.
 */
function isIosLike(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true;
  // iPadOS 13+ reports itself as a Mac. Touch points are the only tell.
  return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1;
}

let apiReadyPromise: Promise<void> | null = null;

/** Load the IFrame API once per page and resolve when window.YT is usable. */
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

export default function YouTubeSurface({
  youtubeId,
  events,
  transportRef,
  onClick,
  rawPlayerRef,
}: YouTubeSurfaceProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const eventsRef = useRef(events);
  eventsRef.current = events;

  useEffect(() => {
    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | null = null;
    // Volume has no event on this path, so it is a state diff rather than a
    // notification. Seeded null so the first read does not report a change.
    let lastVolume: { value: number; muted: boolean } | null = null;

    const tick = () => {
      const player = playerRef.current;
      if (!player || typeof player.getCurrentTime !== 'function') return;
      const time = player.getCurrentTime() || 0;
      const dur = typeof player.getDuration === 'function' ? player.getDuration() || 0 : 0;
      eventsRef.current.onTick(time, dur);

      const value = (player.getVolume?.() ?? 100) / 100;
      const muted = !!player.isMuted?.();
      if (!lastVolume || lastVolume.value !== value || lastVolume.muted !== muted) {
        const first = !lastVolume;
        lastVolume = { value, muted };
        if (!first) eventsRef.current.onVolumeChange(value, muted);
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
          // The scrubber is the whole problem: it lets a student drag past a
          // checkpoint, and a clamp can only pull them back after they have
          // already seen where they landed.
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
        },
        events: {
          onReady: () => {
            if (cancelled) return;
            const transport: VideoTransport = {
              play: () => playerRef.current?.playVideo?.(),
              pause: () => playerRef.current?.pauseVideo?.(),
              seek: (seconds) => playerRef.current?.seekTo?.(seconds, true),
              getTime: () => playerRef.current?.getCurrentTime?.() ?? 0,
              getDuration: () => playerRef.current?.getDuration?.() ?? 0,
              // YouTube honours this, but only up to its own menu of rates, and
              // there is no ratechange equivalent to tell us when something else
              // moved it. So the rate CEILING is not enforceable on this path at
              // all: a console setPlaybackRate(2) here is undetectable. That is a
              // known gap of the fallback, not an oversight. It is also why the
              // proxied path is the one every real recap uses.
              setRate: (rate) => playerRef.current?.setPlaybackRate?.(rate),
              isPaused: () => {
                const YT = (window as any).YT;
                return playerRef.current?.getPlayerState?.() !== YT?.PlayerState?.PLAYING;
              },

              // getVideoLoadedFraction is one fraction of the WHOLE video with no
              // start offset, so after a seek the real buffered region is not
              // [0, f*d] and this overstates what is ready. It is a cosmetic hint
              // that feeds no decision; nothing may branch on it.
              getBuffered: () => {
                const f = playerRef.current?.getVideoLoadedFraction?.() ?? 0;
                const d = playerRef.current?.getDuration?.() ?? 0;
                return f > 0 && d > 0 ? [[0, f * d] as const] : [];
              },

              // YouTube's scale is 0..100. Convert at the boundary so the player
              // above only ever handles 0..1.
              setVolume: (value) => playerRef.current?.setVolume?.(Math.round(value * 100)),
              getVolume: () => (playerRef.current?.getVolume?.() ?? 100) / 100,
              setMuted: (muted) =>
                muted ? playerRef.current?.mute?.() : playerRef.current?.unMute?.(),
              isMuted: () => !!playerRef.current?.isMuted?.(),
              // The iframe is a <video> underneath, so iOS ignores programmatic
              // volume here exactly as it does on the proxied path.
              isVolumeSettable: () => !isIosLike(),

              supportsPictureInPicture: () => false,
              enterPictureInPicture: () => Promise.resolve(),
              exitPictureInPicture: () => Promise.resolve(),

              getTextTracks: () => [],
              setTextTrack: () => {},
              getActiveTextTrack: () => null,
            };
            transportRef.current = transport;
            if (rawPlayerRef) rawPlayerRef.current = playerRef.current;

            const d = playerRef.current?.getDuration?.() || 0;
            if (d > 0) eventsRef.current.onLoadedMetadata(d);
            poll = setInterval(tick, POLL_MS);
          },
          onStateChange: (e: any) => {
            const YT = (window as any).YT;
            eventsRef.current.onPlayingChange(e?.data === YT?.PlayerState?.PLAYING);
            // Same reasoning as the <video> path: a checkpoint whose end runs
            // past the file would never be reached, so the last quiz would
            // never open.
            if (e?.data === YT?.PlayerState?.ENDED) eventsRef.current.onEnded();
            // The one capability this surface gets as a real event rather than
            // as a poll.
            if (e?.data === YT?.PlayerState?.BUFFERING) eventsRef.current.onWaiting();
            else eventsRef.current.onPlayable();
          },
          onError: () => eventsRef.current.onError(),
        },
      });
    });

    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
      transportRef.current = null;
      if (rawPlayerRef) rawPlayerRef.current = null;
      try {
        playerRef.current?.destroy?.();
      } catch {
        /* the iframe may already be gone */
      }
      playerRef.current = null;
    };
  }, [youtubeId, transportRef, rawPlayerRef]);

  return (
    <>
      {/* The API replaces this node with the iframe. */}
      <Box ref={hostRef} sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      {/* Swallows clicks on the iframe so the video cannot be started, paused or
          seeked through YouTube's own surface, which reappears on hover even
          with controls off. Our control bar is the only way in. */}
      <Box
        onClick={onClick}
        onContextMenu={(e) => e.preventDefault()}
        sx={{ position: 'absolute', inset: 0, cursor: 'pointer', zIndex: 1 }}
      />
    </>
  );
}

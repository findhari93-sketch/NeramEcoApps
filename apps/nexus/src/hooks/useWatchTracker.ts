'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useNexusAuth } from '@/hooks/useNexusAuth';

// ── Types ──────────────────────────────────────────────────────────────────

interface UseWatchTrackerOptions {
  videoId: string;              // Library video UUID (not YouTube ID)
  videoDurationSeconds: number;
  playerRef: React.MutableRefObject<any>; // YouTube player instance
  enabled?: boolean;
}

interface UseWatchTrackerReturn {
  sessionId: string;
  watchedSeconds: number;
  completionPct: number;
  isTracking: boolean;
}

interface ReplaySegment {
  start: number;
  end: number;
  count: number;
}

interface HeartbeatPayload {
  session_id: string;
  video_id: string;
  watched_seconds: number;
  furthest_position: number;
  completion_pct: number;
  play_count: number;
  pause_count: number;
  seek_count: number;
  rewind_count: number;
  replay_segments: ReplaySegment[];
  device_type: 'mobile' | 'tablet' | 'desktop';
}

// ── Constants ──────────────────────────────────────────────────────────────

const HEARTBEAT_INTERVAL_MS = 30_000;
const POSITION_POLL_INTERVAL_MS = 1_000;
const JUMP_THRESHOLD_SECONDS = 5;
const API_ENDPOINT = '/api/library/watch-session';

// ── Helpers ────────────────────────────────────────────────────────────────

function getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
  if (typeof window === 'undefined') return 'desktop';
  const w = window.innerWidth;
  if (w < 600) return 'mobile';
  if (w < 900) return 'tablet';
  return 'desktop';
}

// YouTube PlayerState constants (in case window.YT isn't loaded yet)
const YT_PLAYING = 1;
const YT_PAUSED = 2;

// ── Hook ───────────────────────────────────────────────────────────────────

export function useWatchTracker({
  videoId,
  videoDurationSeconds,
  playerRef,
  enabled = true,
}: UseWatchTrackerOptions): UseWatchTrackerReturn {
  const { getToken, user } = useNexusAuth();

  // Reactive state exposed to consumers
  const [sessionId] = useState(() => crypto.randomUUID());
  const [watchedSeconds, setWatchedSeconds] = useState(0);
  const [completionPct, setCompletionPct] = useState(0);
  const [isTracking, setIsTracking] = useState(false);

  // Mutable refs for tracking data (no re-renders)
  const watchedSecondsSet = useRef(new Set<number>());
  const furthestPosition = useRef(0);
  const previousTime = useRef(0);
  const playCount = useRef(0);
  const pauseCount = useRef(0);
  const seekCount = useRef(0);
  const rewindCount = useRef(0);
  const replaySegments = useRef<ReplaySegment[]>([]);
  const isPlayingRef = useRef(false);

  // Interval refs
  const heartbeatInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const positionPollInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Ref for latest token getter (avoids stale closures)
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  // Ref for videoId to avoid stale closures
  const videoIdRef = useRef(videoId);
  videoIdRef.current = videoId;

  // Ref for videoDurationSeconds
  const durationRef = useRef(videoDurationSeconds);
  durationRef.current = videoDurationSeconds;

  // Ref for sessionId
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  // ── Build heartbeat payload ────────────────────────────────────────────

  const buildPayload = useCallback((): HeartbeatPayload => {
    const pct = durationRef.current > 0
      ? Math.min(100, (watchedSecondsSet.current.size / durationRef.current) * 100)
      : 0;

    return {
      session_id: sessionIdRef.current,
      video_id: videoIdRef.current,
      watched_seconds: watchedSecondsSet.current.size,
      furthest_position: furthestPosition.current,
      completion_pct: Math.round(pct * 100) / 100,
      play_count: playCount.current,
      pause_count: pauseCount.current,
      seek_count: seekCount.current,
      rewind_count: rewindCount.current,
      replay_segments: [...replaySegments.current],
      device_type: getDeviceType(),
    };
  }, []);

  // ── Send heartbeat via fetch ───────────────────────────────────────────

  const sendHeartbeat = useCallback(async () => {
    try {
      const token = await getTokenRef.current();
      if (!token) return;

      const payload = buildPayload();

      await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
    } catch {
      // Silently fail — heartbeats are best-effort
    }
  }, [buildPayload]);

  // ── Send final beacon (beforeunload / unmount) ─────────────────────────

  const sendBeacon = useCallback(() => {
    const payload = buildPayload();
    try {
      navigator.sendBeacon(
        API_ENDPOINT,
        new Blob([JSON.stringify(payload)], { type: 'application/json' }),
      );
    } catch {
      // Best-effort
    }
  }, [buildPayload]);

  // ── Update reactive state from refs ────────────────────────────────────

  const syncReactiveState = useCallback(() => {
    const size = watchedSecondsSet.current.size;
    setWatchedSeconds(size);

    const pct = durationRef.current > 0
      ? Math.min(100, (size / durationRef.current) * 100)
      : 0;
    setCompletionPct(Math.round(pct * 100) / 100);
  }, []);

  // ── Record a replay segment ────────────────────────────────────────────

  const recordReplaySegment = useCallback((start: number, end: number) => {
    const existing = replaySegments.current.find(
      (seg) => seg.start === start && seg.end === end,
    );
    if (existing) {
      existing.count += 1;
    } else {
      replaySegments.current.push({ start, end, count: 1 });
    }
  }, []);

  // ── Position polling (runs every second while playing) ─────────────────

  const startPositionPolling = useCallback(() => {
    if (positionPollInterval.current) clearInterval(positionPollInterval.current);

    positionPollInterval.current = setInterval(() => {
      const player = playerRef.current;
      if (!player?.getCurrentTime) return;

      const currentTime = player.getCurrentTime();
      const roundedTime = Math.round(currentTime);
      const prevTime = previousTime.current;

      // Detect rewind (jumped backward by more than threshold)
      if (prevTime - currentTime > JUMP_THRESHOLD_SECONDS) {
        rewindCount.current += 1;
        recordReplaySegment(Math.round(currentTime), Math.round(prevTime));
      }

      // Detect seek forward (jumped forward by more than threshold)
      if (currentTime - prevTime > JUMP_THRESHOLD_SECONDS) {
        seekCount.current += 1;
      }

      // Record the watched second marker
      if (roundedTime >= 0 && roundedTime <= durationRef.current) {
        watchedSecondsSet.current.add(roundedTime);
      }

      // Track furthest position reached
      if (currentTime > furthestPosition.current) {
        furthestPosition.current = currentTime;
      }

      previousTime.current = currentTime;
      syncReactiveState();
    }, POSITION_POLL_INTERVAL_MS);
  }, [playerRef, recordReplaySegment, syncReactiveState]);

  const stopPositionPolling = useCallback(() => {
    if (positionPollInterval.current) {
      clearInterval(positionPollInterval.current);
      positionPollInterval.current = null;
    }
  }, []);

  // ── YouTube state change handler ───────────────────────────────────────

  const handleStateChange = useCallback(
    (event: any) => {
      const state = event?.data ?? event;

      if (state === YT_PLAYING) {
        playCount.current += 1;
        isPlayingRef.current = true;
        setIsTracking(true);
        startPositionPolling();
      } else if (state === YT_PAUSED) {
        pauseCount.current += 1;
        isPlayingRef.current = false;
        stopPositionPolling();
      } else {
        // ENDED, BUFFERING, CUED, etc.
        isPlayingRef.current = false;
        stopPositionPolling();
      }
    },
    [startPositionPolling, stopPositionPolling],
  );

  // ── Attach to YouTube player via polling for readiness ─────────────────

  useEffect(() => {
    if (!enabled || !user) return;

    let readyCheckInterval: ReturnType<typeof setInterval> | null = null;
    let attached = false;

    // We poll until the player ref is available and has addEventListener
    readyCheckInterval = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;

      // If the player has addEventListener (IFrame API), attach our listener
      if (player.addEventListener && !attached) {
        attached = true;
        player.addEventListener('onStateChange', handleStateChange);

        // If the player is already playing when we attach, start tracking
        try {
          const currentState = player.getPlayerState?.();
          if (currentState === YT_PLAYING) {
            handleStateChange(YT_PLAYING);
          }
        } catch {
          // Player may not be ready yet
        }

        if (readyCheckInterval) {
          clearInterval(readyCheckInterval);
          readyCheckInterval = null;
        }
      }
    }, 500);

    return () => {
      if (readyCheckInterval) clearInterval(readyCheckInterval);
      if (attached && playerRef.current?.removeEventListener) {
        playerRef.current.removeEventListener('onStateChange', handleStateChange);
      }
    };
  }, [enabled, user, playerRef, handleStateChange]);

  // ── Heartbeat interval ─────────────────────────────────────────────────

  useEffect(() => {
    if (!enabled || !user) return;

    heartbeatInterval.current = setInterval(() => {
      if (watchedSecondsSet.current.size > 0) {
        sendHeartbeat();
      }
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      if (heartbeatInterval.current) {
        clearInterval(heartbeatInterval.current);
        heartbeatInterval.current = null;
      }
    };
  }, [enabled, user, sendHeartbeat]);

  // ── beforeunload handler ───────────────────────────────────────────────

  useEffect(() => {
    if (!enabled || !user) return;

    const handleBeforeUnload = () => {
      if (watchedSecondsSet.current.size > 0) {
        sendBeacon();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [enabled, user, sendBeacon]);

  // ── Cleanup on unmount: send final update ──────────────────────────────

  useEffect(() => {
    return () => {
      stopPositionPolling();
      if (heartbeatInterval.current) {
        clearInterval(heartbeatInterval.current);
        heartbeatInterval.current = null;
      }
      // Send final beacon on unmount if we tracked anything
      if (watchedSecondsSet.current.size > 0) {
        sendBeacon();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    sessionId,
    watchedSeconds,
    completionPct,
    isTracking,
  };
}

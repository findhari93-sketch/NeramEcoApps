'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { addPlayed, compactRanges, parseRanges, type PlayedRange } from '@/lib/played-ranges';
import { EMPTY_DIAGNOSTICS, MAX_REPORT_RANGES, type PlaybackDiagnostics } from '@/lib/watch-ledger';
import usePlayedRanges from './usePlayedRanges';
import type { PlaybackEvent } from './types';

/**
 * Everything a gated video page needs to know and save about what the student
 * has watched: the stretches played (for the quiz gate and the scrub bar) and a
 * heartbeat that saves them.
 *
 * Why it is shaped like this. The previous heartbeat sent deltas and forgot
 * each one on send, and what had been played lived only in the page. A failed
 * request, a sign-in token that would not refresh, or a reload lost real
 * watching, and the student was sent back to watch it again (Inaya, recap
 * 68f14d40: 86 minutes on a 14 minute section, 778 seconds credited).
 *
 * Here the page keeps cumulative totals for its viewing session and every
 * flush sends all of them (lib/watch-ledger.ts on the server credits only the
 * growth). Nothing is ever cleared, so a failed flush is simply covered by the
 * next, and a flush skipped while another is in flight loses nothing.
 *
 * Cadence and triggers are the old ones: every 30 seconds while something
 * changed, on any pause or end in the page, when the tab hides, on page hide,
 * and on unmount (keepalive, reusing the last token, because a page tearing
 * down may not live long enough to fetch a new one).
 *
 * Wire `playerProps` straight onto NeramVideoPlayer, and call `seedFromEmbed`
 * with the embed route's reply.
 */

export const FLUSH_INTERVAL_MS = 30_000;

/**
 * Played ranges by endpoint for this tab. The catch-up page unmounts the player
 * between steps; without this the gate would forget this session's watching
 * until the server answered.
 */
const tabCache = new Map<string, PlayedRange[]>();

export interface UseWatchSessionOptions {
  /** Where to POST. Null keeps the heartbeat idle, e.g. before the id is known. */
  endpoint: string | null;
  /** Fetched fresh before every periodic or explicit flush. */
  getToken: () => Promise<string | null>;
  /** False stops saving (ranges still grow for the gate). */
  enabled?: boolean;
}

export interface WatchSessionPlayerProps {
  onTimeUpdate: (seconds: number, duration: number) => void;
  onPlayedSpan: (from: number, to: number) => void;
  onPlaybackEvent: (event: PlaybackEvent) => void;
  onBlockedSeek: () => void;
}

export interface WatchSession {
  /** What has been played, server and this page together. */
  ranges: PlayedRange[];
  /** Seed from an embed reply: `played_ranges`, else the older `played_until`. */
  seedFromEmbed: (data: { played_ranges?: unknown; played_until?: unknown; resume_at?: unknown } | null) => void;
  playerProps: WatchSessionPlayerProps;
  /** Save now: after a passed checkpoint, before opening a quiz. */
  flushNow: () => void;
}

function newSessionId(): string {
  const bytes = new Uint8Array(12);
  try {
    crypto.getRandomValues(bytes);
  } catch {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function useWatchSession({ endpoint, getToken, enabled = true }: UseWatchSessionOptions): WatchSession {
  const played = usePlayedRanges(endpoint ? tabCache.get(endpoint) : undefined);
  const { seed, seedRanges, addSpan, rangesRef } = played;

  const endpointRef = useRef(endpoint);
  endpointRef.current = endpoint;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  // The session: cumulative, never cleared.
  const s = useRef({
    id: newSessionId(),
    startedAt: typeof performance !== 'undefined' ? performance.now() : Date.now(),
    position: 0,
    duration: 0,
    watched: 0,
    ranges: [] as PlayedRange[],
    blocked: 0,
    diag: { ...EMPTY_DIAGNOSTICS } as PlaybackDiagnostics,
    /** Bumped on every change; a flush is due while it is ahead of acked. */
    seq: 0,
    acked: 0,
    inFlight: false,
    lastToken: null as string | null,
  }).current;

  const remember = useCallback(() => {
    if (endpointRef.current) tabCache.set(endpointRef.current, rangesRef.current);
  }, [rangesRef]);

  const payload = useCallback(
    () => ({
      v: 2,
      session_id: s.id,
      elapsed_seconds: Math.round(((typeof performance !== 'undefined' ? performance.now() : Date.now()) - s.startedAt) / 1000),
      last_video_position_seconds: Math.round(s.position),
      duration_seconds: Math.round(s.duration),
      watched_seconds: round1(s.watched),
      played_ranges: compactRanges(s.ranges, MAX_REPORT_RANGES).map(([a, b]) => [round1(a), round1(b)]),
      blocked_total: s.blocked,
      diagnostics: s.diag,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : null,
    }),
    [s],
  );

  const flush = useCallback(
    (keepalive: boolean) => {
      const url = endpointRef.current;
      if (!enabledRef.current || !url) return;
      if (s.seq === s.acked) return;
      if (s.inFlight && !keepalive) return;

      const sent = s.seq;
      const body = JSON.stringify(payload());
      const send = (token: string) => {
        if (!keepalive) s.inFlight = true;
        void fetch(url, {
          method: 'POST',
          keepalive,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body,
        })
          .then((res) => {
            // Any 2xx: the totals reached the server. Even if it could not apply
            // them, the next flush carries the same totals and more.
            if (res.ok && sent > s.acked) s.acked = sent;
          })
          .catch(() => {
            // Offline or unloading. Nothing to undo: the totals are still here.
          })
          .finally(() => {
            if (!keepalive) s.inFlight = false;
          });
      };

      if (keepalive) {
        if (s.lastToken) send(s.lastToken);
        return;
      }
      s.inFlight = true; // held while the token resolves
      void getTokenRef
        .current()
        .then((token) => {
          s.inFlight = false;
          if (!token) return;
          s.lastToken = token;
          send(token);
        })
        .catch(() => {
          s.inFlight = false;
        });
    },
    [payload, s],
  );

  // A token for the keepalive path before the first periodic flush gets one.
  useEffect(() => {
    let cancelled = false;
    void getTokenRef
      .current()
      .then((t) => {
        if (!cancelled && t) s.lastToken = t;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [s]);

  useEffect(() => {
    const id = setInterval(() => flush(false), FLUSH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [flush]);

  // Media events do not bubble but do pass through the capture phase, so one
  // document listener sees every video in the page.
  useEffect(() => {
    const onStop = (event: Event) => {
      if (event.target instanceof HTMLMediaElement) flush(false);
    };
    document.addEventListener('pause', onStop, true);
    document.addEventListener('ended', onStop, true);
    return () => {
      document.removeEventListener('pause', onStop, true);
      document.removeEventListener('ended', onStop, true);
    };
  }, [flush]);

  // visibilitychange covers tab switch, minimise, phone lock and app switch;
  // pagehide covers navigating away. window.blur is not used: a quiz dialog
  // taking focus fires it too.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush(true);
    };
    const onPageHide = () => flush(true);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      flush(true);
    };
  }, [flush]);

  const onTimeUpdate = useCallback(
    (seconds: number, duration: number) => {
      if (Number.isFinite(duration) && duration > 0) s.duration = duration;
      if (Number.isFinite(seconds) && seconds > s.position) {
        s.position = seconds;
        s.seq++;
      }
    },
    [s],
  );

  const onPlayedSpan = useCallback(
    (from: number, to: number) => {
      if (!(to > from)) return;
      s.watched += to - from;
      s.ranges = addPlayed(s.ranges, from, to);
      s.seq++;
      addSpan(from, to);
      remember();
    },
    [s, addSpan, remember],
  );

  const onPlaybackEvent = useCallback(
    (event: PlaybackEvent) => {
      const d = s.diag;
      if (event.type === 'stall') {
        d.stalls += 1;
        d.stall_seconds += Math.max(0, event.seconds);
      } else if (event.type === 'reload') {
        d.reloads += 1;
      } else if (event.type === 'grant_refresh') {
        d.grant_refreshes += 1;
        if (!event.ok) d.grant_refresh_failures += 1;
      } else if (event.type === 'discarded') {
        d.discarded_seconds += Math.max(0, event.seconds);
      }
      s.seq++;
    },
    [s],
  );

  const onBlockedSeek = useCallback(() => {
    s.blocked += 1;
    s.seq++;
  }, [s]);

  const seedFromEmbed = useCallback<WatchSession['seedFromEmbed']>(
    (data) => {
      if (!data) return;
      if (Array.isArray(data.played_ranges)) {
        seedRanges(parseRanges(data.played_ranges));
      } else {
        seed(Number(data.played_until ?? data.resume_at) || 0);
      }
      remember();
    },
    [seed, seedRanges, remember],
  );

  const flushNow = useCallback(() => flush(false), [flush]);

  const playerProps = useMemo(
    () => ({ onTimeUpdate, onPlayedSpan, onPlaybackEvent, onBlockedSeek }),
    [onTimeUpdate, onPlayedSpan, onPlaybackEvent, onBlockedSeek],
  );

  return { ranges: played.ranges, seedFromEmbed, playerProps, flushNow };
}

export default useWatchSession;

/** Exposed for tests: forget this tab's cached ranges. */
export function __resetWatchSessionCache(): void {
  tabCache.clear();
}

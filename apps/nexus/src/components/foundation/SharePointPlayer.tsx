'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Box, Typography, CircularProgress } from '@neram/ui';
import type { NexusFoundationSectionWithQuiz } from '@neram/database/types';
import NeramVideoPlayer from '@/components/video/NeramVideoPlayer';
import type { VideoTransport } from '@/components/video/types';
import { computeGate } from '@/lib/video-gate';

/**
 * A Foundation chapter's SharePoint video.
 *
 * This used to be the last player in the app rendering a bare <video controls>,
 * and it was shielded from the lint rule that bans them by an ESLint exemption on
 * this whole directory. That meant the one screen with mandatory checkpoints
 * shipped the native scrubber, the native speed menu, the native download item
 * and no watermark, which is every protection the shared player exists to
 * provide, absent.
 *
 * It also carried a private copy of the gating rule, and that copy had the exact
 * bugs the shared one was written to kill: a one-shot `hasTriggeredQuizRef` latch
 * that retired a checkpoint if the quiz fetch failed, a `timeupdate` clamp that
 * could only pull a student back after they had seen where they landed, and its
 * own `duration - 10` tail rule against the shared `TAIL_EPSILON_SECONDS` of 0.5.
 *
 * All of that is now `computeGate` plus `NeramVideoPlayer`. What remains here is
 * what is genuinely this component's job: fetching the stream URL, telling the
 * player how to renew it, and translating between the gate's checkpoint ids and
 * the section indexes the surrounding Foundation UI speaks in.
 *
 * It used to take a Microsoft token captured once by its parent and send it in
 * the query string, and renewed an expired stream by rebuilding the player. So
 * every ten minutes the chapter restarted at 0:00, and once that captured token
 * expired, renewal failed outright: the NXS-0119 pattern the recap player had
 * already been fixed for. It asks for a token at the moment of each request now.
 */

interface SharePointPlayerProps {
  videoUrl: string;
  chapterId: string;
  /** Called for every request, so a renewal an hour in carries a live token. */
  getToken: () => Promise<string | null>;
  sections?: NexusFoundationSectionWithQuiz[];
  onSectionEnd?: (sectionIndex: number) => void;
  onTimeUpdate?: (seconds: number) => void;
  /**
   * Pure pass-through to the player. The quiz lives in FoundationLearningContent,
   * a sibling of this component, so the element has to travel up rather than be
   * held here.
   */
  onFullscreenChange?: (el: HTMLElement | null) => void;
}

/**
 * Converts a SharePoint/Stream video URL to an embeddable format.
 * Kept exported for teacher editor preview pages that still use iframe embedding.
 */
export function toEmbedUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.pathname.includes('embed.aspx')) return url;
    if (u.pathname.includes('stream.aspx')) {
      return url.replace('stream.aspx', 'embed.aspx');
    }
    if (u.pathname.match(/\/:v:\//)) {
      const pathParts = u.pathname.split('/');
      const vIdx = pathParts.indexOf(':v:');
      if (vIdx >= 0 && vIdx + 2 < pathParts.length) {
        const siteName = pathParts[vIdx + 2];
        return `${u.origin}/sites/${siteName}/_layouts/15/stream.aspx?share=${encodeURIComponent(url)}`;
      }
    }
    return url;
  } catch {
    return url;
  }
}

export default function SharePointPlayer({
  videoUrl,
  chapterId,
  getToken,
  sections,
  onSectionEnd,
  onTimeUpdate,
  onFullscreenChange,
}: SharePointPlayerProps) {
  const transportRef = useRef<VideoTransport | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [furthest, setFurthest] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Read at call time, so a parent passing a new function identity does not
  // re-fetch the stream and restart the video.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const onSectionEndRef = useRef(onSectionEnd);
  onSectionEndRef.current = onSectionEnd;
  const onTimeUpdateRef = useRef(onTimeUpdate);
  onTimeUpdateRef.current = onTimeUpdate;

  const usableSections = useMemo(() => sections ?? [], [sections]);

  /**
   * The same arithmetic every other video in the app uses, including the clamp
   * that pulls a checkpoint ending past a trimmed recording back inside the file
   * so its quiz still opens.
   */
  const gate = useMemo(
    () =>
      computeGate({
        checkpoints: usableSections.map((s) => ({
          id: s.id,
          endSeconds: s.end_timestamp_seconds,
          passed: !!s.quiz_attempt?.passed,
        })),
        duration,
        furthestSeconds: furthest,
        mode: 'gated',
      }),
    [usableSections, duration, furthest],
  );
  const gateRef = useRef(gate);
  gateRef.current = gate;

  const marks = useMemo(
    () =>
      usableSections
        .filter((s) => Number.isFinite(s.end_timestamp_seconds) && s.end_timestamp_seconds > 0)
        .map((s, i) => ({
          id: s.id,
          at: s.end_timestamp_seconds,
          label: `Checkpoint ${i + 1}`,
          passed: !!s.quiz_attempt?.passed,
        })),
    [usableSections],
  );

  /** One request for a stream URL. Throws a message fit to show the student. */
  const requestStreamUrl = useCallback(async (): Promise<string> => {
    const token = await getTokenRef.current();
    if (!token) throw new Error('Your session expired. Please sign in again.');
    let res: Response;
    try {
      res = await fetch(`/api/foundation/chapters/${chapterId}/video-embed`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      throw new Error('Network error, could not load video');
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error('Your session expired. Please sign in again.');
    if (!res.ok || !data.streamUrl) throw new Error(data.error || 'Failed to load video');
    return data.streamUrl as string;
  }, [chapterId]);

  const fetchStreamUrl = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStreamUrl(await requestStreamUrl());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load video');
    } finally {
      setLoading(false);
    }
  }, [requestStreamUrl]);

  useEffect(() => {
    fetchStreamUrl();
  }, [fetchStreamUrl]);

  /**
   * The handle the surrounding Foundation UI drives playback through.
   *
   * Two of its old methods are now deliberate no-ops. `resetSectionTrigger`
   * existed to clear the one-shot latch, and there is no latch any more: the
   * player re-pauses on the next tick if playback somehow resumes at a boundary.
   * `setRewatchMode` toggled a looser clamp, and the gate is computed rather than
   * moded. Both were also reachable from a console, which made them a way around
   * the checkpoint; the recap player dropped its equivalents for that reason.
   *
   * They are kept as no-ops rather than removed so an old caller cannot throw.
   */
  useEffect(() => {
    (window as any).__foundationPlayer = {
      type: 'sharepoint',
      seekTo: (seconds: number) => {
        // Clamped, so the handle cannot be used to cross a checkpoint either.
        const ceiling = gateRef.current.seekCeiling;
        const target = Number.isFinite(ceiling) ? Math.min(seconds, ceiling) : seconds;
        transportRef.current?.seek(Math.max(0, target));
      },
      play: () => transportRef.current?.play(),
      pause: () => transportRef.current?.pause(),
      getCurrentTime: () => transportRef.current?.getTime() ?? 0,
      resetSectionTrigger: () => {},
      setRewatchMode: () => {},
    };
    return () => {
      delete (window as any).__foundationPlayer;
    };
  }, []);

  const handleTick = useCallback((seconds: number) => {
    setFurthest((f) => (seconds > f ? seconds : f));
    onTimeUpdateRef.current?.(seconds);
  }, []);

  /**
   * Translate the gate's checkpoint id back into the section index the
   * Foundation UI speaks in.
   *
   * By id rather than by array position, because computeGate picks the
   * EARLIEST-ending unpassed checkpoint and these sections are ordered by
   * sort_order. When a teacher reorders them the two disagree, and the old code
   * took the array position, which opened the wrong quiz.
   */
  const handleBoundary = useCallback(() => {
    const activeId = gateRef.current.activeCheckpointId;
    const index = activeId ? usableSections.findIndex((s) => s.id === activeId) : -1;
    if (index >= 0) onSectionEndRef.current?.(index);
  }, [usableSections]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', bgcolor: '#000' }}>
        <CircularProgress size={32} sx={{ color: 'white' }} />
      </Box>
    );
  }

  if (error || !streamUrl) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', bgcolor: '#000', color: 'white', gap: 1, p: 2, textAlign: 'center' }}>
        <Typography variant="body2">{error || 'Could not load video'}</Typography>
        <Typography
          variant="caption"
          component="a"
          href={videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          sx={{ color: 'primary.light', textDecoration: 'underline' }}
        >
          Watch in SharePoint
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%', bgcolor: '#000' }}>
      <NeramVideoPlayer
        source={{ kind: 'html5', src: streamUrl, renew: requestStreamUrl }}
        gate={gate}
        transportRef={transportRef}
        marks={marks}
        onTimeUpdate={handleTick}
        onCheckpointReached={handleBoundary}
        onLoadedMetadata={setDuration}
        allowFullscreen
        onFullscreenChange={onFullscreenChange}
      />
    </Box>
  );
}

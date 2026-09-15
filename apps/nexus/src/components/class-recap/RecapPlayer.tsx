'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Box, Typography, CircularProgress, Button } from '@neram/ui';
import NeramVideoPlayer from '@/components/video/NeramVideoPlayer';
import { computeGate, type VideoGateMode } from '@/lib/video-gate';
import type { VideoTransport } from '@/components/video/types';
import { renewFromEmbed } from '@/components/video/renew-from-embed';
import { useAuthFetch } from '@/components/curriculum/shared';

/**
 * Gated player for a class recording, inline on the recap page.
 *
 * This component's job is the plumbing: mint a streaming grant, tell the player
 * how to renew it, and fall back to the YouTube backup when the Teams copy has
 * aged out. Renewing mid-class used to be done here, and it rewound students to
 * 0:00 whenever the stream it had just swapped in failed as well (NXS-0123); the
 * player does it now, for every screen at once. The gating belongs to NeramVideoPlayer,
 * the same component Focus Mode and the Foundation chapters use, and the rules
 * it enforces come from lib/video-gate.ts.
 *
 * There used to be a second, separate player for the YouTube case, carrying its
 * own transcription of those rules. It fell behind, and because a YouTube-backed
 * recap cannot use Focus Mode at all, its students only ever saw the loose one.
 * Both paths are now the same component with a different transport.
 *
 * It used to render a bare <video controls> instead, and that was the leak. The
 * native scrubber let a student drag past a checkpoint; the only clamp lived in
 * `timeupdate` and was armed solely during a post-failure rewatch. The
 * `video.pause()` at the checkpoint fired, then the browser resumed playback the
 * instant the seek completed (a seek on a playing video keeps playing) and the
 * quiz fetch is async, so the drawer opened over a video that was still running.
 * Worse, the playhead was never pulled back: pass that quiz and every later
 * checkpoint fired in turn, so the whole recap could be cleared having watched
 * about thirty seconds.
 *
 * Sharing one gating model is the fix. A bounded scrub track cannot express the
 * skip in the first place, so there is nothing to undo afterwards.
 */

export interface RecapPlayerSection {
  id: string;
  end_timestamp_seconds: number;
  passed: boolean;
}

interface RecapPlayerProps {
  recapId: string;
  sections: RecapPlayerSection[];
  /** Fires with the index of the checkpoint whose quiz should open. */
  onSectionEnd: (sectionIndex: number) => void;
  /** Fires on every playback tick. `duration` is 0 until metadata has loaded. */
  onTimeUpdate?: (seconds: number, duration: number) => void;
  /** Shown over the picture in fullscreen, where the page around it is gone. */
  title?: string;
  /**
   * A pure pass-through to NeramVideoPlayer, deliberately not state held here.
   *
   * The quiz lives in RecapWatch, two levels above this component, so this file
   * has nothing useful to do with the element. Holding it here would mean
   * threading it back up again, and a second copy that can go stale.
   */
  onFullscreenChange?: (el: HTMLElement | null) => void;
  /**
   * Whether the checkpoints bind, decided by the server from the student's
   * absence row. Defaults to the strict answer so a caller that forgets to pass
   * it gates rather than opens.
   */
  mode?: VideoGateMode;
}

interface Watermark {
  name: string;
  code: string;
}

export default function RecapPlayer({
  recapId,
  sections,
  onSectionEnd,
  onTimeUpdate,
  title,
  onFullscreenChange,
  mode = 'gated',
}: RecapPlayerProps) {
  const authFetch = useAuthFetch();
  // Whichever surface is live. The checkpoint list drives playback through this,
  // so it has to work on the YouTube path too.
  const transportRef = useRef<VideoTransport | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [youtubeId, setYoutubeId] = useState<string | null>(null);
  const [watermark, setWatermark] = useState<Watermark | null>(null);
  const [resumeAt, setResumeAt] = useState(0);
  const [duration, setDuration] = useState(0);
  const [furthest, setFurthest] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const onSectionEndRef = useRef(onSectionEnd);
  onSectionEndRef.current = onSectionEnd;
  // Held in a ref, not read from the closure, so an inline arrow from the page
  // does not re-register the listener on every render.
  const onTimeUpdateRef = useRef(onTimeUpdate);
  onTimeUpdateRef.current = onTimeUpdate;

  /** The checkpoint the student owes. -1 once every one is passed. */
  const nextIdx = useMemo(() => sections.findIndex((s) => !s.passed), [sections]);
  const nextIdxRef = useRef(nextIdx);
  nextIdxRef.current = nextIdx;
  // Read inside handleBoundary, which is registered once and must not re-create
  // itself when the mode arrives from the fetch.
  const modeRef = useRef(mode);
  modeRef.current = mode;

  /**
   * How far playback may reach, and how fast. Worked out in one place for every
   * video in the app, including the clamp that pulls a checkpoint ending past a
   * trimmed recording back inside the file so its quiz still opens.
   */
  const gate = useMemo(
    () =>
      computeGate({
        checkpoints: sections.map((s) => ({
          id: s.id,
          endSeconds: s.end_timestamp_seconds,
          passed: s.passed,
        })),
        duration,
        furthestSeconds: furthest,
        mode,
      }),
    [sections, duration, furthest, mode],
  );
  /**
   * Checkpoint positions for the scrub bar.
   *
   * Position only, no question counts: a label on a checkpoint the student has
   * not reached describes content that is deliberately locked. SeekBar drops the
   * label for any mark past the boundary; not sending one at all would also lose
   * it for the checkpoints they have already earned.
   */
  const marks = useMemo(
    () =>
      sections
        .filter((s) => Number.isFinite(s.end_timestamp_seconds) && s.end_timestamp_seconds > 0)
        .map((s, i) => ({
          id: s.id,
          at: s.end_timestamp_seconds,
          label: `Checkpoint ${i + 1}`,
          // In revision nothing is owed, so every mark is just a chapter
          // position. Passing the raw flag would paint the bar of someone
          // rewatching a class they sat in as a row of unmet gates.
          passed: mode === 'gated' ? s.passed : true,
        })),
    [sections, mode],
  );

  /**
   * Subtitles, riding the grant the video already holds.
   *
   * Derived from the stream URL rather than fetched separately, because the two
   * are authorised by the same signed token and minting a second one would just
   * be a second chance to get out of step. A function of the URL, so when the
   * player renews the grant mid-class the <track> follows it to the fresh token.
   *
   * A recording with no stored transcript answers 404 and the browser reports no
   * usable track, so the captions entry simply never appears in the menu. That is
   * the desired behaviour: there is nothing to offer.
   */
  const captions = useMemo(
    () => ({
      src: (src: string) => {
        const vt = src.split('vt=')[1];
        return vt ? `/api/media/captions?vt=${vt}` : null;
      },
      label: 'English',
      lang: 'en',
    }),
    [],
  );

  /** Stable, so the player's renewal is not re-created on every render. */
  const renew = useMemo(
    () => renewFromEmbed(authFetch, `/api/student/class-recaps/${recapId}/video-embed`),
    [authFetch, recapId],
  );

  // Read inside the __recapPlayer handle, which is registered once per source.
  const gateRef = useRef(gate);
  gateRef.current = gate;

  const fetchStreamUrl = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // authFetch fetches a fresh Microsoft token on every call and turns a
      // 401 into a friendly "session expired" message plus a rate-limited
      // re-auth, instead of a raw upstream error rendered straight into the
      // player. Renewal goes through the same door (see `renew`).
      const data = await authFetch(`/api/student/class-recaps/${recapId}/video-embed`);
      setWatermark(data.watermark || { name: 'Neram student', code: 'NX-000000' });
      if (data.video_source === 'youtube' || data.mode === 'youtube') {
        setYoutubeId(data.youtube_id);
        setStreamUrl(null);
      } else {
        setStreamUrl(data.streamUrl || data.src);
        setYoutubeId(null);
      }
      // Only seed the resume point on the first load. "Try again" after a
      // failed first load comes back through here, and the server's value is
      // the same one it gave before.
      setResumeAt((prev) => (prev > 0 ? prev : Number(data.resume_at) || 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load recording');
    } finally {
      setLoading(false);
    }
  }, [recapId, authFetch]);

  useEffect(() => {
    fetchStreamUrl();
  }, [fetchStreamUrl]);

  /**
   * The control handle the page's checkpoint list drives (its "Watch" buttons
   * seek to a section start).
   *
   * `setRewatchMode` and `resetSectionTrigger` used to hang off this too, which
   * meant `window.__recapPlayer.setRewatchMode(false, 0)` from a console turned
   * the anti-skip clamp off. Neither exists now: the boundary is standing rather
   * than armed, so there is no mode to switch and no trigger to reset. A seek
   * past the boundary is snapped back by NeramVideoPlayer whoever asked for it.
   */
  useEffect(() => {
    if (!streamUrl && !youtubeId) return;
    (window as any).__recapPlayer = {
      // Clamped here as well as in the player. The player would snap a stray
      // seek back anyway, but a checkpoint "Watch" button that visibly
      // overshoots and then jerks back reads as a bug rather than as a gate.
      seekTo: (seconds: number) => {
        const ceiling = gateRef.current.seekCeiling;
        transportRef.current?.seek(Number.isFinite(ceiling) ? Math.min(seconds, ceiling) : seconds);
      },
      play: () => transportRef.current?.play(),
      pause: () => transportRef.current?.pause(),
      getCurrentTime: () => transportRef.current?.getTime() ?? 0,
    };
    return () => {
      delete (window as any).__recapPlayer;
    };
  }, [streamUrl, youtubeId]);

  const handleTick = useCallback((seconds: number, dur: number) => {
    setFurthest((f) => (seconds > f ? seconds : f));
    onTimeUpdateRef.current?.(seconds, dur);
  }, []);

  /**
   * The video stopped at the end of the checkpoint the student owes.
   *
   * NeramVideoPlayer re-fires this on the next tick if playback somehow resumes,
   * so there is no "already triggered" latch to get stuck on. The old one meant
   * a failed quiz fetch, or a play press during the fetch, retired that
   * checkpoint for the rest of the session.
   *
   * The mode check is load-bearing, not defensive. An unbound gate sets
   * `unlockedUntil` to the full duration, so NeramVideoPlayer treats the end of
   * the recording as a boundary and fires this, then fires it again on `ended`.
   * A student rewatching a class they sat in has passed nothing, so `nextIdx` is
   * 0, and without this they would be handed checkpoint 1's quiz the moment the
   * video finished. A fully passed recap is already safe because its `nextIdx`
   * is -1, which is why this only bites the new revision path.
   */
  const handleBoundary = useCallback(() => {
    if (modeRef.current !== 'gated') return;
    const idx = nextIdxRef.current;
    if (idx >= 0) onSectionEndRef.current(idx);
  }, []);

  if (loading && !streamUrl && !youtubeId) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', bgcolor: '#000' }}>
        <CircularProgress size={32} sx={{ color: 'white' }} />
      </Box>
    );
  }

  if (youtubeId) {
    // Nothing to renew on this path: a YouTube id does not expire.
    return (
      <NeramVideoPlayer
        source={{ kind: 'youtube', youtubeId }}
        gate={gate}
        transportRef={transportRef}
        watermark={watermark}
        title={title}
        marks={marks}
        resumeAt={resumeAt}
        onTimeUpdate={handleTick}
        onCheckpointReached={handleBoundary}
        onLoadedMetadata={setDuration}
        allowFullscreen
        onFullscreenChange={onFullscreenChange}
      />
    );
  }

  if (error || !streamUrl || !watermark) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', bgcolor: '#000', color: 'white', gap: 1.5, p: 2, textAlign: 'center' }}>
        <Typography variant="body2">{error || 'Could not load the recording'}</Typography>
        <Button
          size="small"
          variant="outlined"
          onClick={() => fetchStreamUrl()}
          sx={{ minHeight: 40, textTransform: 'none', color: '#fff', borderColor: 'rgba(255,255,255,0.5)' }}
        >
          Try again
        </Button>
      </Box>
    );
  }

  return (
    <NeramVideoPlayer
      source={{ kind: 'html5', src: streamUrl, renew }}
      gate={gate}
      transportRef={transportRef}
      watermark={watermark}
      title={title}
      marks={marks}
      captions={captions}
      resumeAt={resumeAt}
      onTimeUpdate={handleTick}
      onCheckpointReached={handleBoundary}
      onLoadedMetadata={setDuration}
      allowFullscreen
      onFullscreenChange={onFullscreenChange}
    />
  );
}

'use client';

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { Box, Snackbar, Button } from '@neram/ui';
import type { NexusFoundationSectionWithQuiz } from '@neram/database/types';
import NeramVideoPlayer from '@/components/video/NeramVideoPlayer';
import type { VideoTransport } from '@/components/video/types';
import { computeGate } from '@/lib/video-gate';

/**
 * A Foundation chapter's YouTube-backed video.
 *
 * This was a second, complete YouTube IFrame API integration: its own script
 * loader (one of four in the app), its own control bar, its own poll loop, and
 * its own copy of the checkpoint rule. That copy had drifted, in the way the
 * comment at the top of lib/video-gate.ts describes: a one-shot latch per
 * section, a rewatch mode reachable from the console, and a clamp that ran after
 * the seek rather than preventing it.
 *
 * It is now the shared player with a YouTube source. What is left here is the
 * one thing that was genuinely local: the resume prompt, which asks before
 * jumping a returning student forward rather than doing it silently.
 */

interface VideoPlayerProps {
  videoId: string;
  sections: NexusFoundationSectionWithQuiz[];
  currentSectionIndex: number;
  resumePosition?: number;
  onSectionEnd: (sectionIndex: number) => void;
  onTimeUpdate?: (seconds: number) => void;
  /** Pass-through so the checkpoint quiz renders inside fullscreen. */
  onFullscreenChange?: (el: HTMLElement | null) => void;
}

/** Below this a resume prompt is more interruption than help. */
const RESUME_THRESHOLD_SECONDS = 30;

export default function VideoPlayer({
  videoId,
  sections,
  resumePosition,
  onSectionEnd,
  onTimeUpdate,
  onFullscreenChange,
}: VideoPlayerProps) {
  const transportRef = useRef<VideoTransport | null>(null);
  const [duration, setDuration] = useState(0);
  const [furthest, setFurthest] = useState(0);
  const [showResume, setShowResume] = useState(false);

  const onSectionEndRef = useRef(onSectionEnd);
  onSectionEndRef.current = onSectionEnd;
  const onTimeUpdateRef = useRef(onTimeUpdate);
  onTimeUpdateRef.current = onTimeUpdate;

  const gate = useMemo(
    () =>
      computeGate({
        checkpoints: sections.map((s) => ({
          id: s.id,
          endSeconds: s.end_timestamp_seconds,
          passed: !!s.quiz_attempt?.passed,
        })),
        duration,
        furthestSeconds: furthest,
        mode: 'gated',
      }),
    [sections, duration, furthest],
  );
  const gateRef = useRef(gate);
  gateRef.current = gate;

  const marks = useMemo(
    () =>
      sections
        .filter((s) => Number.isFinite(s.end_timestamp_seconds) && s.end_timestamp_seconds > 0)
        .map((s, i) => ({
          id: s.id,
          at: s.end_timestamp_seconds,
          label: `Checkpoint ${i + 1}`,
          passed: !!s.quiz_attempt?.passed,
        })),
    [sections],
  );

  /**
   * The handle the surrounding Foundation UI drives playback through.
   *
   * `resetSectionTrigger` and `setRewatchMode` are no-ops now. There is no latch
   * to reset (the player re-pauses on the next tick instead), and no rewatch mode
   * (the gate is computed, not moded). Both were also callable from a console,
   * which made them a way past a checkpoint. Kept as no-ops so an old caller
   * cannot throw.
   */
  useEffect(() => {
    (window as any).__foundationPlayer = {
      type: 'youtube',
      seekTo: (seconds: number) => {
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
   * By checkpoint id, not by array position. computeGate picks the
   * EARLIEST-ending unpassed checkpoint while these sections are ordered by
   * sort_order, so once a teacher reorders them the two disagree and a
   * position-based lookup opens the wrong quiz.
   */
  const handleBoundary = useCallback(() => {
    const activeId = gateRef.current.activeCheckpointId;
    const index = activeId ? sections.findIndex((s) => s.id === activeId) : -1;
    if (index >= 0) onSectionEndRef.current(index);
  }, [sections]);

  const handleLoadedMetadata = useCallback(
    (d: number) => {
      setDuration(d);
      // Offered rather than applied. Being moved without asking is disorienting,
      // and a student who left mid-sentence often wants the run-up again.
      if ((resumePosition ?? 0) > RESUME_THRESHOLD_SECONDS && (resumePosition ?? 0) < d - 10) {
        setShowResume(true);
      }
    },
    [resumePosition],
  );

  const acceptResume = useCallback(() => {
    const ceiling = gateRef.current.seekCeiling;
    const target = Number.isFinite(ceiling)
      ? Math.min(resumePosition ?? 0, ceiling)
      : (resumePosition ?? 0);
    transportRef.current?.seek(Math.max(0, target));
    transportRef.current?.play();
    setShowResume(false);
  }, [resumePosition]);

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%', bgcolor: '#000' }}>
      <NeramVideoPlayer
        source={{ kind: 'youtube', youtubeId: videoId }}
        gate={gate}
        transportRef={transportRef}
        marks={marks}
        onTimeUpdate={handleTick}
        onCheckpointReached={handleBoundary}
        onLoadedMetadata={handleLoadedMetadata}
        allowFullscreen
        onFullscreenChange={onFullscreenChange}
      />

      <Snackbar
        open={showResume}
        onClose={() => setShowResume(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        message="Pick up where you left off?"
        action={
          <>
            <Button size="small" onClick={acceptResume} sx={{ minHeight: 40 }}>
              Resume
            </Button>
            <Button size="small" color="inherit" onClick={() => setShowResume(false)} sx={{ minHeight: 40 }}>
              Start over
            </Button>
          </>
        }
      />
    </Box>
  );
}

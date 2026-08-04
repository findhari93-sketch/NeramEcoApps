'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Typography, IconButton, Slider } from '@neram/ui';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import PauseRoundedIcon from '@mui/icons-material/PauseRounded';
import Replay10RoundedIcon from '@mui/icons-material/Replay10Rounded';
import SpeedRoundedIcon from '@mui/icons-material/SpeedRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import FullscreenRoundedIcon from '@mui/icons-material/FullscreenRounded';
import FullscreenExitRoundedIcon from '@mui/icons-material/FullscreenExitRounded';
import Watermark from './Watermark';
import Html5Surface from './transports/Html5Surface';
import YouTubeSurface from './transports/YouTubeSurface';
import type { VideoGate } from '@/lib/video-gate';
import type { VideoSource, VideoSurfaceEvents, VideoTransport } from './types';

/**
 * The one video player in Nexus.
 *
 * Every video a student sees goes through here: gated class recaps, gated
 * Foundation chapters, and ungated library clips. The chrome, the watermark, the
 * anti-skip behaviour and the progress reporting are written once, so a fix to
 * any of them reaches every screen. Before this there were nine files rendering
 * video, the gating rules were written out four times, and the YouTube copy of
 * them was a release behind the <video> copy.
 *
 * What it does NOT do is decide the rules. `gate` comes in already computed by
 * lib/video-gate.ts, which is pure and tested on its own. This component only
 * enforces what it is handed:
 *
 *   1. The scrub track stops at `gate.unlockedUntil`, so the skip cannot be
 *      expressed and there is nothing to undo afterwards.
 *   2. Any seek arriving another way (keyboard, trackpad, console) is snapped
 *      back on `seeked`, before the frame it jumped to is painted.
 *   3. Playback pauses at the boundary and asks the caller to open the quiz.
 *      There is deliberately no "already fired" latch: a failed quiz fetch must
 *      not retire the checkpoint.
 *   4. The rate ceiling is enforced on the element, not just in the UI, because
 *      the rate can be changed from a console without touching our buttons.
 *
 * None of this is a security boundary, and it does not pretend to be. Anyone
 * with devtools can call play() at any rate they like. The real guarantees are
 * server-side: the quiz route decides whether a checkpoint is passed, and the
 * byte proxy decides who gets the file at all.
 */

/** Ordinary playback overshoots the boundary slightly; do not fight it. */
const SEEK_TOLERANCE_SECONDS = 2;
/** Filtered by `gate.maxRate`, so an owed checkpoint leaves only 1x. */
const SPEED_OPTIONS = [1, 1.25, 1.5, 2];

export interface NeramVideoPlayerProps {
  source: VideoSource;
  gate: VideoGate;
  /** Identity burned over the picture. Omit for staff preview. */
  watermark?: { name: string; code: string } | null;
  /** Where to pick up. Always re-clamped to the gate, never trusted as stored. */
  resumeAt?: number;
  onTimeUpdate?: (seconds: number, duration: number) => void;
  /** Playback reached the end of the checkpoint the student owes. */
  onCheckpointReached?: () => void;
  onLoadedMetadata?: (duration: number) => void;
  /** A skip was refused. Counted server-side as a watch-honesty signal. */
  onBlockedSeek?: () => void;
  onError?: () => void;
  /**
   * Offer a fullscreen button. Off by default, and deliberately so for gated
   * surfaces: MUI portals the checkpoint quiz to document.body, which would not
   * render inside a fullscreen subtree, so the student would hit a boundary and
   * see nothing happen. Ungated dialogs have no quiz and want it.
   */
  allowFullscreen?: boolean;
  /** For callers that already hold a video element ref. HTML5 sources only. */
  videoRef?: React.MutableRefObject<HTMLVideoElement | null>;
  /**
   * Filled in with the live transport so a parent can drive playback, whichever
   * source is in use. This is how the checkpoint list's "Watch" buttons work on
   * both paths; previously each player registered its own global handle and the
   * YouTube one had a different set of methods.
   */
  transportRef?: React.MutableRefObject<VideoTransport | null>;
  /**
   * The raw YT.Player, for the one caller that needs more than the transport
   * exposes: the Library's watch tracker attaches to a player instance. YouTube
   * sources only.
   */
  youtubePlayerRef?: React.MutableRefObject<any>;
}

function fmt(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function NeramVideoPlayer({
  source,
  gate,
  watermark,
  resumeAt = 0,
  onTimeUpdate,
  onCheckpointReached,
  onLoadedMetadata,
  onBlockedSeek,
  onError,
  allowFullscreen = false,
  videoRef,
  transportRef: externalTransportRef,
  youtubePlayerRef,
}: NeramVideoPlayerProps) {
  const internalTransportRef = useRef<VideoTransport | null>(null);
  const transportRef = externalTransportRef ?? internalTransportRef;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [nudge, setNudge] = useState<string | null>(null);

  // Read inside listeners that are registered once, so they always see the
  // latest gate without re-registering on every render.
  const gateRef = useRef(gate);
  gateRef.current = gate;
  const cbRef = useRef({ onTimeUpdate, onCheckpointReached, onLoadedMetadata, onBlockedSeek, onError });
  cbRef.current = { onTimeUpdate, onCheckpointReached, onLoadedMetadata, onBlockedSeek, onError };
  const resumeRef = useRef(resumeAt);
  resumeRef.current = resumeAt;

  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((msg: string) => {
    setNudge(msg);
    setTimeout(() => setNudge(null), 2200);
  }, []);
  const flashRef = useRef(flash);
  flashRef.current = flash;

  /**
   * Snap a seek back to the ceiling. Shared by the `seeked` listener (the <video>
   * path, which catches it before the frame paints) and the tick handler (the
   * YouTube path, which has no seeked event and can only poll).
   */
  const clampIfBeyond = useCallback((time: number): boolean => {
    const ceiling = gateRef.current.seekCeiling;
    if (!Number.isFinite(ceiling)) return false;
    if (time <= ceiling + SEEK_TOLERANCE_SECONDS) return false;
    transportRef.current?.seek(Math.max(0, ceiling));
    flashRef.current('Finish this section before skipping ahead.');
    cbRef.current.onBlockedSeek?.();
    return true;
  }, [transportRef]);

  const events: VideoSurfaceEvents = useMemo(
    () => ({
      onTick: (seconds, dur) => {
        setCurrent(seconds);
        if (dur > 0) setDuration(dur);
        cbRef.current.onTimeUpdate?.(seconds, dur);

        if (clampIfBeyond(seconds)) {
          transportRef.current?.pause();
          return;
        }
        // The boundary. No "already fired" latch: if playback resumes for any
        // reason it pauses again on the next tick, which is what stops a
        // checkpoint being retired by a failed quiz fetch.
        const unlocked = gateRef.current.unlockedUntil;
        if (unlocked > 0 && seconds >= unlocked) {
          transportRef.current?.pause();
          cbRef.current.onCheckpointReached?.();
        }
      },
      onSeeked: (seconds) => {
        clampIfBeyond(seconds);
      },
      onPlayingChange: setPlaying,
      onLoadedMetadata: (dur) => {
        setDuration(dur);
        cbRef.current.onLoadedMetadata?.(dur);
        // Clamped to the boundary, not trusted as stored. The old inline player
        // banked whatever position the student dragged the native scrubber to,
        // so restoring it verbatim would hand the skip straight back.
        const unlocked = gateRef.current.unlockedUntil;
        const ceiling = unlocked > 0 ? Math.min(unlocked, dur) : dur;
        const target = Math.min(resumeRef.current, ceiling);
        if (target > 0 && target < dur - 1) transportRef.current?.seek(target);
      },
      // A checkpoint whose end runs past the file is never reached by the tick
      // handler, so without this the last quiz would simply never open.
      onEnded: () => cbRef.current.onCheckpointReached?.(),
      onRateChange: (rate) => {
        const max = gateRef.current.maxRate;
        if (rate > max) {
          transportRef.current?.setRate(max);
          setSpeed(max);
          flashRef.current('Full speed unlocks once you pass this checkpoint.');
        } else {
          setSpeed(rate);
        }
      },
      onError: () => cbRef.current.onError?.(),
    }),
    [clampIfBeyond],
  );

  // Pull the rate down the moment the ceiling drops, without waiting for the
  // student to touch anything.
  useEffect(() => {
    if (speed > gate.maxRate) {
      transportRef.current?.setRate(gate.maxRate);
      setSpeed(gate.maxRate);
    }
  }, [gate.maxRate, speed]);

  // visibilitychange, deliberately not window blur. Blur also fires when the
  // quiz sheet takes focus, when devtools opens, and on every alt-tab preview,
  // and pausing on all of those is hostile. Visibility catches the real set:
  // tab switch, minimise, phone lock, app switch.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') transportRef.current?.pause();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  useEffect(() => {
    if (!allowFullscreen) return;
    const onChange = () => setIsFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [allowFullscreen]);

  const toggleFullscreen = useCallback(() => {
    const node = containerRef.current;
    if (!node) return;
    if (document.fullscreenElement === node) void document.exitFullscreen?.();
    // Safari on iPhone refuses this on a div; the catch keeps the button inert
    // rather than throwing into the console on every press.
    else void node.requestFullscreen?.().catch(() => {});
  }, []);

  const togglePlay = useCallback(() => {
    const transport = transportRef.current;
    if (!transport) return;
    if (transport.isPaused()) transport.play();
    else transport.pause();
  }, []);

  const back10 = useCallback(() => {
    const transport = transportRef.current;
    if (!transport) return;
    transport.seek(Math.max(0, transport.getTime() - 10));
  }, []);

  const cycleSpeed = useCallback(() => {
    const allowed = SPEED_OPTIONS.filter((s) => s <= gate.maxRate);
    const next = allowed[(allowed.indexOf(speed) + 1) % allowed.length] ?? 1;
    transportRef.current?.setRate(next);
    setSpeed(next);
  }, [gate.maxRate, speed]);

  /** Controls fade while playing but never while paused or mid-quiz. */
  const bumpControls = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 3200);
  }, []);

  useEffect(() => {
    if (!playing) setShowControls(true);
    else bumpControls();
  }, [playing, bumpControls]);

  const scrubMax = Math.max(1, Math.min(gate.unlockedUntil || duration || 1, duration || 1));
  const lockedAhead = duration > 0 && scrubMax < duration - 1;

  return (
    <Box
      ref={containerRef}
      onMouseMove={bumpControls}
      onTouchStart={bumpControls}
      onContextMenu={(e) => e.preventDefault()}
      sx={{
        position: 'relative',
        width: '100%',
        height: '100%',
        bgcolor: '#000',
        overflow: 'hidden',
        // Stops iOS offering "Save Video" on a long press.
        WebkitTouchCallout: 'none',
      }}
    >
      {source.kind === 'html5' ? (
        <Html5Surface
          src={source.src}
          events={events}
          transportRef={transportRef}
          videoRef={videoRef}
          onClick={togglePlay}
        />
      ) : (
        <YouTubeSurface
          youtubeId={source.youtubeId}
          events={events}
          transportRef={transportRef}
          rawPlayerRef={youtubePlayerRef}
          onClick={togglePlay}
        />
      )}

      {watermark && <Watermark name={watermark.name} code={watermark.code} />}

      {nudge && (
        <Box
          role="status"
          sx={{
            position: 'absolute',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            bgcolor: 'rgba(0,0,0,0.82)',
            color: '#fff',
            px: 2,
            py: 1,
            borderRadius: 2,
            maxWidth: '90%',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            zIndex: 3,
          }}
        >
          <LockRoundedIcon sx={{ fontSize: 16 }} />
          <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{nudge}</Typography>
        </Box>
      )}

      {/* Big centre target while paused. Easiest thing to hit on a phone. */}
      {!playing && (
        <IconButton
          onClick={togglePlay}
          aria-label="Play"
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 72,
            height: 72,
            bgcolor: 'rgba(0,0,0,0.55)',
            color: '#fff',
            zIndex: 3,
            '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' },
          }}
        >
          <PlayArrowRoundedIcon sx={{ fontSize: 44 }} />
        </IconButton>
      )}

      <Box
        sx={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          px: { xs: 1.5, sm: 2 },
          pb: { xs: 1.5, sm: 2 },
          pt: 4,
          background: 'linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0))',
          opacity: showControls ? 1 : 0,
          transition: 'opacity 200ms ease',
          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
          zIndex: 4,
        }}
      >
        <Slider
          size="small"
          value={Math.min(current, scrubMax)}
          min={0}
          max={scrubMax}
          onChange={(_, v) => {
            // The track itself stops at the unlocked point, so there is nothing
            // to clamp afterwards: the skip cannot be expressed in the first place.
            const target = Math.min(Number(v), scrubMax);
            transportRef.current?.seek(target);
            setCurrent(target);
          }}
          aria-label="Seek"
          sx={{
            color: '#fff',
            py: 1,
            '& .MuiSlider-thumb': { width: 14, height: 14 },
            '& .MuiSlider-rail': { opacity: 0.35 },
          }}
        />

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton
            onClick={togglePlay}
            aria-label={playing ? 'Pause' : 'Play'}
            sx={{ color: '#fff', width: 48, height: 48 }}
          >
            {playing ? <PauseRoundedIcon /> : <PlayArrowRoundedIcon />}
          </IconButton>

          <IconButton
            onClick={back10}
            aria-label="Back 10 seconds"
            sx={{ color: '#fff', width: 48, height: 48 }}
          >
            <Replay10RoundedIcon />
          </IconButton>

          <Typography
            sx={{ color: '#fff', fontSize: 12, fontVariantNumeric: 'tabular-nums', ml: 0.5 }}
          >
            {fmt(current)} / {fmt(duration)}
          </Typography>

          <Box sx={{ flex: 1 }} />

          <IconButton
            onClick={cycleSpeed}
            aria-label={`Playback speed ${speed}x`}
            disabled={gate.maxRate <= 1}
            sx={{
              color: '#fff',
              width: 48,
              height: 48,
              gap: 0.25,
              '&.Mui-disabled': { color: 'rgba(255,255,255,0.35)' },
            }}
          >
            <SpeedRoundedIcon sx={{ fontSize: 18 }} />
            <Typography component="span" sx={{ fontSize: 11, fontWeight: 800 }}>
              {speed}x
            </Typography>
          </IconButton>

          {allowFullscreen && (
            <IconButton
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              sx={{ color: '#fff', width: 48, height: 48 }}
            >
              {isFullscreen ? <FullscreenExitRoundedIcon /> : <FullscreenRoundedIcon />}
            </IconButton>
          )}
        </Box>

        {lockedAhead && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.5, px: 0.5 }}>
            <LockRoundedIcon sx={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }} />
            <Typography sx={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
              The rest unlocks when you pass this checkpoint
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}

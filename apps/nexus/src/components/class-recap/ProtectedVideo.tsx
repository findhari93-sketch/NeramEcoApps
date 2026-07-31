'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Typography, IconButton, Slider } from '@neram/ui';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import PauseRoundedIcon from '@mui/icons-material/PauseRounded';
import Replay10RoundedIcon from '@mui/icons-material/Replay10Rounded';
import SpeedRoundedIcon from '@mui/icons-material/SpeedRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import Watermark from './Watermark';

/**
 * The <video> a student actually watches, with our own controls instead of the
 * browser's.
 *
 * Native controls are replaced rather than styled, for three reasons that all
 * matter here. The native menu offers "Download" and "Picture in picture", both
 * of which hand the file to the student. The native scrubber lets them drag past
 * a checkpoint and take the quiz having watched nothing, since the timeupdate
 * clamp can only pull them back AFTER the fact. And the native speed control
 * turns a 45 minute class into a 15 minute one.
 *
 * Everything here is a deterrent against casual sharing and casual skipping, not
 * a security boundary. Anyone with devtools can call play() at any rate they
 * like. The real guarantees live on the server: the quiz decides whether a
 * checkpoint is passed, and the byte proxy decides who gets the file at all.
 */

const SEEK_TOLERANCE_SECONDS = 2;
/** Once a checkpoint is passed, revision at speed is fine. Before that, no. */
const SPEED_OPTIONS = [1, 1.25, 1.5];

export interface ProtectedVideoProps {
  src: string;
  watermark: { name: string; code: string };
  /** Hard ceiling on the scrub track: the end of the furthest unlocked segment. */
  unlockedUntilSeconds: number;
  /** Highest point genuinely reached, so a forward jump beyond it is a skip. */
  furthestSeconds: number;
  /** True once the segment the student is in has been passed. */
  currentSegmentPassed: boolean;
  resumeAt?: number;
  onTimeUpdate?: (seconds: number, duration: number) => void;
  onSegmentBoundary?: () => void;
  onError?: () => void;
  onLoadedMetadata?: (duration: number) => void;
  videoRef?: React.MutableRefObject<HTMLVideoElement | null>;
}

function fmt(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function ProtectedVideo({
  src,
  watermark,
  unlockedUntilSeconds,
  furthestSeconds,
  currentSegmentPassed,
  resumeAt = 0,
  onTimeUpdate,
  onSegmentBoundary,
  onError,
  onLoadedMetadata,
  videoRef: externalRef,
}: ProtectedVideoProps) {
  const internalRef = useRef<HTMLVideoElement | null>(null);
  const videoRef = externalRef ?? internalRef;

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [nudge, setNudge] = useState<string | null>(null);

  const furthestRef = useRef(furthestSeconds);
  furthestRef.current = Math.max(furthestRef.current, furthestSeconds);
  const unlockedRef = useRef(unlockedUntilSeconds);
  unlockedRef.current = unlockedUntilSeconds;
  const onTimeUpdateRef = useRef(onTimeUpdate);
  onTimeUpdateRef.current = onTimeUpdate;
  const onBoundaryRef = useRef(onSegmentBoundary);
  onBoundaryRef.current = onSegmentBoundary;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const maxSpeed = currentSegmentPassed ? 1.5 : 1;

  const flash = useCallback((msg: string) => {
    setNudge(msg);
    setTimeout(() => setNudge(null), 2200);
  }, []);

  // ── Playback rate ceiling ────────────────────────────────────────────────
  // Enforced on the element rather than only in the UI, because the rate can be
  // changed from a console without touching our buttons.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const enforce = () => {
      if (video.playbackRate > maxSpeed) {
        video.playbackRate = maxSpeed;
        setSpeed(maxSpeed);
        flash('Full speed unlocks once you pass this checkpoint.');
      }
    };
    enforce();
    video.addEventListener('ratechange', enforce);
    return () => video.removeEventListener('ratechange', enforce);
  }, [maxSpeed, flash, videoRef]);

  // ── Anti-skip ────────────────────────────────────────────────────────────
  // The scrub track already refuses to go past the unlocked point, so this
  // catches the other routes in: a keyboard arrow, a trackpad gesture, or a
  // console seek. Snapping back on `seeked` rather than on `timeupdate` means
  // they never actually see the content they jumped to.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onSeeked = () => {
      const limit = Math.max(unlockedRef.current, furthestRef.current);
      if (video.currentTime > limit + SEEK_TOLERANCE_SECONDS) {
        video.currentTime = Math.max(0, limit);
        flash('Finish this section before skipping ahead.');
      }
    };
    video.addEventListener('seeked', onSeeked);
    return () => video.removeEventListener('seeked', onSeeked);
  }, [flash, videoRef]);

  // ── Pause when the page is hidden ────────────────────────────────────────
  // visibilitychange, deliberately not window blur. Blur also fires when the
  // quiz sheet takes focus, when devtools opens, and on every alt-tab preview,
  // and pausing on all of those is hostile. Visibility catches the real set:
  // tab switch, minimise, phone lock, app switch.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') videoRef.current?.pause();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [videoRef]);

  // ── Progress ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTime = () => {
      const t = video.currentTime;
      setCurrent(t);
      onTimeUpdateRef.current?.(t, Number.isFinite(video.duration) ? video.duration : 0);
      if (unlockedRef.current > 0 && t >= unlockedRef.current) {
        video.pause();
        onBoundaryRef.current?.();
      }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    video.addEventListener('timeupdate', onTime);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    return () => {
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
    };
  }, [videoRef]);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const d = Number.isFinite(video.duration) ? video.duration : 0;
    setDuration(d);
    onLoadedMetadata?.(d);
    if (resumeAt > 0 && resumeAt < d - 1) {
      try {
        video.currentTime = resumeAt;
      } catch {
        /* Seeking before ready is harmless; it starts at 0. */
      }
    }
  }, [onLoadedMetadata, resumeAt, videoRef]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  }, [videoRef]);

  const back10 = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, video.currentTime - 10);
  }, [videoRef]);

  const cycleSpeed = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const allowed = SPEED_OPTIONS.filter((s) => s <= maxSpeed);
    const next = allowed[(allowed.indexOf(speed) + 1) % allowed.length] ?? 1;
    video.playbackRate = next;
    setSpeed(next);
  }, [maxSpeed, speed, videoRef]);

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

  const scrubMax = Math.max(1, Math.min(unlockedUntilSeconds || duration || 1, duration || 1));
  const lockedAhead = duration > 0 && scrubMax < duration - 1;

  return (
    <Box
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
      <video
        ref={videoRef as React.RefObject<HTMLVideoElement>}
        src={src}
        playsInline
        preload="metadata"
        controls={false}
        controlsList="nodownload noplaybackrate noremoteplayback"
        disablePictureInPicture
        disableRemotePlayback
        onLoadedMetadata={handleLoadedMetadata}
        onError={onError}
        onClick={togglePlay}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          cursor: 'pointer',
        }}
      />

      <Watermark name={watermark.name} code={watermark.code} />

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
            const video = videoRef.current;
            if (!video) return;
            // The track itself stops at the unlocked point, so there is nothing
            // to clamp afterwards: they cannot express the skip in the first place.
            video.currentTime = Math.min(Number(v), scrubMax);
            setCurrent(Number(v));
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
            disabled={maxSpeed === 1}
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

'use client';

/**
 * One voice note, inline. Used on the teacher review screen and on every student
 * surface that shows drawing feedback.
 *
 * Inline on purpose. The reader's AudioPlayer is pinned to the bottom of the
 * screen, where it would sit on top of BottomNav and of the redo sheet.
 *
 * The length comes from the server, not from the audio element: Chrome reports a
 * MediaRecorder WebM file's duration as Infinity until it has read the whole
 * file, so a scrubber built on `audio.duration` would have no end.
 *
 * `onProgress` is how a student's listening reaches the teacher as "Heard". It
 * fires once a play session passes two seconds (so an accidental tap is not a
 * listen), on pause, when the note ends, and when the page is left mid-note.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, IconButton, Slider, Stack, Typography, alpha } from '@neram/ui';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import PauseRoundedIcon from '@mui/icons-material/PauseRounded';
import GraphicEqRoundedIcon from '@mui/icons-material/GraphicEqRounded';
import { formatClock, formatSpoken } from '@/components/video/format';
import { buildStrokeOutline, smoothCentreline } from '@/lib/sketch-stroke';
import { validateTimeline, visibleAt, type SketchTimeline } from '@/lib/sketch-timeline';

const FONT_FAMILY = "'Segoe UI', system-ui, -apple-system, sans-serif";

/**
 * Backing-store scale for the replay canvas, capped at 2: a three-times phone
 * would otherwise paint nine times the pixels for a handful of pen strokes.
 */
const CANVAS_SCALE = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;

const SPEEDS = [1, 1.5, 2] as const;
const STARTED_AFTER_SECONDS = 2;

export interface VoiceProgressReport {
  positionMs: number;
  ended: boolean;
  started: boolean;
}

export interface VoiceNotePlayerProps {
  url: string | null;
  mime?: string | null;
  durationMs: number;
  title?: string;
  caption?: string | null;
  onProgress?: (report: VoiceProgressReport) => void;
  /** A "talk while you sketch" timeline, as stored. Replayed over `imageUrl`. */
  sketch?: unknown;
  /** The drawing the sketch was recorded over. */
  imageUrl?: string | null;
}

export default function VoiceNotePlayer({
  url,
  mime,
  durationMs,
  title = 'Voice feedback',
  caption,
  onProgress,
  sketch,
  imageUrl,
}: VoiceNotePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [cannotPlay, setCannotPlay] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const sessionStartedRef = useRef(false);
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  const duration = Math.max(durationMs / 1000, 0.1);

  // A walkthrough: the teacher's strokes replay over the drawing in step with
  // their voice. Validated here because it arrives as stored JSON and ends up in
  // a rendering loop.
  const timeline = useMemo<SketchTimeline | null>(() => (sketch ? validateTimeline(sketch) : null), [sketch]);
  const showsSketch = !!timeline && !!imageUrl;
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReducedMotion(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (!showsSketch || !el || typeof ResizeObserver === 'undefined') return;
    const measure = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [showsSketch]);

  const paint = useCallback(
    (ms: number) => {
      const canvas = canvasRef.current;
      if (!canvas || !timeline) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      for (const item of visibleAt(timeline, ms)) {
        if (item.kind === 'stroke') {
          // Reduced motion: the stroke arrives whole at the moment it was begun,
          // rather than drawing itself across the screen.
          const whole = reducedMotion
            ? timeline.ops.find((op) => op.k === 'stroke' && op.id === item.id)
            : null;
          const source =
            whole && whole.k === 'stroke' ? whole.p.map(([, x, y]) => ({ x, y })) : item.points || [];
          // A whole stroke shown at once keeps its own pressures; a stroke being
          // revealed point by point gets the ones visibleAt handed back.
          const pressures =
            whole && whole.k === 'stroke'
              ? (whole.p.every((point) => point.length === 4)
                  ? whole.p.map((point) => point[3] as number)
                  : undefined)
              : item.pressures;
          const points = source.map((point) => ({ x: point.x * width, y: point.y * height }));
          if (!points.length) continue;

          // Filled outline, the same renderer the teacher drew against, so a
          // tapered stroke replays as the stroke they actually made. A timeline
          // recorded before pressure existed has none, and comes back at a
          // constant width exactly as it always did.
          const lineWidth = Math.max(1, (item.width || 0) * width);
          const smoothed = smoothCentreline(points, pressures);
          const outline = buildStrokeOutline(smoothed.points, smoothed.pressures, lineWidth);
          if (!outline.length) continue;
          ctx.fillStyle = item.color;
          ctx.beginPath();
          ctx.moveTo(outline[0].x, outline[0].y);
          for (let i = 1; i < outline.length; i++) ctx.lineTo(outline[i].x, outline[i].y);
          ctx.closePath();
          ctx.fill();
        } else {
          const fontPx = Math.max(10, (item.fontSize || 0) * height);
          const x = (item.x || 0) * width;
          const y = (item.y || 0) * height;
          if (item.leader) {
            ctx.strokeStyle = item.color;
            ctx.lineWidth = Math.max(2, fontPx / 10);
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(x, y + fontPx / 2);
            ctx.lineTo(item.leader.x * width, item.leader.y * height);
            ctx.stroke();
          }
          ctx.font = `600 ${fontPx}px ${FONT_FAMILY}`;
          ctx.textBaseline = 'top';
          ctx.fillStyle = item.color;
          (item.text || '').split('\n').forEach((line, i) => ctx.fillText(line, x, y + i * fontPx * 1.25));
        }
      }
    },
    [timeline, reducedMotion],
  );

  // While it plays, follow the audio clock frame by frame.
  useEffect(() => {
    if (!showsSketch) return;
    let raf = 0;
    const tick = () => {
      const audio = audioRef.current;
      paint((audio?.currentTime ?? 0) * 1000);
      if (audio && !audio.paused) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [showsSketch, playing, paint, stage]);

  // Paused, including after a scrub: paint that moment once.
  useEffect(() => {
    if (showsSketch && !playing) paint(current * 1000);
  }, [showsSketch, playing, current, paint, stage]);

  useEffect(() => {
    setPlaying(false);
    setCurrent(0);
    setLoadError(false);
    sessionStartedRef.current = false;
    if (!mime || typeof document === 'undefined') {
      setCannotPlay(false);
      return;
    }
    const probe = document.createElement('audio');
    const container = mime.split(';')[0];
    setCannotPlay(probe.canPlayType(mime) === '' && probe.canPlayType(container) === '');
  }, [url, mime]);

  const report = useCallback((ended: boolean, started: boolean) => {
    const a = audioRef.current;
    if (!a || !onProgressRef.current) return;
    onProgressRef.current({ positionMs: Math.round(a.currentTime * 1000), ended, started });
  }, []);

  // A student who taps away mid-note still counts as having got that far.
  useEffect(() => {
    const onHide = () => {
      if (audioRef.current && !audioRef.current.paused) report(false, false);
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [report]);

  const toggle = async () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      try {
        a.playbackRate = SPEEDS[speedIndex];
        await a.play();
      } catch {
        setLoadError(true);
      }
    } else {
      a.pause();
    }
  };

  const cycleSpeed = () => {
    const next = (speedIndex + 1) % SPEEDS.length;
    setSpeedIndex(next);
    if (audioRef.current) audioRef.current.playbackRate = SPEEDS[next];
  };

  const shell = {
    p: 1.25,
    borderRadius: 2,
    border: '1px solid',
    borderColor: 'divider',
    bgcolor: (t: any) => alpha(t.palette.primary.main, 0.04),
  };

  if (!url || cannotPlay) {
    return (
      <Box sx={shell}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <GraphicEqRoundedIcon sx={{ fontSize: 18, color: 'text.secondary' }} aria-hidden />
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {title}
          </Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {cannotPlay
            ? "This browser can't play this voice note. Open the page in Chrome, or update your phone."
            : 'This voice note is not available right now. Refresh the page and try again.'}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={shell}>
      <audio
        ref={audioRef}
        src={url}
        // Notes are small, and a MediaRecorder file without cues only seeks
        // reliably once it has loaded, so load it all up front.
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false);
          if (sessionStartedRef.current && !audioRef.current?.ended) report(false, false);
        }}
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime;
          setCurrent(t);
          if (!sessionStartedRef.current && t >= STARTED_AFTER_SECONDS) {
            sessionStartedRef.current = true;
            report(false, true);
          }
        }}
        onEnded={() => {
          setPlaying(false);
          setCurrent(duration);
          report(true, !sessionStartedRef.current);
          sessionStartedRef.current = false;
        }}
        onError={() => setLoadError(true)}
      />
      {showsSketch && (
        <Box
          ref={stageRef}
          sx={{
            position: 'relative',
            mb: 1,
            borderRadius: 1.5,
            overflow: 'hidden',
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'grey.100',
          }}
        >
          <Box
            component="img"
            src={imageUrl as string}
            alt="Your drawing, with your teacher's marks appearing as they talk"
            sx={{ display: 'block', width: '100%' }}
          />
          <canvas
            ref={canvasRef}
            width={Math.max(1, Math.round(stage.w * CANVAS_SCALE))}
            height={Math.max(1, Math.round(stage.h * CANVAS_SCALE))}
            aria-hidden
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
          />
        </Box>
      )}
      <Stack direction="row" alignItems="center" spacing={1.25}>
        <IconButton
          onClick={toggle}
          aria-label={playing ? 'Pause voice note' : 'Play voice note'}
          sx={{
            width: 48,
            height: 48,
            flexShrink: 0,
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            '&:hover': { bgcolor: 'primary.dark' },
            '&.Mui-focusVisible, &:focus-visible': {
              outline: '3px solid',
              outlineColor: 'primary.light',
              outlineOffset: 2,
            },
          }}
        >
          {playing ? <PauseRoundedIcon /> : <PlayArrowRoundedIcon />}
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" alignItems="center" spacing={0.75}>
            <GraphicEqRoundedIcon sx={{ fontSize: 16, color: 'primary.main' }} aria-hidden />
            <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
              {title}
            </Typography>
          </Stack>
          <Slider
            size="small"
            min={0}
            max={duration}
            step={0.1}
            value={Math.min(current, duration)}
            onChange={(_, v) => {
              const seconds = v as number;
              setCurrent(seconds);
              if (audioRef.current) audioRef.current.currentTime = seconds;
            }}
            aria-label="Voice note position"
            getAriaValueText={(v) => formatSpoken(v)}
            sx={{ py: 1.25, '& .MuiSlider-thumb': { width: 14, height: 14 } }}
          />
          <Stack direction="row" justifyContent="space-between" spacing={1}>
            <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatClock(current)} / {formatClock(duration)}
            </Typography>
            {caption && (
              <Typography variant="caption" color="text.secondary" noWrap>
                {caption}
              </Typography>
            )}
          </Stack>
        </Box>
        <Button
          onClick={cycleSpeed}
          size="small"
          aria-label={`Playback speed ${SPEEDS[speedIndex]} times`}
          sx={{ minWidth: 48, minHeight: 48, fontWeight: 700, textTransform: 'none', flexShrink: 0 }}
        >
          {SPEEDS[speedIndex]}x
        </Button>
      </Stack>
      {loadError && (
        <Typography role="alert" variant="caption" color="error.main" sx={{ display: 'block', mt: 0.5 }}>
          This voice note could not load. Refresh the page and try again.
        </Typography>
      )}
    </Box>
  );
}

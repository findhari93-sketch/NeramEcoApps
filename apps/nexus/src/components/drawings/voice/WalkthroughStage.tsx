'use client';

/**
 * A "talk while you sketch" note replaying over the big drawing on the review
 * stage.
 *
 * The whole point of a walkthrough is watching the pen move while the voice
 * explains it, and a thumbnail in a 400px rail made the strokes too small to
 * follow. The player row in the rail stays the control; this is the picture.
 *
 * It paints from the player's own smoothed clock every frame it is on screen,
 * so pausing, scrubbing and changing speed in the rail all show here at once.
 * Escape or Close hands the stage back to the drawing and its markup tools.
 */
import { useEffect, useRef, useState } from 'react';
import { Box, Chip, IconButton, Tooltip } from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import PauseRoundedIcon from '@mui/icons-material/PauseRounded';
import DrawOutlinedIcon from '@mui/icons-material/DrawOutlined';
import { containBox, isReady } from '@/lib/annotation-geometry';
import { paintSketchFrame } from './paintSketchFrame';
import { CANVAS_SCALE, type StagePlayback } from './VoiceNotePlayer';

export default function WalkthroughStage({
  playback,
  imageAlt = 'The drawing with your marks replaying as you talk',
}: {
  playback: StagePlayback;
  /** The default is worded for the teacher who recorded it. */
  imageAlt?: string;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const playbackRef = useRef(playback);
  playbackRef.current = playback;

  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') playbackRef.current.close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const box = containBox(natural.w, natural.h, stage.w, stage.h);
  const ready = isReady(box);
  const canvasW = Math.max(1, Math.round(box.width * CANVAS_SCALE));
  const canvasH = Math.max(1, Math.round(box.height * CANVAS_SCALE));

  // Paint every frame while mounted. A frame with nothing new is a clearRect and
  // a handful of fills, which is cheaper than tracking when to stop.
  useEffect(() => {
    if (!ready) return;
    let raf = 0;
    let lastMs = -1;
    let lastSize = '';
    const tick = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        const ms = playbackRef.current.getNowMs();
        const size = `${canvas.width}x${canvas.height}`;
        if (ms !== lastMs || size !== lastSize) {
          paintSketchFrame(ctx, playbackRef.current.timeline, ms, canvas.width, canvas.height);
          lastMs = ms;
          lastSize = size;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready, canvasW, canvasH, playback.timeline]);

  return (
    <Box
      ref={stageRef}
      role="region"
      aria-label="Walkthrough replay"
      sx={{ position: 'relative', flex: 1, minHeight: 0, height: '100%', overflow: 'hidden' }}
    >
      <Box
        sx={{ position: 'absolute', visibility: ready ? 'visible' : 'hidden' }}
        style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
      >
        <Box
          component="img"
          src={playback.imageUrl}
          alt={imageAlt}
          onLoad={(e: React.SyntheticEvent<HTMLImageElement>) =>
            setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
          }
          sx={{ display: 'block', width: '100%', height: '100%', borderRadius: 1, boxShadow: 2 }}
        />
        <canvas
          ref={canvasRef}
          width={canvasW}
          height={canvasH}
          aria-hidden
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        />
      </Box>

      <Chip
        icon={<DrawOutlinedIcon sx={{ fontSize: 16 }} />}
        label="Walkthrough replay"
        size="small"
        sx={{ position: 'absolute', top: 8, left: 8, fontWeight: 700, bgcolor: 'background.paper', boxShadow: 1 }}
      />

      <Box sx={{ position: 'absolute', top: 4, right: 4, display: 'flex', gap: 1 }}>
        <Tooltip title={playback.playing ? 'Pause' : 'Play'}>
          <IconButton
            onClick={playback.togglePlay}
            aria-label={playback.playing ? 'Pause walkthrough' : 'Play walkthrough'}
            sx={{ width: 44, height: 44, bgcolor: 'background.paper', boxShadow: 1, '&:hover': { bgcolor: 'grey.100' } }}
          >
            {playback.playing ? <PauseRoundedIcon /> : <PlayArrowRoundedIcon />}
          </IconButton>
        </Tooltip>
        <Tooltip title="Close replay (Esc)">
          <IconButton
            onClick={playback.close}
            aria-label="Close walkthrough replay"
            sx={{ width: 44, height: 44, bgcolor: 'background.paper', boxShadow: 1, '&:hover': { bgcolor: 'grey.100' } }}
          >
            <CloseIcon />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}

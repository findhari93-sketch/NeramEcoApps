'use client';

/**
 * Talk while you sketch.
 *
 * The teacher draws on the student's drawing and talks at the same time. Both go
 * on one clock, so the student watches the correction appear in time with the
 * voice instead of meeting the finished marks all at once.
 *
 * It is the ordinary sketch canvas with a recording bar added: same tools, same
 * undo, same pinch and zoom. Nothing is sent from here. The finished recording
 * is handed back to the voice section, which saves it as the attempt's draft
 * note, and that goes out with the next Redo or Complete.
 *
 * The clock starts when the microphone actually starts, not when Start is
 * pressed. Opening the microphone takes hundreds of ms, and stamping strokes
 * against the press put every one of them that far behind the voice. Strokes
 * are also refused from the instant Stop is pressed, because the recorder
 * finishes encoding a moment later and anything drawn in that gap has no voice
 * to belong to.
 */
import { useCallback, useRef, useState } from 'react';
import { Box, Button, Chip, Stack, Typography } from '@neram/ui';
import MicNoneRoundedIcon from '@mui/icons-material/MicNoneRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import ReplayIcon from '@mui/icons-material/Replay';
import SketchOverCanvas from '../SketchOverCanvas';
import { useVoiceRecorder, type FinishedRecording } from '@/hooks/useVoiceRecorder';
import { formatClock } from '@/components/video/format';
import {
  MAX_TIMELINE_BYTES,
  timelineBytes,
  validateTimeline,
  type SketchOp,
  type SketchTimeline,
} from '@/lib/sketch-timeline';

export interface WalkthroughResult {
  recording: FinishedRecording;
  /** Null when the sketch was too dense to keep; the voice note still stands. */
  timeline: SketchTimeline | null;
  /** The canvas flattened, for callers that want it as the teacher's marks. */
  flattened: Blob;
}

export default function SketchWalkthroughRecorder({
  imageUrl,
  onCancel,
  onFinish,
}: {
  imageUrl: string;
  onCancel: () => void;
  onFinish: (result: WalkthroughResult) => void;
}) {
  const rec = useVoiceRecorder();
  const { status } = rec;
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [sketchDropped, setSketchDropped] = useState(false);
  const opsRef = useRef<SketchOp[]>([]);
  const [stopping, setStopping] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  const onOp = useCallback((op: SketchOp) => {
    const ops = opsRef.current;
    // Undo, erase and Clear can all land the same visible set twice in a row.
    const last = ops[ops.length - 1];
    if (
      op.k === 'show' &&
      last &&
      last.k === 'show' &&
      last.ids.length === op.ids.length &&
      last.ids.every((id, i) => id === op.ids[i])
    ) {
      return;
    }
    ops.push(op);
  }, []);

  const start = () => {
    // A second take starts from a clean sheet: the first take's strokes are not
    // in this recording, so they must not be on the canvas either.
    if (opsRef.current.length > 0 || rec.recording) setResetKey((k) => k + 1);
    opsRef.current = [];
    setSketchDropped(false);
    setStopping(false);
    void rec.start();
  };

  const stop = () => {
    setStopping(true);
    rec.stop();
  };

  /**
   * The strokes, or nothing.
   *
   * Checked here with the same rule the server uses, because the voice note is
   * the valuable half: a sketch the server would refuse must cost the teacher
   * their drawing, never their recording.
   */
  const buildTimeline = (): SketchTimeline | null => {
    if (!size || opsRef.current.length === 0) return null;
    const timeline: SketchTimeline = { v: 1, w: size.w, h: size.h, ops: opsRef.current };
    if (timelineBytes(timeline) > MAX_TIMELINE_BYTES || !validateTimeline(timeline)) {
      setSketchDropped(true);
      return null;
    }
    return timeline;
  };

  // The canvas's own Save button flattens the drawing; that is the moment the
  // walkthrough is finished, so the audio, the timeline and the flattened image
  // travel back together.
  const handleSave = async (flattened: Blob) => {
    const timeline = buildTimeline();
    if (!rec.recording) return;
    onFinish({ recording: rec.recording, timeline, flattened });
  };

  const clockReady = status === 'recording' && rec.clockStartedAt != null && !stopping;
  const recording = clockReady ? { startedAt: rec.clockStartedAt as number, onOp } : null;
  const elapsed = formatClock(rec.elapsedMs / 1000);
  const cap = formatClock(rec.capMs / 1000);

  const controls = (
    <Stack direction="row" alignItems="center" spacing={1} sx={{ mr: 1 }}>
      {status === 'recording' ? (
        <>
          <Box
            aria-hidden
            sx={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              bgcolor: 'error.main',
              '@keyframes walkthroughPulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.3 } },
              '@media (prefers-reduced-motion: no-preference)': {
                animation: 'walkthroughPulse 1.2s ease-in-out infinite',
              },
            }}
          />
          <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {elapsed} / {cap}
          </Typography>
          <Button
            variant="contained"
            color="error"
            size="small"
            startIcon={<StopRoundedIcon />}
            onClick={stop}
            sx={{ textTransform: 'none', fontWeight: 700, minHeight: 44 }}
          >
            Stop
          </Button>
        </>
      ) : status === 'recorded' && rec.recording ? (
        <>
          <Chip size="small" label={`Recorded ${formatClock(rec.recording.durationMs / 1000)}`} sx={{ fontWeight: 700 }} />
          <Button
            size="small"
            startIcon={<ReplayIcon />}
            onClick={start}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            Record again
          </Button>
        </>
      ) : (
        <Button
          variant="contained"
          size="small"
          startIcon={<MicNoneRoundedIcon />}
          onClick={start}
          disabled={status === 'requesting'}
          sx={{ textTransform: 'none', fontWeight: 700, minHeight: 44 }}
        >
          {status === 'requesting' ? 'Starting' : 'Start recording'}
        </Button>
      )}
    </Stack>
  );

  const hint =
    status === 'idle'
      ? 'Press Start recording, then talk them through the drawing as you mark it.'
      : status === 'requesting' || (status === 'recording' && rec.clockStartedAt == null)
        ? 'Getting the microphone ready. Start drawing when the timer runs.'
      : status === 'denied'
        ? 'Nexus cannot use your microphone. Allow it from the lock icon beside the address bar.'
        : status === 'unsupported'
          ? 'This browser cannot record audio. Open Nexus in Chrome, Edge or Safari.'
          : status === 'recorded'
            ? sketchDropped
              ? 'Your voice note is ready. The drawing could not be kept in step with it, so it saves as a plain voice note.'
              : 'Press Save to keep this walkthrough as the voice note for this attempt.'
            : null;

  return (
    <>
      <SketchOverCanvas
        imageUrl={imageUrl}
        onSave={handleSave}
        onClose={onCancel}
        recording={recording}
        headerExtra={controls}
        onImageSize={setSize}
        resetKey={resetKey}
        saveDisabled={status !== 'recorded' || !rec.recording}
        saveLabel="Save walkthrough"
      />
      {hint && (
        <Box
          role="status"
          sx={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 88,
            zIndex: 1401,
            display: 'flex',
            justifyContent: 'center',
            px: 2,
            pointerEvents: 'none',
          }}
        >
          <Typography
            variant="body2"
            sx={{
              bgcolor: 'rgba(0,0,0,0.78)',
              color: '#fff',
              px: 1.5,
              py: 0.75,
              borderRadius: 2,
              maxWidth: 520,
              textAlign: 'center',
            }}
          >
            {hint}
          </Typography>
        </Box>
      )}
    </>
  );
}

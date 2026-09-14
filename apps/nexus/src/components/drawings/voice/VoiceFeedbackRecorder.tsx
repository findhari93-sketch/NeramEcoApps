'use client';

/**
 * The teacher's voice note for one drawing attempt, on the review screen.
 *
 * Record, and the note saves itself as a draft the moment Stop is pressed: the
 * audio goes straight to the private bucket through a signed URL, then the row
 * is written. Nothing reaches the student from here. The draft goes out with the
 * next Redo or Complete, inside the one message that carries the decision.
 *
 * `onBusyChange` lets the page hold Redo and Complete while a note is being
 * recorded or saved, so a review can never go out a few seconds ahead of the
 * voice note it was meant to carry.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  LinearProgress,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import MicNoneRoundedIcon from '@mui/icons-material/MicNoneRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ReplayIcon from '@mui/icons-material/Replay';
import HeadphonesOutlinedIcon from '@mui/icons-material/HeadphonesOutlined';
import DrawOutlinedIcon from '@mui/icons-material/DrawOutlined';
import { useVoiceRecorder, type FinishedRecording } from '@/hooks/useVoiceRecorder';
import { formatClock } from '@/components/video/format';
import type { SketchTimeline } from '@/lib/sketch-timeline';
import SketchWalkthroughRecorder, { type WalkthroughResult } from './SketchWalkthroughRecorder';
import {
  RECORDING_MIN_MS,
  heardLabel,
  heardState,
  voiceContentType,
  voiceStatusLine,
} from '@/lib/voice-recording';
import type { VoiceFeedbackView } from '@/lib/drawing-voice-feedback';
import VoiceNotePlayer, { type StagePlayback } from './VoiceNotePlayer';

// '1px', never 1: a bare number in sx means 100%, which is how an invisible
// announcer ends up as wide as the page and pushes a phone layout sideways.
// top and left pin it inside its container, so it can never sit below the
// fold and stretch the page (the rail's scroll body is its positioned parent).
const SCREEN_READER_ONLY = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;

/** 44px tall for a thumb, but only as wide as the words. */
const compactButtonSx = {
  minHeight: 44,
  textTransform: 'none',
  fontWeight: 600,
  fontSize: '0.875rem',
} as const;

export interface VoiceFeedbackRecorderProps {
  submissionId: string;
  voice: VoiceFeedbackView | null;
  /** A locked round: show the note if there is one, offer no recording. */
  readOnly: boolean;
  /** The student's drawing, which "Talk while you sketch" records over. */
  imageUrl?: string | null;
  getToken: () => Promise<string | null>;
  onChange: (voice: VoiceFeedbackView | null) => void;
  onBusyChange?: (busy: boolean) => void;
  /** Replay a walkthrough over the big drawing on the review stage. */
  onStagePlayback?: (playback: StagePlayback | null) => void;
}

export default function VoiceFeedbackRecorder({
  submissionId,
  voice,
  readOnly,
  imageUrl,
  getToken,
  onChange,
  onBusyChange,
  onStagePlayback,
}: VoiceFeedbackRecorderProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const rec = useVoiceRecorder();
  const { status, recording, discard } = rec;
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [walkthroughOpen, setWalkthroughOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [announce, setAnnounce] = useState('');
  const handledBlobRef = useRef<Blob | null>(null);

  const endpoint = `/api/drawing/submissions/${submissionId}/voice-feedback`;
  const recordingNow = status === 'requesting' || status === 'recording';
  const busy = recordingNow || saving || deleting;

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  // Leaving mid-recording or mid-save loses the note, so the browser asks first.
  useEffect(() => {
    if (!recordingNow && !saving) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [recordingNow, saving]);

  useEffect(() => {
    if (status === 'recording') setAnnounce('Recording started');
    else if (status === 'recorded') setAnnounce('Recording stopped. Saving your voice note.');
  }, [status]);

  const save = useCallback(
    async (r: FinishedRecording, timeline: SketchTimeline | null = null) => {
      setSaving(true);
      setSaveError(null);
      try {
        const token = await getToken();
        if (!token) throw new Error('Your session expired. Refresh the page and try again.');
        const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

        const mintRes = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({ mime: r.mime, size_bytes: r.blob.size }),
        });
        const mint = await mintRes.json().catch(() => ({}));
        if (!mintRes.ok || !mint.signedUrl) throw new Error(mint.error || 'Could not start the upload.');

        const contentType = voiceContentType(r.mime);
        const upRes = await fetch(mint.signedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': contentType, 'x-upsert': 'false' },
          body: new Blob([r.blob], { type: contentType }),
        });
        if (!upRes.ok) throw new Error('The recording did not upload. Check your connection and try again.');

        const saveRes = await fetch(endpoint, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            path: mint.path,
            mime: r.mime,
            duration_ms: r.durationMs,
            size_bytes: r.blob.size,
            sketch: timeline,
          }),
        });
        const saved = await saveRes.json().catch(() => ({}));
        if (!saveRes.ok) throw new Error(saved.error || 'Could not save the voice note.');

        onChange(saved.voice_feedback ?? null);
        discard();
        setAnnounce('Voice note saved');
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Could not save the voice note.');
      } finally {
        setSaving(false);
      }
    },
    [discard, endpoint, getToken, onChange],
  );

  // Save the moment a recording finishes. Guarded by blob so a re-render never
  // uploads the same note twice; Retry calls save directly.
  useEffect(() => {
    if (status !== 'recorded' || !recording || handledBlobRef.current === recording.blob) return;
    handledBlobRef.current = recording.blob;
    if (recording.durationMs < RECORDING_MIN_MS) {
      discard();
      setSaveError('That was too short to keep. Record again and talk for a moment longer.');
      return;
    }
    void save(recording);
  }, [status, recording, save, discard]);

  const remove = async () => {
    setDeleting(true);
    setSaveError(null);
    try {
      const token = await getToken();
      const res = await fetch(endpoint, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Could not delete the voice note.');
      onChange(null);
      setConfirmDelete(false);
      setAnnounce('Voice note deleted');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not delete the voice note.');
    } finally {
      setDeleting(false);
    }
  };

  const startRecording = () => {
    setSaveError(null);
    setConfirmDelete(false);
    void rec.start();
  };

  // A walkthrough saves down the same path as a plain note: it is one, plus the
  // strokes that were drawn while it was being spoken.
  // The canvas shows "Saved!" and closes itself a moment later, which is what
  // clears `walkthroughOpen`. Closing it from here instead would unmount the
  // canvas mid-save and lose that confirmation.
  const finishWalkthrough = (result: WalkthroughResult) => {
    setSaveError(null);
    void save(result.recording, result.timeline);
  };

  if (readOnly && !voice) return null;

  const heard = heardState(voice);
  const unsavedRecording = status === 'recorded' && recording && !saving && saveError ? recording : null;
  const remainingMs = rec.capMs - rec.elapsedMs;
  const nearCap = status === 'recording' && remainingMs <= 30_000;

  const recordingControls = (
    <Stack direction="row" alignItems="center" spacing={1.25}>
      <Box
        aria-hidden
        sx={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          bgcolor: 'error.main',
          flexShrink: 0,
          '@keyframes voiceNotePulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.3 } },
          '@media (prefers-reduced-motion: no-preference)': {
            animation: 'voiceNotePulse 1.2s ease-in-out infinite',
          },
        }}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }} color="text.primary">
          {status === 'requesting'
            ? 'Waiting for the microphone'
            : `${formatClock(rec.elapsedMs / 1000)} / ${formatClock(rec.capMs / 1000)}`}
        </Typography>
        <LinearProgress
          variant="determinate"
          color={nearCap ? 'warning' : 'primary'}
          value={Math.round(rec.level * 100)}
          aria-hidden
          sx={{ mt: 0.5, height: 6, borderRadius: 3, '& .MuiLinearProgress-bar': { transition: 'none' } }}
        />
        {nearCap && (
          <Typography variant="caption" color="text.primary" sx={{ fontWeight: 700 }}>
            {Math.ceil(remainingMs / 1000)} seconds left
          </Typography>
        )}
      </Box>
      <Button onClick={rec.cancel} sx={{ minHeight: 48, textTransform: 'none' }}>
        Cancel
      </Button>
      <Button
        variant="contained"
        color="error"
        startIcon={<StopRoundedIcon />}
        onClick={rec.stop}
        disabled={status !== 'recording'}
        sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700 }}
      >
        Stop
      </Button>
    </Stack>
  );

  return (
    <Box
      component="section"
      aria-label="Voice note"
      sx={{ mb: 2, p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <MicNoneRoundedIcon sx={{ fontSize: 20, color: 'primary.main' }} aria-hidden />
        <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }}>
          Voice note
        </Typography>
        {voice && !recordingNow && !saving && (
          // A neutral chip with a coloured icon. Amber and green text on white
          // fall under 4.5:1 in this theme, so the colour rides on the glyph.
          <Chip
            size="small"
            icon={
              <HeadphonesOutlinedIcon
                sx={{
                  fontSize: 16,
                  '&&': {
                    color: heard === 'full' ? 'success.main' : heard === 'unsent' ? 'text.secondary' : 'warning.main',
                  },
                }}
              />
            }
            label={heardLabel(heard)}
            sx={{ fontWeight: 700 }}
          />
        )}
      </Stack>
      <Box aria-live="polite" sx={SCREEN_READER_ONLY}>
        {announce}
      </Box>

      {recordingNow ? (
        isMobile ? (
          <>
            <Typography variant="body2" color="text.secondary">
              Recording. Stop it from the bar at the bottom of the screen.
            </Typography>
            <Box
              sx={{
                position: 'fixed',
                left: 0,
                right: 0,
                bottom: 64,
                zIndex: 11,
                px: 1.5,
                py: 1,
                bgcolor: 'background.paper',
                borderTop: '1px solid',
                borderColor: 'divider',
                boxShadow: '0 -2px 8px rgba(0,0,0,0.12)',
              }}
            >
              {recordingControls}
            </Box>
          </>
        ) : (
          recordingControls
        )
      ) : saving && recording ? (
        <Stack spacing={1}>
          <VoiceNotePlayer url={recording.url} mime={recording.mime} durationMs={recording.durationMs} title="Your voice note" />
          <LinearProgress aria-label="Saving your voice note" />
          <Typography variant="caption" color="text.secondary">
            Saving your voice note
          </Typography>
        </Stack>
      ) : unsavedRecording ? (
        <Stack spacing={1}>
          <VoiceNotePlayer
            url={unsavedRecording.url}
            mime={unsavedRecording.mime}
            durationMs={unsavedRecording.durationMs}
            title="Not saved yet"
          />
          <Stack direction="row" spacing={1}>
            <Button
              variant="contained"
              onClick={() => save(unsavedRecording)}
              sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700 }}
            >
              Try again
            </Button>
            <Button onClick={discard} sx={{ minHeight: 48, textTransform: 'none' }}>
              Discard
            </Button>
          </Stack>
        </Stack>
      ) : voice ? (
        <Stack spacing={1}>
          <VoiceNotePlayer
            url={voice.url}
            mime={voice.audio_mime}
            durationMs={voice.duration_ms}
            title={voice.sketch ? 'Your walkthrough' : 'Your voice note'}
            sketch={voice.sketch}
            imageUrl={voice.base_image_url}
            onStagePlayback={onStagePlayback}
          />
          <Typography variant="caption" color="text.secondary">
            {voiceStatusLine(voice, Date.now())}
          </Typography>
          {!readOnly &&
            (confirmDelete ? (
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Typography variant="body2" sx={{ flex: 1, minWidth: 160 }}>
                  {voice.sent_at ? 'Delete this note? The student will no longer hear it.' : 'Delete this draft?'}
                </Typography>
                <Button onClick={() => setConfirmDelete(false)} sx={{ minHeight: 48, textTransform: 'none' }}>
                  Keep
                </Button>
                <Button
                  variant="contained"
                  color="error"
                  onClick={remove}
                  disabled={deleting}
                  sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700 }}
                >
                  {deleting ? 'Deleting' : 'Delete'}
                </Button>
              </Stack>
            ) : (
              // Quiet text buttons at their natural width: these are second
              // chances, not the main action, and full-width outlined buttons
              // made them the loudest thing in the rail.
              <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
                <Button size="small" startIcon={<ReplayIcon />} onClick={startRecording} sx={compactButtonSx}>
                  Record again
                </Button>
                {imageUrl && (
                  <Button
                    size="small"
                    startIcon={<DrawOutlinedIcon />}
                    onClick={() => setWalkthroughOpen(true)}
                    sx={compactButtonSx}
                  >
                    Sketch and talk
                  </Button>
                )}
                <Box sx={{ flex: 1 }} />
                <Tooltip title="Delete voice note">
                  <IconButton
                    onClick={() => setConfirmDelete(true)}
                    aria-label="Delete voice note"
                    sx={{ width: 44, height: 44, color: 'text.secondary' }}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            ))}
          {!readOnly && voice.sent_at && !confirmDelete && (
            <Typography variant="caption" color="text.secondary">
              Recording again replaces this note. The new one is sent with your next Redo or Complete.
            </Typography>
          )}
        </Stack>
      ) : (
        <Stack spacing={0.75}>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button
              variant="outlined"
              size="small"
              startIcon={<MicNoneRoundedIcon />}
              onClick={startRecording}
              sx={{ ...compactButtonSx, px: 1.5 }}
            >
              Record
            </Button>
            {imageUrl && (
              <Button
                variant="outlined"
                size="small"
                startIcon={<DrawOutlinedIcon />}
                onClick={() => setWalkthroughOpen(true)}
                sx={{ ...compactButtonSx, px: 1.5 }}
              >
                Sketch and talk
              </Button>
            )}
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Up to 3 minutes. Sent with Redo or Complete.
          </Typography>
        </Stack>
      )}

      {status === 'denied' && (
        <Alert
          severity="warning"
          sx={{ mt: 1 }}
          action={
            <Button color="inherit" onClick={startRecording} sx={{ minHeight: 44, textTransform: 'none' }}>
              Try again
            </Button>
          }
        >
          Nexus cannot use your microphone. Allow it from the lock icon beside the address bar, then try again.
        </Alert>
      )}
      {status === 'unsupported' && (
        <Alert severity="info" sx={{ mt: 1 }}>
          This browser cannot record audio. Open Nexus in Chrome, Edge or Safari.
        </Alert>
      )}
      {(saveError || (status === 'error' && rec.error)) && !unsavedRecording && (
        <Alert severity="error" sx={{ mt: 1 }} role="alert">
          {saveError || rec.error}
        </Alert>
      )}
      {unsavedRecording && saveError && (
        <Alert severity="error" sx={{ mt: 1 }} role="alert">
          {saveError}
        </Alert>
      )}

      {walkthroughOpen && imageUrl && (
        <SketchWalkthroughRecorder
          imageUrl={imageUrl}
          onCancel={() => setWalkthroughOpen(false)}
          onFinish={finishWalkthrough}
        />
      )}
    </Box>
  );
}

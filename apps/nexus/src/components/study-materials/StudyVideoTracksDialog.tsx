'use client';

/**
 * Attach the language recordings to a Foundation chapter.
 *
 * A chapter was taught live in Tamil and in English. Each recording becomes a
 * track with its own checkpoints, cut from its own transcript: the two are
 * different lengths and pause in different places, so sharing timings between
 * them would drop the Tamil quiz into the middle of an English sentence.
 *
 * The flow is deliberately two-step. Drafting checkpoints reads the transcript
 * and proposes them; nothing reaches a student until Publish. An AI misfire is
 * then something a tutor sees and fixes rather than something a student meets.
 *
 * UPLOAD IS THE PRIMARY PATH, and that ordering is the whole point of this
 * layout. This dialog used to lead with "Draft checkpoints", which tries to pull
 * the transcript out of SharePoint. For these recordings that always fails:
 * lib/sharepoint-transcript.ts can only find a .vtt somebody placed by hand next
 * to the .mp4, and these files were uploaded to a plain document library with no
 * Teams meeting behind them. So the first press a teacher ever made hit a dead
 * end, and the feature went unused with zero tracks created. Fetching is still
 * offered, because a stored transcript makes it free, but it is secondary.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Box, Typography, Button,
  IconButton, TextField, MenuItem, Chip, Alert, CircularProgress, Divider,
  Collapse, useMediaQuery,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import PublishRoundedIcon from '@mui/icons-material/PublishRounded';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { extractYouTubeId } from '@/lib/youtube';

interface Track {
  id: string;
  language: string;
  language_label: string;
  title: string;
  status: string;
  readiness: string;
  hold_reason: string | null;
  section_count: number;
  video_duration_seconds: number | null;
  video_source: string;
}

interface Props {
  open: boolean;
  file: { id: string; title: string; recording?: { url: string | null } | null } | null;
  getToken: () => Promise<string | null>;
  onClose: () => void;
  onChanged?: () => void;
}

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'ta', label: 'தமிழ்' },
  { value: 'ta_en', label: 'Tamil + English' },
];

export default function StudyVideoTracksDialog({ open, file, getToken, onClose, onChanged }: Props) {
  const fullScreen = useMediaQuery('(max-width:599px)');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showVttHelp, setShowVttHelp] = useState(false);

  const [adding, setAdding] = useState(false);
  const [language, setLanguage] = useState('en');
  const [recordingUrl, setRecordingUrl] = useState('');

  const authed = useCallback(
    async (url: string, init?: RequestInit) => {
      const token = await getToken();
      const res = await fetch(url, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(init?.headers || {}),
        },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Request failed');
      return body;
    },
    [getToken],
  );

  const load = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const data = await authed(`/api/study-materials/files/${file.id}/video-tracks`);
      setTracks(data.tracks || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the recordings');
    } finally {
      setLoading(false);
    }
  }, [authed, file]);

  useEffect(() => {
    if (open) {
      load();
      setAdding(false);
      setRecordingUrl('');
      setNotice(null);
      setShowVttHelp(false);
    }
  }, [open, load]);

  /**
   * Offer the chapter's existing quick link as the first track's URL. A chapter
   * that already has an ungated link is exactly the one a teacher is here to
   * upgrade, and it saves them going back to SharePoint for a URL Nexus already
   * holds. Only for the first track: the second is the other language, which is
   * a different recording.
   */
  const startAdding = () => {
    const existing = file?.recording?.url;
    setRecordingUrl(!tracks.length && existing ? existing : '');
    setAdding(true);
  };

  const detected = recordingUrl.trim()
    ? extractYouTubeId(recordingUrl.trim())
      ? 'youtube'
      : 'sharepoint'
    : null;

  const addTrack = async () => {
    if (!file || !recordingUrl.trim()) return;
    setBusyId('new');
    setError(null);
    try {
      await authed(`/api/study-materials/files/${file.id}/video-tracks`, {
        method: 'POST',
        body: JSON.stringify({ language, recording_url: recordingUrl.trim() }),
      });
      setRecordingUrl('');
      setAdding(false);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the recording');
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Draft and save in one press. The preview step exists so a teacher can edit
   * before publishing, and they still can: this saves the checkpoints but leaves
   * the track a draft, so nothing is visible to a student until Publish.
   */
  const draftCheckpoints = async (track: Track, vttContent?: string) => {
    if (!file) return;
    setBusyId(track.id);
    setError(null);
    setNotice(null);
    try {
      const base = `/api/study-materials/files/${file.id}/video-tracks/${track.id}`;
      const gen = await authed(`${base}/generate`, {
        method: 'POST',
        body: JSON.stringify(vttContent ? { vtt_content: vttContent } : {}),
      });
      if (gen.error === 'no_transcript') {
        setNotice(gen.message);
        return;
      }
      const sections = gen.generated?.sections || [];
      if (!sections.length) {
        setNotice('The transcript was too short to split into checkpoints.');
        return;
      }
      await authed(`${base}/sections`, { method: 'PUT', body: JSON.stringify({ sections }) });
      setNotice(`Drafted ${sections.length} checkpoints. Review them, then publish.`);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not draft the checkpoints');
    } finally {
      setBusyId(null);
    }
  };

  const uploadVtt = (track: Track) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.vtt,text/vtt';
    input.onchange = async () => {
      const chosen = input.files?.[0];
      if (!chosen) return;
      const text = await chosen.text();
      await draftCheckpoints(track, text);
    };
    input.click();
  };

  const setStatus = async (track: Track, status: 'published' | 'draft') => {
    if (!file) return;
    setBusyId(track.id);
    setError(null);
    try {
      await authed(`/api/study-materials/files/${file.id}/video-tracks/${track.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the recording');
    } finally {
      setBusyId(null);
    }
  };

  const removeTrack = async (track: Track) => {
    if (!file) return;
    setBusyId(track.id);
    try {
      await authed(`/api/study-materials/files/${file.id}/video-tracks/${track.id}`, {
        method: 'DELETE',
      });
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the recording');
    } finally {
      setBusyId(null);
    }
  };

  const taken = new Set(tracks.map((t) => t.language));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      fullScreen={fullScreen}
      PaperProps={{ sx: { borderRadius: fullScreen ? 0 : 2 } }}
    >
      <DialogTitle sx={{ pr: 6 }}>
        <Typography component="span" sx={{ fontWeight: 700 }}>
          Class recordings
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block">
          {file?.title}
        </Typography>
        <IconButton
          onClick={onClose}
          aria-label="Close"
          sx={{ position: 'absolute', top: 8, right: 8, width: 48, height: 48 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {notice && <Alert severity="info" sx={{ mb: 2 }}>{notice}</Alert>}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={28} />
          </Box>
        ) : (
          <>
            {/* The order of work, stated up front. Without it the dialog offers
                four buttons with no hint that they are a sequence, and the one
                that must come first is not the obvious one. */}
            <Box sx={{ mb: 2.5, p: 1.5, bgcolor: 'action.hover', borderRadius: 1.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>
                Students watch one of these inside Nexus. They cannot skip ahead, and the video
                stops at each checkpoint to ask a question.
              </Typography>
              <Typography variant="caption" color="text.secondary" component="div">
                1. Add the Tamil or English recording
                <br />
                2. Upload its transcript to create the checkpoints
                <br />
                3. Review, then publish
              </Typography>
            </Box>

            {!tracks.length && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                No recordings yet. Adding just one language is fine: students only ever see the
                languages you publish.
              </Typography>
            )}

            {tracks.map((t) => {
              const busy = busyId === t.id;
              const published = t.status === 'published';
              const needsTranscript = t.section_count === 0;
              return (
                <Box key={t.id} sx={{ mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75, flexWrap: 'wrap' }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {t.language_label}
                    </Typography>
                    <Chip
                      size="small"
                      color={published ? 'success' : 'default'}
                      label={published ? 'Published' : 'Draft'}
                    />
                    <Chip
                      size="small"
                      variant="outlined"
                      label={`${t.section_count} checkpoint${t.section_count === 1 ? '' : 's'}`}
                    />
                    <Chip
                      size="small"
                      variant="outlined"
                      label={t.video_source === 'youtube' ? 'YouTube' : 'SharePoint'}
                    />
                    {t.readiness !== 'ready' && (
                      <Chip size="small" color="warning" label={t.hold_reason || t.readiness} />
                    )}
                    <Box sx={{ flex: 1 }} />
                    <IconButton
                      aria-label={`Remove the ${t.language_label} recording`}
                      onClick={() => removeTrack(t)}
                      disabled={busy}
                      sx={{ width: 48, height: 48 }}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Box>

                  {/* Say why Publish is dead rather than leaving a greyed button
                      and letting the teacher guess. */}
                  {needsTranscript && (
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                      Upload this recording&apos;s transcript to create its checkpoints. It cannot be
                      published until then.
                    </Typography>
                  )}

                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Button
                      size="small"
                      variant={needsTranscript ? 'contained' : 'outlined'}
                      startIcon={busy ? <CircularProgress size={14} /> : <UploadFileIcon />}
                      onClick={() => uploadVtt(t)}
                      disabled={busy}
                      sx={{ textTransform: 'none', minHeight: 48 }}
                    >
                      {needsTranscript ? 'Upload transcript (.vtt)' : 'Replace transcript'}
                    </Button>
                    <Button
                      size="small"
                      variant={published || !needsTranscript ? 'contained' : 'outlined'}
                      startIcon={<PublishRoundedIcon />}
                      onClick={() => setStatus(t, published ? 'draft' : 'published')}
                      disabled={busy || (!published && needsTranscript)}
                      color={published ? 'inherit' : 'primary'}
                      sx={{ textTransform: 'none', minHeight: 48 }}
                    >
                      {published ? 'Unpublish' : 'Publish'}
                    </Button>
                    {/* Kept, but demoted. Worth one press only when a transcript
                        was stored on an earlier attempt, and pointless for a
                        YouTube track, which has no SharePoint folder to search. */}
                    {t.video_source !== 'youtube' && (
                      <Button
                        size="small"
                        variant="text"
                        startIcon={<AutoAwesomeIcon />}
                        onClick={() => draftCheckpoints(t)}
                        disabled={busy}
                        sx={{ textTransform: 'none', minHeight: 48 }}
                      >
                        Try fetching it
                      </Button>
                    )}
                  </Box>
                  <Divider sx={{ mt: 2 }} />
                </Box>
              );
            })}

            <Button
              size="small"
              variant="text"
              startIcon={<HelpOutlineIcon />}
              onClick={() => setShowVttHelp((v) => !v)}
              sx={{ textTransform: 'none', minHeight: 48, mb: 1 }}
            >
              Where do I get a .vtt file?
            </Button>
            <Collapse in={showVttHelp}>
              <Box sx={{ mb: 2, pl: 1 }}>
                <Typography variant="caption" color="text.secondary" component="div">
                  Open the recording in Teams or Stream, open the <strong>Transcript</strong> panel,
                  then choose <strong>Download</strong> and pick the <strong>.vtt</strong> format.
                  If the class was never recorded through Teams there is no transcript to download,
                  and you will need to produce one with any transcription tool that exports .vtt.
                </Typography>
              </Box>
            </Collapse>

            {adding ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1 }}>
                <TextField
                  select
                  size="small"
                  label="Language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  fullWidth
                >
                  {LANGUAGES.map((l) => (
                    <MenuItem key={l.value} value={l.value} disabled={taken.has(l.value)}>
                      {l.label}
                      {taken.has(l.value) ? ' (already added)' : ''}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  size="small"
                  label="Recording link"
                  placeholder="A SharePoint or YouTube link"
                  value={recordingUrl}
                  onChange={(e) => setRecordingUrl(e.target.value)}
                  fullWidth
                  helperText={
                    detected === 'youtube'
                      ? 'YouTube recording: plays in the gated player, transcript must be uploaded.'
                      : detected === 'sharepoint'
                        ? 'SharePoint recording: plays in the gated player through the byte proxy.'
                        : 'Paste the link to this chapter’s class recording.'
                  }
                />
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    variant="contained"
                    onClick={addTrack}
                    disabled={busyId === 'new' || !recordingUrl.trim()}
                    sx={{ textTransform: 'none', minHeight: 48 }}
                  >
                    Add recording
                  </Button>
                  <Button onClick={() => setAdding(false)} sx={{ textTransform: 'none', minHeight: 48 }}>
                    Cancel
                  </Button>
                </Box>
              </Box>
            ) : (
              <Button
                startIcon={<AddRoundedIcon />}
                onClick={startAdding}
                disabled={taken.size >= LANGUAGES.length}
                sx={{ textTransform: 'none', minHeight: 48 }}
              >
                Add a recording
              </Button>
            )}
          </>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} sx={{ textTransform: 'none', minHeight: 48 }}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}

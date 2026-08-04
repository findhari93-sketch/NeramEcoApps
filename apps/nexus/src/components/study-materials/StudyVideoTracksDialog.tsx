'use client';

/**
 * Attach the language recordings to a Foundation chapter.
 *
 * A chapter was taught live in Tamil and in English. Each recording becomes a
 * track with its own checkpoints, cut from its own transcript: the two are
 * different lengths and pause in different places, so sharing timings between
 * them would drop the Tamil quiz into the middle of an English sentence.
 *
 * The flow is deliberately two-step. Draft checkpoints reads the transcript and
 * proposes them; nothing reaches a student until Publish. An AI misfire is then
 * something a tutor sees and fixes rather than something a student meets.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Box, Typography, Button,
  IconButton, TextField, MenuItem, Chip, Alert, CircularProgress, Divider,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import PublishRoundedIcon from '@mui/icons-material/PublishRounded';
import UploadFileIcon from '@mui/icons-material/UploadFile';

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
}

interface Props {
  open: boolean;
  file: { id: string; title: string } | null;
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
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
    }
  }, [open, load]);

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
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        <Typography component="span" sx={{ fontWeight: 700 }}>
          Class recordings
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block">
          {file?.title}
        </Typography>
        <IconButton onClick={onClose} aria-label="Close" sx={{ position: 'absolute', top: 8, right: 8 }}>
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
            {!tracks.length && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                No recordings yet. Add the English or Tamil class and students can watch it
                inside Nexus, with checkpoints they have to answer as they go.
              </Typography>
            )}

            {tracks.map((t) => {
              const busy = busyId === t.id;
              const published = t.status === 'published';
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
                    {t.readiness !== 'ready' && (
                      <Chip size="small" color="warning" label={t.hold_reason || t.readiness} />
                    )}
                    <Box sx={{ flex: 1 }} />
                    <IconButton
                      size="small"
                      aria-label={`Remove the ${t.language_label} recording`}
                      onClick={() => removeTrack(t)}
                      disabled={busy}
                      sx={{ width: 44, height: 44 }}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Box>

                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={busy ? <CircularProgress size={14} /> : <AutoAwesomeIcon />}
                      onClick={() => draftCheckpoints(t)}
                      disabled={busy}
                      sx={{ textTransform: 'none', minHeight: 44 }}
                    >
                      Draft checkpoints
                    </Button>
                    <Button
                      size="small"
                      variant="text"
                      startIcon={<UploadFileIcon />}
                      onClick={() => uploadVtt(t)}
                      disabled={busy}
                      sx={{ textTransform: 'none', minHeight: 44 }}
                    >
                      Upload .vtt
                    </Button>
                    <Button
                      size="small"
                      variant={published ? 'text' : 'contained'}
                      startIcon={<PublishRoundedIcon />}
                      onClick={() => setStatus(t, published ? 'draft' : 'published')}
                      disabled={busy || (!published && t.section_count === 0)}
                      sx={{ textTransform: 'none', minHeight: 44 }}
                    >
                      {published ? 'Unpublish' : 'Publish'}
                    </Button>
                  </Box>
                  <Divider sx={{ mt: 2 }} />
                </Box>
              );
            })}

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
                  label="SharePoint recording link"
                  placeholder="https://....sharepoint.com/:v:/..."
                  value={recordingUrl}
                  onChange={(e) => setRecordingUrl(e.target.value)}
                  fullWidth
                />
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    variant="contained"
                    onClick={addTrack}
                    disabled={busyId === 'new' || !recordingUrl.trim()}
                    sx={{ textTransform: 'none', minHeight: 44 }}
                  >
                    Add recording
                  </Button>
                  <Button onClick={() => setAdding(false)} sx={{ textTransform: 'none', minHeight: 44 }}>
                    Cancel
                  </Button>
                </Box>
              </Box>
            ) : (
              <Button
                startIcon={<AddRoundedIcon />}
                onClick={() => setAdding(true)}
                disabled={taken.size >= LANGUAGES.length}
                sx={{ textTransform: 'none', minHeight: 44 }}
              >
                Add a recording
              </Button>
            )}
          </>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} sx={{ textTransform: 'none', minHeight: 44 }}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}

'use client';

/**
 * Attach the language recordings to a Foundation chapter.
 *
 * A chapter was taught live in Tamil and in English. Each recording becomes a
 * track with its own checkpoints, cut from its own transcript: the two are
 * different lengths and pause in different places, so sharing timings between
 * them would drop the Tamil quiz into the middle of an English sentence.
 *
 * ONE CARD PER LANGUAGE, and that is the correction this layout exists to make.
 * The machinery always supported both languages, but adding the second one was
 * hidden behind a collapsed form with a dropdown, so there was no view in which
 * "English done, Tamil not yet" was visible at once. Worse, the dropdown
 * defaulted to English and was never reset, so the press right after adding
 * English reopened the form already showing English, already taken, and failed
 * with a 409. The language the teacher wanted was one they had to go looking
 * for. Now a chip IS the language: nothing is preselected, nothing can be
 * chosen twice, and a fourth language is one more chip rather than a layout.
 * The row also STAYS on screen while a link is being pasted, because the first
 * version of it swapped itself for the form and a teacher who opened the wrong
 * language could no longer see the right one.
 *
 * UPLOAD IS THE PRIMARY PATH. This dialog used to lead with "Draft
 * checkpoints", which tries to pull the transcript out of SharePoint. For these
 * recordings that always fails: lib/sharepoint-transcript.ts can only find a
 * .vtt somebody placed by hand next to the .mp4, and these files were uploaded
 * to a plain document library with no Teams meeting behind them. So the first
 * press a teacher ever made hit a dead end, and the feature went unused with
 * zero tracks created. Fetching is still offered, because a stored transcript
 * makes it free, but it is secondary.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Box, Typography, Button,
  IconButton, TextField, Chip, Alert, CircularProgress, Collapse, useMediaQuery,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import PublishRoundedIcon from '@mui/icons-material/PublishRounded';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import TuneIcon from '@mui/icons-material/Tune';
import EditNoteIcon from '@mui/icons-material/EditNote';
import { extractYouTubeId } from '@/lib/youtube';
import { FALLBACK_TRACK_LANGUAGES, type TrackLanguageOption } from '@/lib/track-languages';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import ManageTrackLanguagesDialog from './ManageTrackLanguagesDialog';

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

export default function StudyVideoTracksDialog({ open, file, getToken, onClose, onChanged }: Props) {
  const router = useRouter();
  const fullScreen = useMediaQuery('(max-width:599px)');
  const { can } = useNexusAuthContext();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [languages, setLanguages] = useState<TrackLanguageOption[]>(FALLBACK_TRACK_LANGUAGES);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showVttHelp, setShowVttHelp] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  /** The language slot currently being filled in, or null when none is. */
  const [adding, setAdding] = useState<TrackLanguageOption | null>(null);
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
      if (data.languages?.length) setLanguages(data.languages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the recordings');
    } finally {
      setLoading(false);
    }
  }, [authed, file]);

  useEffect(() => {
    if (open) {
      load();
      setAdding(null);
      setRecordingUrl('');
      setNotice(null);
      setShowVttHelp(false);
    }
  }, [open, load]);

  /**
   * Open the slot for one language.
   *
   * The chapter's existing quick link is offered as the FIRST track's URL. A
   * chapter that already has an ungated link is exactly the one a teacher is
   * here to upgrade, and it saves them going back to SharePoint for a URL Nexus
   * already holds. Only for the first: the second is the other language, which
   * is a different recording.
   */
  const startAdding = (language: TrackLanguageOption) => {
    const existing = file?.recording?.url;
    setRecordingUrl(!tracks.length && existing ? existing : '');
    setAdding(language);
    setError(null);
  };

  const detected = recordingUrl.trim()
    ? extractYouTubeId(recordingUrl.trim())
      ? 'youtube'
      : 'sharepoint'
    : null;

  const addTrack = async () => {
    if (!file || !adding || !recordingUrl.trim()) return;
    setBusyId('new');
    setError(null);
    setNotice(null);
    try {
      const res = await authed(`/api/study-materials/files/${file.id}/video-tracks`, {
        method: 'POST',
        body: JSON.stringify({ language: adding.code, recording_url: recordingUrl.trim() }),
      });
      // Say which happened. A revived track that kept its checkpoints looks
      // identical to a new one that somehow already had some, and a teacher who
      // just re-added a language deserves to know their work came back.
      if (res.restored) {
        setNotice(
          res.checkpointsCleared
            ? `Restored the ${adding.label} recording. Its old checkpoints were cut from the previous video, so upload the transcript for this one.`
            : `Restored the ${adding.label} recording, checkpoints and all.`,
        );
      }
      setRecordingUrl('');
      setAdding(null);
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
   * before publishing, and now they actually can: this saves the checkpoints but
   * leaves the track a draft, and "Edit checkpoints" opens them.
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
      setNotice(
        `Drafted ${sections.length} checkpoints for ${track.language_label}. Open Edit checkpoints to read them, then publish.`,
      );
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
      setNotice(
        `Removed the ${track.language_label} recording. Students stop seeing it now, and adding it again brings it back.`,
      );
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the recording');
    } finally {
      setBusyId(null);
    }
  };

  const taken = new Set(tracks.map((t) => t.language));
  const missing = languages.filter((l) => !taken.has(l.code));

  /**
   * What a student would see right now.
   *
   * Mirrors isServable in the query layer exactly, published AND ready, rather
   * than testing status alone. A track held at readiness 'pending' is published
   * in the teacher's sense and invisible in the student's, and a line that
   * claimed otherwise would be worse than no line at all.
   */
  const servable = tracks.filter(
    (t) => t.status === 'published' && (t.readiness || 'ready') === 'ready',
  );

  return (
    <>
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
                  Students choose from the languages you publish and watch inside Nexus. They cannot
                  skip ahead, and the video stops at each checkpoint to ask a question. Finishing any
                  one language unlocks the chapter test.
                </Typography>
                <Typography variant="caption" color="text.secondary" component="div">
                  1. Add the recording for one language
                  <br />
                  2. Upload its transcript to create that language&apos;s checkpoints
                  <br />
                  3. Review the questions, then publish
                </Typography>
              </Box>

              {!tracks.length && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  No recordings yet. Adding just one language is fine: students only ever see the
                  languages you publish.
                </Typography>
              )}

              {/* ── One card per language that has a recording ──────────────── */}
              {tracks.map((t) => {
                const busy = busyId === t.id;
                const published = t.status === 'published';
                const needsTranscript = t.section_count === 0;
                return (
                  <Box
                    key={t.id}
                    sx={{
                      mb: 1.5,
                      p: 1.5,
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: published ? 'success.light' : 'divider',
                      bgcolor: 'background.paper',
                    }}
                  >
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
                      {/* The half of "generate, then review" that had no screen
                          behind it until now. */}
                      {!needsTranscript && (
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<EditNoteIcon />}
                          onClick={() =>
                            router.push(`/teacher/study-materials/checkpoints/${file?.id}/${t.id}`)
                          }
                          disabled={busy}
                          sx={{ textTransform: 'none', minHeight: 48 }}
                        >
                          Edit checkpoints
                        </Button>
                      )}
                      <Button
                        size="small"
                        variant={published ? 'outlined' : 'contained'}
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
                      {needsTranscript && t.video_source !== 'youtube' && (
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
                  </Box>
                );
              })}

              {/* The one consequence of publishing, stated. Every other line in
                  this dialog is about the teacher's own work; this is the only
                  one about what a student actually gets. */}
              {!!tracks.length && (
                <Typography
                  variant="caption"
                  color={servable.length ? 'success.main' : 'text.secondary'}
                  sx={{ display: 'block', mt: 0.5, fontWeight: 600 }}
                >
                  {servable.length
                    ? `Students see: ${servable.map((t) => t.language_label).join(', ')}`
                    : 'Students see nothing yet. Publish a recording to make it visible to them.'}
                </Typography>
              )}

              {/* ── The languages not added yet ─────────────────────────────── */}
              {missing.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
                    {tracks.length ? 'Add another recording.' : 'Add a recording.'} One chip is one
                    recording, in that language.
                  </Typography>
                  {/* The chips stay on screen while a link is being pasted. The
                      form used to REPLACE this row, so opening the wrong
                      language made every other one vanish and the only way back
                      was Cancel. That is exactly how a teacher looking for Tamil
                      ended up in "Tamil + English" with no visible way out.
                      Tapping another chip now switches the open slot in one
                      press. */}
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {missing.map((l) => {
                      const active = adding?.code === l.code;
                      return (
                        <Chip
                          key={l.code}
                          icon={<AddRoundedIcon />}
                          label={l.label}
                          onClick={() => startAdding(l)}
                          variant={active ? 'filled' : 'outlined'}
                          color="primary"
                          aria-pressed={active}
                          sx={{ height: 48, borderRadius: 99, px: 0.5, fontWeight: 600 }}
                        />
                      );
                    })}
                  </Box>
                </Box>
              )}

              {adding && (
                <Box
                  sx={{
                    mt: 1.5,
                    p: 1.5,
                    borderRadius: 2,
                    border: '1px dashed',
                    borderColor: 'primary.light',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1.5,
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {adding.label} recording
                  </Typography>
                  <TextField
                    size="small"
                    label="Recording link"
                    placeholder="A SharePoint or YouTube link"
                    value={recordingUrl}
                    onChange={(e) => setRecordingUrl(e.target.value)}
                    fullWidth
                    autoFocus
                    helperText={
                      detected === 'youtube'
                        ? 'YouTube recording: plays in the gated player, transcript must be uploaded.'
                        : detected === 'sharepoint'
                          ? 'SharePoint recording: plays in the gated player through the byte proxy.'
                          : `Paste the link to this chapter's ${adding.label} class recording.`
                    }
                  />
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      variant="contained"
                      onClick={addTrack}
                      disabled={busyId === 'new' || !recordingUrl.trim()}
                      sx={{ textTransform: 'none', minHeight: 48 }}
                    >
                      {busyId === 'new' ? 'Adding...' : `Add ${adding.label}`}
                    </Button>
                    <Button
                      onClick={() => setAdding(null)}
                      sx={{ textTransform: 'none', minHeight: 48 }}
                    >
                      Cancel
                    </Button>
                  </Box>
                </Box>
              )}

              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mt: 2.5 }}>
                <Button
                  size="small"
                  variant="text"
                  startIcon={<HelpOutlineIcon />}
                  onClick={() => setShowVttHelp((v) => !v)}
                  sx={{ textTransform: 'none', minHeight: 48 }}
                >
                  Where do I get a .vtt file?
                </Button>
                <Box sx={{ flex: 1 }} />
                {/* Admin only, the same gate as the feature flags. A teacher can
                    use every language on the list; deciding what is on it is a
                    different kind of decision. */}
                {can('system.settings') && (
                  <Button
                    size="small"
                    variant="text"
                    startIcon={<TuneIcon />}
                    onClick={() => setManageOpen(true)}
                    sx={{ textTransform: 'none', minHeight: 48, color: 'text.secondary' }}
                  >
                    Manage languages
                  </Button>
                )}
              </Box>
              <Collapse in={showVttHelp}>
                <Box sx={{ mb: 1, pl: 1 }}>
                  <Typography variant="caption" color="text.secondary" component="div">
                    Open the recording in Teams or Stream, open the <strong>Transcript</strong> panel,
                    then choose <strong>Download</strong> and pick the <strong>.vtt</strong> format.
                    If the class was never recorded through Teams there is no transcript to download,
                    and you will need to produce one with any transcription tool that exports .vtt.
                    Each language needs its own: they are different recordings.
                  </Typography>
                </Box>
              </Collapse>
            </>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose} sx={{ textTransform: 'none', minHeight: 48 }}>
            Done
          </Button>
        </DialogActions>
      </Dialog>

      <ManageTrackLanguagesDialog
        open={manageOpen}
        getToken={getToken}
        onClose={() => setManageOpen(false)}
        onSaved={(next) => {
          setLanguages(next);
          setNotice('Language list saved.');
        }}
      />
    </>
  );
}

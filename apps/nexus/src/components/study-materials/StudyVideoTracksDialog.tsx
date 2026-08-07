'use client';

/**
 * Every video on a Foundation chapter, in one list.
 *
 * A chapter was taught live in Tamil and in English. Each recording becomes a
 * track with its own checkpoints, cut from its own transcript: the two are
 * different lengths and pause in different places, so sharing timings between
 * them would drop the Tamil quiz into the middle of an English sentence.
 *
 * ONE ROW PER OFFERED LANGUAGE, ALWAYS, whether or not it has a recording, and
 * that is the correction this layout exists to make. The list used to be "cards
 * for what exists, then chips for what does not", so a language with a card had
 * no chip, and the first question a teacher asked on opening it was "why don't I
 * see English". English was there, in a card whose header had scrolled out of
 * view, and nothing else on the visible part of that card named a language.
 * Now every language is on screen with its state beside it, and the language a
 * teacher is looking for cannot be the one they cannot find.
 *
 * OPEN RECORDINGS. Publishing used to require checkpoints, which meant a
 * recording with no transcript reached nobody at all. That was the real reason
 * the ungated "Quick video link" existed and, since no student screen ever
 * rendered it, the real reason those recordings reached nobody either. A
 * recording can now be published open: watchable, ungated, and it does not
 * unlock the test. The gate counts only recordings a student can finish, so an
 * open one cannot trap anybody.
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
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { extractYouTubeId } from '@/lib/youtube';
import { FALLBACK_TRACK_LANGUAGES, type TrackLanguageOption } from '@/lib/track-languages';
import { buildLanguageRows, type RecordingTrack, type TrackRow } from '@/lib/chapter-recordings';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import ManageTrackLanguagesDialog from './ManageTrackLanguagesDialog';

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
  const [tracks, setTracks] = useState<RecordingTrack[]>([]);
  const [languages, setLanguages] = useState<TrackLanguageOption[]>(FALLBACK_TRACK_LANGUAGES);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showVttHelp, setShowVttHelp] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  /** The chapter's old ungated link, until it has been moved into a recording. */
  const [legacyLink, setLegacyLink] = useState<string | null>(null);

  /** The language code currently being filled in, or null when none is. */
  const [adding, setAdding] = useState<string | null>(null);
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
      setLegacyLink(file?.recording?.url || null);
    }
  }, [open, load, file]);

  /**
   * Open the slot for one language.
   *
   * The chapter's old quick link is offered as the FIRST recording's URL, and
   * SAYS so. It has always been pre-filled here and never explained, so a
   * teacher saw a URL appear in an empty field with no account of where it came
   * from. A chapter with an ungated link is exactly the one a teacher is here to
   * upgrade, and it saves them going back to SharePoint for a URL Nexus already
   * holds. Only for the first: the second is the other language, a different
   * recording.
   */
  const startAdding = (code: string) => {
    setRecordingUrl(!tracks.length && legacyLink ? legacyLink : '');
    setAdding(code);
    setError(null);
  };

  const detected = recordingUrl.trim()
    ? extractYouTubeId(recordingUrl.trim())
      ? 'youtube'
      : 'sharepoint'
    : null;

  /**
   * Move the old link rather than leave a copy of it behind.
   *
   * Two places holding the same URL is how a teacher ends up wondering which of
   * them a student is watching. Failure here is deliberately quiet: the
   * recording was created, which is the part that matters, and a chapter that
   * still shows its old link is a cosmetic problem the Setup checklist already
   * reports.
   */
  const clearLegacyLink = useCallback(async () => {
    if (!file) return;
    try {
      await authed(`/api/study-materials/files/${file.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ recording: null }),
      });
      setLegacyLink(null);
      onChanged?.();
    } catch {
      /* left for the Setup checklist to flag */
    }
  }, [authed, file, onChanged]);

  const addTrack = async () => {
    if (!file || !adding || !recordingUrl.trim()) return;
    const url = recordingUrl.trim();
    const label = languages.find((l) => l.code === adding)?.label || adding;
    const movedTheLink = !!legacyLink && url === legacyLink;
    setBusyId('new');
    setError(null);
    setNotice(null);
    try {
      const res = await authed(`/api/study-materials/files/${file.id}/video-tracks`, {
        method: 'POST',
        body: JSON.stringify({ language: adding, recording_url: url }),
      });
      // Say which happened. A revived track that kept its checkpoints looks
      // identical to a new one that somehow already had some, and a teacher who
      // just re-added a language deserves to know their work came back.
      if (res.restored) {
        setNotice(
          res.checkpointsCleared
            ? `Restored the ${label} recording. Its old checkpoints were cut from the previous video, so upload the transcript for this one.`
            : `Restored the ${label} recording, checkpoints and all.`,
        );
      } else if (movedTheLink) {
        setNotice(
          `Moved the chapter's old video link into the ${label} recording. Publish it to make it visible to students.`,
        );
      }
      if (movedTheLink) await clearLegacyLink();
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
  const draftCheckpoints = async (row: TrackRow, vttContent?: string) => {
    const track = row.track!;
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
        // An open recording that was already published becomes a gate the moment
        // it has checkpoints, and students part-way through it now have quizzes
        // to pass. Said at the moment it happens rather than discovered.
        track.status === 'published'
          ? `Drafted ${sections.length} checkpoints for ${row.label}. This recording was open, so finishing it now unlocks the chapter test, and anyone part-way through has these checkpoints to pass.`
          : `Drafted ${sections.length} checkpoints for ${row.label}. Open Edit checkpoints to read them, then publish.`,
      );
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not draft the checkpoints');
    } finally {
      setBusyId(null);
    }
  };

  const uploadVtt = (row: TrackRow) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.vtt,text/vtt';
    input.onchange = async () => {
      const chosen = input.files?.[0];
      if (!chosen) return;
      const text = await chosen.text();
      await draftCheckpoints(row, text);
    };
    input.click();
  };

  /**
   * Publish, unpublish, or publish open.
   *
   * `allowOpen` is passed only from the button that says so. The API refuses a
   * checkpoint-less publish by default on purpose: a teacher who meant to upload
   * a transcript and forgot should still be stopped.
   */
  const setStatus = async (row: TrackRow, status: 'published' | 'draft', allowOpen = false) => {
    const track = row.track!;
    if (!file) return;
    setBusyId(track.id);
    setError(null);
    setNotice(null);
    try {
      await authed(`/api/study-materials/files/${file.id}/video-tracks/${track.id}`, {
        method: 'PATCH',
        body: JSON.stringify(allowOpen ? { status, allow_open: true } : { status }),
      });
      if (status === 'published' && allowOpen) {
        setNotice(
          `${row.label} is live as an open recording. Students can watch it whenever they like, and it does not unlock the chapter test.`,
        );
      }
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the recording');
    } finally {
      setBusyId(null);
    }
  };

  const removeTrack = async (row: TrackRow) => {
    const track = row.track!;
    if (!file) return;
    setBusyId(track.id);
    try {
      await authed(`/api/study-materials/files/${file.id}/video-tracks/${track.id}`, {
        method: 'DELETE',
      });
      setNotice(
        `Removed the ${row.label} recording. Students stop seeing it now, and adding it again brings it back.`,
      );
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the recording');
    } finally {
      setBusyId(null);
    }
  };

  const rows = buildLanguageRows(languages, tracks);
  const servable = rows.filter((r) => r.state.live);

  const actionSx = { textTransform: 'none' as const, minHeight: 48 };

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
              <Box sx={{ mb: 2, p: 1.5, bgcolor: 'action.hover', borderRadius: 1.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>
                  Students choose from the languages you publish and watch inside Nexus. Every
                  language on this chapter is listed below, whether it has a recording or not.
                </Typography>
                <Typography variant="caption" color="text.secondary" component="div">
                  A recording with checkpoints stops the video to ask a question, cannot be skipped,
                  and finishing it unlocks the chapter test.
                  <br />
                  An open recording has none of that: students can watch it freely, and it does not
                  unlock the test.
                </Typography>
              </Box>

              {/*
                The old ungated link, named rather than silently borrowed.

                It always carries a way out. Adding it as a recording only works
                while the language it was taught in is still free, and on a
                chapter that already has that language there would otherwise be
                no way to clear it at all: the dialog that used to edit it has
                been retired. A dead end on a warning is worse than the warning.
              */}
              {legacyLink && (
                <Alert
                  severity="warning"
                  sx={{ mb: 2 }}
                  action={
                    <Button
                      size="small"
                      color="inherit"
                      onClick={clearLegacyLink}
                      sx={{ textTransform: 'none', minHeight: 44 }}
                    >
                      Remove it
                    </Button>
                  }
                >
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    This chapter has an old video link that no student can see.
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {tracks.length
                      ? 'The recordings below are what students get. Remove the old link once you are sure it is already one of them.'
                      : 'Add it below as a recording in the language it was taught in. It moves across, it is not copied.'}
                  </Typography>
                </Alert>
              )}

              {/* ── One row per language, recording or not ──────────────────── */}
              {rows.map((row) => {
                const track = row.track;
                const busy = !!track && busyId === track.id;
                const isAdding = adding === row.code;
                const needsTranscript = !!track && track.section_count === 0;
                return (
                  <Box
                    key={row.code}
                    sx={{
                      mb: 1.5,
                      p: 1.5,
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: row.state.live ? 'success.light' : 'divider',
                      bgcolor: 'background.paper',
                    }}
                  >
                    <Box
                      sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75, flexWrap: 'wrap' }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {row.label}
                      </Typography>
                      {/* The state in words, not only in colour. */}
                      <Chip size="small" color={row.state.colour} label={row.state.label} />
                      {!!track && (
                        <Chip
                          size="small"
                          variant="outlined"
                          label={track.video_source === 'youtube' ? 'YouTube' : 'SharePoint'}
                        />
                      )}
                    </Box>

                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                      sx={{ mb: 1 }}
                    >
                      {/* Every sentence names its own language, so a card read
                          halfway down a scrolled dialog still says what it is. */}
                      {row.state.detail(row.label)}
                    </Typography>

                    {!track ? (
                      !isAdding && (
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<AddRoundedIcon />}
                          onClick={() => startAdding(row.code)}
                          sx={actionSx}
                        >
                          Add {row.label}
                        </Button>
                      )
                    ) : (
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                        <Button
                          size="small"
                          variant={needsTranscript ? 'contained' : 'outlined'}
                          startIcon={busy ? <CircularProgress size={14} /> : <UploadFileIcon />}
                          onClick={() => uploadVtt(row)}
                          disabled={busy}
                          sx={actionSx}
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
                              router.push(`/teacher/study-materials/checkpoints/${file?.id}/${track.id}`)
                            }
                            disabled={busy}
                            sx={actionSx}
                          >
                            Edit checkpoints
                          </Button>
                        )}

                        {/* Two live paths where there used to be one dead button.
                            A disabled control carrying its own instruction is
                            the thing that made this dialog unusable without a
                            transcript. */}
                        {track.status === 'published' ? (
                          <Button
                            size="small"
                            variant="outlined"
                            color="inherit"
                            startIcon={<PublishRoundedIcon />}
                            onClick={() => setStatus(row, 'draft')}
                            disabled={busy}
                            sx={actionSx}
                          >
                            Unpublish
                          </Button>
                        ) : needsTranscript ? (
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<VisibilityOutlinedIcon />}
                            onClick={() => setStatus(row, 'published', true)}
                            disabled={busy}
                            sx={actionSx}
                          >
                            Publish as open
                          </Button>
                        ) : (
                          <Button
                            size="small"
                            variant="contained"
                            startIcon={<PublishRoundedIcon />}
                            onClick={() => setStatus(row, 'published')}
                            disabled={busy}
                            sx={actionSx}
                          >
                            Publish
                          </Button>
                        )}

                        {/* Kept, but demoted. Worth one press only when a
                            transcript was stored on an earlier attempt, and
                            pointless for a YouTube track, which has no
                            SharePoint folder to search. */}
                        {needsTranscript && track.video_source !== 'youtube' && (
                          <Button
                            size="small"
                            variant="text"
                            startIcon={<AutoAwesomeIcon />}
                            onClick={() => draftCheckpoints(row)}
                            disabled={busy}
                            sx={actionSx}
                          >
                            Try fetching it
                          </Button>
                        )}

                        {/* Out of the header row it used to share with nothing
                            but a title: a one-way door does not belong a
                            thumb-width from the language name. */}
                        <Box sx={{ flex: 1 }} />
                        <Button
                          size="small"
                          variant="text"
                          color="error"
                          startIcon={<DeleteOutlineIcon />}
                          onClick={() => removeTrack(row)}
                          disabled={busy}
                          aria-label={`Remove the ${row.label} recording`}
                          sx={actionSx}
                        >
                          Remove
                        </Button>
                      </Box>
                    )}

                    {/* The link field opens inside its own language's row, so
                        the language being filled in is never in doubt. */}
                    <Collapse in={isAdding} unmountOnExit>
                      <Box
                        sx={{
                          mt: 1.5,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 1.5,
                        }}
                      >
                        <TextField
                          size="small"
                          label={`${row.label} recording link`}
                          placeholder="A SharePoint or YouTube link"
                          value={recordingUrl}
                          onChange={(e) => setRecordingUrl(e.target.value)}
                          fullWidth
                          autoFocus
                          helperText={
                            legacyLink && recordingUrl.trim() === legacyLink
                              ? "Using the video link already on this chapter. Adding it here moves it across."
                              : detected === 'youtube'
                                ? 'YouTube recording: plays in the gated player, transcript must be uploaded.'
                                : detected === 'sharepoint'
                                  ? 'SharePoint recording: plays in the gated player through the byte proxy.'
                                  : `Paste the link to this chapter's ${row.label} class recording.`
                          }
                        />
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <Button
                            variant="contained"
                            onClick={addTrack}
                            disabled={busyId === 'new' || !recordingUrl.trim()}
                            sx={actionSx}
                          >
                            {busyId === 'new' ? 'Adding...' : `Add ${row.label}`}
                          </Button>
                          <Button onClick={() => setAdding(null)} sx={actionSx}>
                            Cancel
                          </Button>
                        </Box>
                      </Box>
                    </Collapse>
                  </Box>
                );
              })}

              {/* The one consequence of publishing, stated. Every other line in
                  this dialog is about the teacher's own work; this is the only
                  one about what a student actually gets. */}
              <Typography
                variant="caption"
                color={servable.length ? 'success.main' : 'text.secondary'}
                sx={{ display: 'block', mt: 0.5, fontWeight: 600 }}
              >
                {servable.length
                  ? `Students see: ${servable.map((r) => r.label).join(', ')}`
                  : 'Students see nothing yet. Publish a recording to make it visible to them.'}
              </Typography>

              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mt: 2.5 }}>
                <Button
                  size="small"
                  variant="text"
                  startIcon={<HelpOutlineIcon />}
                  onClick={() => setShowVttHelp((v) => !v)}
                  sx={actionSx}
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
                    sx={{ ...actionSx, color: 'text.secondary' }}
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
                    If the class was never recorded through Teams there is no transcript to download.
                    You can still publish the recording as open, and add checkpoints later.
                    Each language needs its own: they are different recordings.
                  </Typography>
                </Box>
              </Collapse>
            </>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose} sx={actionSx}>
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

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
 * THE VIDEO IS A STEP, AND IT USED TO BE MISSING. Attaching a recording meant
 * pasting a URL into a box that only appeared after pressing Add, so a teacher
 * had to leave Nexus, find the file in SharePoint and copy its link before this
 * dialog could do anything at all. Once attached the video disappeared again:
 * no file name, no link, no way to change it. The row that should have led with
 * the recording was the only part of the screen that never mentioned it, which
 * is why "where do I actually search and add the recording" was the question
 * this dialog kept provoking. Each language is now three visible steps, video
 * first, and the video can be SEARCHED for out of SharePoint and the teacher's
 * own OneDrive. Pasting a link is still there, demoted to the fallback it is.
 *
 * OPEN RECORDINGS. Publishing used to require checkpoints, which meant a
 * recording with no transcript reached nobody at all. That was the real reason
 * the ungated "Quick video link" existed and, since no student screen ever
 * rendered it, the real reason those recordings reached nobody either. A
 * recording can now be published open: watchable, ungated, and it does not
 * unlock the test. The gate counts only recordings a student can finish, so an
 * open one cannot trap anybody.
 *
 * UPLOAD IS THE PRIMARY TRANSCRIPT PATH. Fetching tries to pull the transcript
 * out of SharePoint, and for these recordings that usually fails:
 * lib/sharepoint-transcript.ts can only find a .vtt somebody placed by hand next
 * to the .mp4, and these files were uploaded to a plain document library with no
 * Teams meeting behind them. Fetching is still offered, because a stored
 * transcript makes it free, but it is secondary.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Box, Typography, Button,
  IconButton, Alert, CircularProgress, useMediaQuery,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import TuneIcon from '@mui/icons-material/Tune';
import { FALLBACK_TRACK_LANGUAGES, type TrackLanguageOption } from '@/lib/track-languages';
import { buildLanguageRows, type RecordingTrack, type TrackRow } from '@/lib/chapter-recordings';
import {
  detectTranscriptScript,
  transcriptLanguageConflict,
  type TranscriptScript,
} from '@/lib/transcript-language';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import DriveFilePickerDialog, { type DriveItem } from '../shared/DriveFilePickerDialog';
import LanguageTrackRow from './LanguageTrackRow';
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
  const { can, getFileSearchToken } = useNexusAuthContext();
  const [tracks, setTracks] = useState<RecordingTrack[]>([]);
  const [languages, setLanguages] = useState<TrackLanguageOption[]>(FALLBACK_TRACK_LANGUAGES);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);

  /** The chapter's old ungated link, until it has been moved into a recording. */
  const [legacyLink, setLegacyLink] = useState<string | null>(null);

  /** The language code whose paste field is open, or null when none is. */
  const [pasting, setPasting] = useState<string | null>(null);
  const [recordingUrl, setRecordingUrl] = useState('');

  /** The language code the file picker was opened for, or null when it is shut. */
  const [pickingFor, setPickingFor] = useState<string | null>(null);

  /**
   * A `.vtt` held back because its script does not match the row it was dropped
   * on. Held rather than rejected: the teacher is the one who knows, and a
   * bilingual class or a transliterated transcript are both real.
   */
  const [vttMismatch, setVttMismatch] = useState<{
    row: TrackRow;
    text: string;
    script: TranscriptScript;
    /** The offered language the transcript looks like, when it is free to move to. */
    moveTo: TrackLanguageOption | null;
  } | null>(null);

  /**
   * The language whose last save was refused as unplayable.
   *
   * Held so the row can offer "Attach it anyway" only after the server has
   * actually said no. Offering the override up front would turn a check that
   * exists to protect students into one more button to click past.
   */
  const [unreachable, setUnreachable] = useState<string | null>(null);

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
      if (!res.ok) {
        const err = new Error(body.error || 'Request failed') as Error & { code?: string };
        err.code = body.code;
        throw err;
      }
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
      setPasting(null);
      setPickingFor(null);
      setRecordingUrl('');
      setNotice(null);
      setUnreachable(null);
      setVttMismatch(null);
      setLegacyLink(file?.recording?.url || null);
    }
  }, [open, load, file]);

  /**
   * Open the paste field for one language.
   *
   * The chapter's old quick link is offered as the FIRST recording's URL, and
   * SAYS so. It has always been pre-filled here and never explained, so a
   * teacher saw a URL appear in an empty field with no account of where it came
   * from. A chapter with an ungated link is exactly the one a teacher is here to
   * upgrade, and it saves them going back to SharePoint for a URL Nexus already
   * holds. Only for the first: the second is the other language, a different
   * recording.
   */
  const openPaste = (code: string) => {
    setRecordingUrl(!tracks.length && legacyLink ? legacyLink : '');
    setPasting(code);
    setUnreachable(null);
    setError(null);
  };

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

  /**
   * Attach or replace one language's video.
   *
   * Two endpoints, because they are two different operations to the database. A
   * language with no track POSTs and creates one. A language that already has a
   * track PATCHes it, which keeps the track's identity and, when the video
   * actually changed, clears checkpoints that were cut from the old recording's
   * timings and could only land mid-sentence in the new one.
   */
  const saveVideo = useCallback(
    async (code: string, url: string, opts?: { force?: boolean; fileName?: string | null }) => {
      if (!file || !url.trim()) return;
      const clean = url.trim();
      const label = languages.find((l) => l.code === code)?.label || code;
      const existing = tracks.find((t) => t.language === code);
      const movedTheLink = !!legacyLink && clean === legacyLink;

      // Keyed by language when there is no track id yet, so the row being saved
      // is the only one that goes busy. A bare 'new' could not say which.
      setBusyId(existing ? existing.id : `new:${code}`);
      setError(null);
      setNotice(null);
      try {
        const base = `/api/study-materials/files/${file.id}/video-tracks`;
        // The name the picker showed. Sent because it is the only one available
        // on a forced attach, and because it beats anything derivable from a
        // list-form or share URL even when the preflight does run.
        const named = opts?.fileName ? { recording_file_name: opts.fileName } : {};
        const res = existing
          ? await authed(`${base}/${existing.id}`, {
              method: 'PATCH',
              body: JSON.stringify({
                recording_url: clean,
                ...named,
                ...(opts?.force ? { force: true } : {}),
              }),
            })
          : await authed(base, {
              method: 'POST',
              body: JSON.stringify({
                language: code,
                recording_url: clean,
                ...named,
                ...(opts?.force ? { force: true } : {}),
              }),
            });

        // Say which happened. A revived track that kept its checkpoints looks
        // identical to a new one that somehow already had some, and a teacher who
        // just re-added a language deserves to know their work came back.
        if (res.clearedCheckpoints) {
          setNotice(
            `Changed the ${label} video. Its checkpoints were cut from the old recording, so they have been cleared: upload this video's transcript to make new ones.`,
          );
        } else if (existing) {
          setNotice(`Changed the ${label} video.`);
        } else if (res.restored) {
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
        setPasting(null);
        setUnreachable(null);
        await load();
        onChanged?.();
      } catch (err) {
        const code_ = (err as { code?: string })?.code;
        // Keep the field open on an unplayable link. Closing it would throw away
        // what the teacher typed and hide the override in the same motion.
        if (code_ === 'RECORDING_UNREACHABLE') {
          setUnreachable(code);
          if (!existing) setPasting(code);
        }
        setError(err instanceof Error ? err.message : 'Could not save the recording');
      } finally {
        setBusyId(null);
      }
    },
    [authed, file, languages, tracks, legacyLink, clearLegacyLink, load, onChanged],
  );

  /** A file chosen out of SharePoint or OneDrive. Its webUrl is the recording. */
  const onPick = useCallback(
    (item: DriveItem) => {
      const code = pickingFor;
      setPickingFor(null);
      // The name travels with the URL. Without it the row would fall back to
      // reading the webUrl, and a SharePoint list link reads "DispForm.aspx".
      if (code && item.webUrl) saveVideo(code, item.webUrl, { fileName: item.name });
    },
    [pickingFor, saveVideo],
  );

  /**
   * Re-file a recording under the language it is actually in.
   *
   * The mistake this exists for: a chapter taught in Tamil gets attached to the
   * English row, and nothing downstream notices, so students are offered a Tamil
   * video labelled English with checkpoints cut from a Tamil transcript. Every
   * one of those artefacts is CORRECT, only the filing is wrong, so neither of
   * the two exits that existed was right. Remove archives the row and makes the
   * transcript and the checkpoints have to be rebuilt; Change the video clears
   * the checkpoints on purpose. This moves the label and keeps the rest,
   * including the progress of any student already part-way through it.
   */
  const changeLanguage = useCallback(
    async (row: TrackRow, code: string, opts?: { quiet?: boolean }): Promise<boolean> => {
      const track = row.track;
      if (!file || !track) return false;
      setBusyId(track.id);
      setError(null);
      setNotice(null);
      try {
        const res = await authed(
          `/api/study-materials/files/${file.id}/video-tracks/${track.id}`,
          { method: 'PATCH', body: JSON.stringify({ language: code }) },
        );
        // Quiet when a transcript upload is about to speak for both steps, so
        // the teacher gets one sentence describing what happened, not two that
        // race and leave only the second.
        if (res.movedLanguage && !opts?.quiet) {
          const kept = track.section_count
            ? `Its video, transcript and ${track.section_count} checkpoint${
                track.section_count === 1 ? '' : 's'
              } came with it`
            : 'Its video came with it';
          setNotice(
            `Moved the ${row.label} recording to ${res.movedLanguage}. ${kept}, and students who already watched it keep their progress.`,
          );
        }
        await load();
        onChanged?.();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not move the recording');
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [authed, file, load, onChanged],
  );

  /**
   * Draft and save in one press. The preview step exists so a teacher can edit
   * before publishing, and now they actually can: this saves the checkpoints but
   * leaves the track a draft, and "Edit checkpoints" opens them.
   */
  const draftCheckpoints = async (row: TrackRow, vttContent?: string, noticePrefix?: string) => {
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
        (noticePrefix ? `${noticePrefix} ` : '') +
          (track.status === 'published'
            ? `Drafted ${sections.length} checkpoints for ${row.label}. This recording was open, so finishing it now unlocks the chapter test, and anyone part-way through has these checkpoints to pass.`
            : `Drafted ${sections.length} checkpoints for ${row.label}. Open Edit to read them, then publish.`),
      );
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not draft the checkpoints');
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Upload the transcript, and look at what language it is in on the way past.
   *
   * The check earns its place because of what happens without it. A Tamil
   * transcript dropped on the English row produces Tamil checkpoints on a Tamil
   * video labelled English, and every artefact is internally correct, so nothing
   * downstream can notice. The only signal was a student opening a recording
   * marked English and hearing Tamil. It reads the SCRIPT, so it is exact and
   * free and it cannot see a Tamil class transcribed into Latin letters. See
   * lib/transcript-language.ts.
   */
  const uploadVtt = (row: TrackRow) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.vtt,text/vtt';
    input.onchange = async () => {
      const chosen = input.files?.[0];
      if (!chosen) return;
      const text = await chosen.text();

      const script = detectTranscriptScript(text);
      if (transcriptLanguageConflict(script, row.code)) {
        const target = languages.find((l) => l.code === script.likelyLanguage) || null;
        // Only offer the move when the language it looks like is actually free.
        // Offering a move the API will refuse is worse than not offering one.
        const free = target && !tracks.some((t) => t.language === target.code);
        setError(null);
        setNotice(null);
        setVttMismatch({ row, text, script, moveTo: free ? target : null });
        return;
      }

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
  const pickingLabel = languages.find((l) => l.code === pickingFor)?.label || '';

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

          {/*
            The transcript does not look like the row it was dropped on.

            A question, not a refusal. The teacher is the one who knows what was
            spoken, and both ways of being "wrong" here are real: a class can be
            taught bilingually, and a transcript can be transliterated. So the
            safe path is offered first and named, and carrying on is one press
            away rather than blocked.
          */}
          {vttMismatch && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {/* Named as SCRIPT and given its number, because that is exactly
                  what was measured. Claiming a language would be claiming more
                  than a character count can know. */}
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                This transcript is{' '}
                {vttMismatch.script.kind === 'tamil'
                  ? `${vttMismatch.script.tamilPct}% Tamil script`
                  : `${vttMismatch.script.latinPct}% Latin script`}
                , and you are filling the {vttMismatch.row.label} recording.
              </Typography>
              <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.25 }}>
                {vttMismatch.moveTo
                  ? `Its checkpoints are cut from this transcript, so they will be in the same language as it. If the class was taught in ${vttMismatch.moveTo.label}, move the recording across first.`
                  : 'Its checkpoints are cut from this transcript, so they will be in the same language as it. Carry on if that is what you meant.'}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1.25 }}>
                {vttMismatch.moveTo && (
                  <Button
                    size="small"
                    variant="contained"
                    color="warning"
                    onClick={async () => {
                      const { row, text, moveTo } = vttMismatch;
                      if (!moveTo) return;
                      /**
                       * The transcript is NOT let go of until the move lands.
                       *
                       * The move can still be refused after every check this
                       * screen can make: a language whose recording was removed
                       * earlier still holds its slot, and an archived row is
                       * invisible to listStudyVideoTracks, so `taken` reads
                       * false and the API answers 409. Clearing first would lose
                       * the file the teacher just chose and make them find it
                       * again to read an error about something else entirely.
                       */
                      const moved = await changeLanguage(row, moveTo.code, { quiet: true });
                      if (!moved) return;
                      setVttMismatch(null);
                      // The track id survives a language move, so this still
                      // reaches the same recording. Only the label has changed.
                      await draftCheckpoints(
                        { ...row, code: moveTo.code, label: moveTo.label },
                        text,
                        `Moved the ${row.label} recording to ${moveTo.label}.`,
                      );
                    }}
                    sx={actionSx}
                  >
                    Move to {vttMismatch.moveTo.label} and continue
                  </Button>
                )}
                <Button
                  size="small"
                  variant="outlined"
                  color="inherit"
                  onClick={async () => {
                    const { row, text } = vttMismatch;
                    setVttMismatch(null);
                    await draftCheckpoints(row, text);
                  }}
                  sx={actionSx}
                >
                  Use it for {vttMismatch.row.label} anyway
                </Button>
                <Button size="small" onClick={() => setVttMismatch(null)} sx={actionSx}>
                  Cancel
                </Button>
              </Box>
            </Alert>
          )}

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress size={28} />
            </Box>
          ) : (
            <>
              {/* One line. The steps inside each language now carry the order
                  that four unlabelled buttons used to need a paragraph to
                  explain. */}
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Each language takes three steps: add the video, add its transcript, publish it.
                Students choose from the languages you publish and watch inside Nexus.
              </Typography>

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
                      : 'Paste it in below as a recording in the language it was taught in. It moves across, it is not copied.'}
                  </Typography>
                </Alert>
              )}

              {/* ── One row per language, recording or not ────────────────── */}
              {rows.map((row) => (
                <LanguageTrackRow
                  key={row.code}
                  row={row}
                  busy={busyId === (row.track?.id ?? `new:${row.code}`)}
                  isPasting={pasting === row.code}
                  recordingUrl={recordingUrl}
                  onRecordingUrlChange={setRecordingUrl}
                  unreachable={unreachable === row.code}
                  onSearchVideo={() => {
                    setPasting(null);
                    setPickingFor(row.code);
                  }}
                  onOpenPaste={() => openPaste(row.code)}
                  onCancelPaste={() => {
                    setPasting(null);
                    setUnreachable(null);
                  }}
                  onSubmitVideo={(opts) => saveVideo(row.code, recordingUrl, opts)}
                  moveTargets={rows
                    .filter((other) => other.code !== row.code)
                    .map((other) => ({
                      code: other.code,
                      label: other.label,
                      taken: !!other.track,
                    }))}
                  onChangeLanguage={(code) => changeLanguage(row, code)}
                  onUploadVtt={() => uploadVtt(row)}
                  onFetchTranscript={() => draftCheckpoints(row)}
                  onEditCheckpoints={() =>
                    router.push(`/teacher/study-materials/checkpoints/${file?.id}/${row.track!.id}`)
                  }
                  onPublish={() => setStatus(row, 'published')}
                  onPublishOpen={() => setStatus(row, 'published', true)}
                  onUnpublish={() => setStatus(row, 'draft')}
                  onRemove={() => removeTrack(row)}
                />
              ))}

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

              {/* Admin only, the same gate as the feature flags. A teacher can
                  use every language on the list; deciding what is on it is a
                  different kind of decision. */}
              {can('system.settings') && (
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                  <Button
                    size="small"
                    variant="text"
                    startIcon={<TuneIcon />}
                    onClick={() => setManageOpen(true)}
                    sx={{ ...actionSx, color: 'text.secondary' }}
                  >
                    Manage languages
                  </Button>
                </Box>
              )}
            </>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose} sx={actionSx}>
            Done
          </Button>
        </DialogActions>
      </Dialog>

      {/* The answer to "where do I actually search for the recording". Scoped to
          both drives, because a teacher should not have to know or remember
          which of the two their own recording was saved to. */}
      <DriveFilePickerDialog
        open={!!pickingFor}
        onClose={() => setPickingFor(null)}
        getToken={getToken}
        // Reaches the tenant index when Files.Read.All has been consented, and
        // answers null rather than redirecting when it has not, so the picker
        // can quietly fall back to the two drives it could always search.
        getSearchToken={getFileSearchToken}
        onPick={onPick}
        kind="video"
        scope="both"
        title={pickingLabel ? `Find the ${pickingLabel} recording` : 'Find the recording'}
        subtitle="Search the Neram library and your own OneDrive for the video file, then pick it."
      />

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

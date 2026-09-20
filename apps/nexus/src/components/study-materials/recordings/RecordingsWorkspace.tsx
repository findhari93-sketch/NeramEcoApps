'use client';

/**
 * A chapter's class recordings: one tab per language, and on each tab the video,
 * its four steps and the one thing to do next.
 *
 * A PAGE, NOT A DIALOG. The dialog this replaces stacked a SharePoint picker on
 * top of itself, lost its place whenever "Edit" opened the checkpoint editor,
 * and had no URL, so the editor's Back could only go to the Study Materials root.
 * Here the language is in the URL (?lang=ta), Back and Done return to where the
 * teacher came from (?from=library, else the chapter's Setup tab), and the
 * checkpoint editor returns to this exact tab.
 *
 * VIDEOS ARE NEVER UPLOADED. A teacher finds the file in the Neram SharePoint
 * library or pastes its link, sees the real file ("Use this video?") before it is
 * saved, and can play it in place. The transcript is looked for and the
 * checkpoints created on the server as soon as a video is attached.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Box, Button, Skeleton, Snackbar, Typography, useMediaQuery, useTheme } from '@neram/ui';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import PageHeader from '@/components/PageHeader';
import DriveFilePickerDialog, { type DriveItem } from '@/components/shared/DriveFilePickerDialog';
import ManageTrackLanguagesDialog from '@/components/study-materials/ManageTrackLanguagesDialog';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useAuthSWR } from '@/lib/nexus-swr';
import { buildLanguageRows, type TrackRow } from '@/lib/chapter-recordings';
import { planRecording, type FlowActionKind, type RecordingTrackView } from '@/lib/recording-flow';
import {
  chapterSetupHref,
  checkpointsHref,
  recordingsBackHref,
  recordingsBackLabel,
  recordingsHref,
  type RecordingsFrom,
} from '@/lib/recordings-nav';
import { FALLBACK_TRACK_LANGUAGES } from '@/lib/track-languages';
import { detectTranscriptScript, transcriptLanguageConflict } from '@/lib/transcript-language';
import { MAX_TRANSCRIPT_BYTES, coverageWarning, mergeTranscriptFiles } from '@/lib/transcript-file';
import { planAiStudioParts } from '@/lib/transcript-prompt';
import { copyFailureMessage, libraryDestinationPath } from '@/lib/library-copy';
import AddVideoPanel from './AddVideoPanel';
import ConfirmVideoSheet from './ConfirmVideoSheet';
import CopyToLibrarySheet, { type CopyPhase, type CopyToLibraryFile } from './CopyToLibrarySheet';
import LanguageTabs, { panelId, tabId, type LanguageTab } from './LanguageTabs';
import PasteLinkSheet from './PasteLinkSheet';
import RecordingSteps, { type RecordingBusy } from './RecordingSteps';
import RecordingVideoCard from './RecordingVideoCard';
import ResponsiveSheet from './ResponsiveSheet';
import StickyActionBar from './StickyActionBar';
import TrackPreviewPlayer from './TrackPreviewPlayer';
import {
  authedJson,
  copyToLibraryUrl,
  RecordingsApiError,
  tracksUrl,
  trackUrl,
  type ChapterResponse,
  type CopyProgressResponse,
  type CopyToLibraryResponse,
  type PrepareResponse,
  type ResolvedLinkItem,
  type ResolveLinkResponse,
  type TracksResponse,
} from './recordings-api';

interface Props {
  fileId: string;
  lang: string | null;
  from: RecordingsFrom;
}

type VideoRef = { drive_id: string; item_id: string } | { url: string };

interface PendingVideo {
  code: string;
  ref: VideoRef;
  resolved: ResolveLinkResponse | null;
  error: string | null;
  errorCode: string | null;
}

type Confirm =
  | { kind: 'remove'; row: TrackRow }
  | { kind: 'redo'; row: TrackRow }
  | { kind: 'reset_progress'; row: TrackRow; attempts: number; vtt: string | null; redo: boolean }
  | { kind: 'script'; row: TrackRow; text: string; message: string; moveTo: { code: string; label: string } | null }
  | { kind: 'coverage'; row: TrackRow; text: string; message: string }
  | null;

/**
 * Copying one language's OneDrive video into the Neram library. One copy at a
 * time: a second is refused until the first is attached or given up.
 */
interface CopyJob {
  code: string;
  /** What to copy: the attached recording's address, or a pasted file's ids. */
  ref: VideoRef;
  file: CopyToLibraryFile;
  status: CopyPhase;
  /** The server's sealed handle on the running copy, once Graph has accepted it. */
  operation: string | null;
  startedAt: number | null;
  /** Bumped on every progress check, so the next one is scheduled even when nothing changed. */
  polls: number;
  /** The sheet is showing. A running copy carries on while it is hidden. */
  open: boolean;
}

/** A pasted OneDrive link, and what copying it would take. */
interface PasteCopy {
  code: string;
  ref: VideoRef;
  file: CopyToLibraryFile;
  message: string;
}

/** An hour-long class copies in minutes. After this the page stops asking; the copy itself carries on. */
const COPY_GIVE_UP_MS = 20 * 60 * 1000;

/** Survives a reload, so a running copy is picked up again instead of forgotten. */
const copyStorageKey = (fileId: string, code: string) => `nexus:library-copy:${fileId}:${code}`;

interface Snack {
  message: string;
  severity: 'success' | 'info' | 'error';
  undo?: () => void;
}

const errorText = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

export default function RecordingsWorkspace({ fileId, lang, from }: Props) {
  const router = useRouter();
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const { getToken, can, isTeacher, loading: authLoading, tokenReady } = useNexusAuthContext();

  const chapter = useAuthSWR<ChapterResponse>(
    tokenReady ? `/api/study-materials/files/${encodeURIComponent(fileId)}` : null,
  );
  const recordings = useAuthSWR<TracksResponse>(tokenReady ? `${tracksUrl(fileId)}?resolve=1` : null);

  const [playing, setPlaying] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, RecordingBusy>>({});
  const [snack, setSnack] = useState<Snack | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [pasteFor, setPasteFor] = useState<string | null>(null);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [pasteChecking, setPasteChecking] = useState(false);
  const [pending, setPending] = useState<PendingVideo | null>(null);
  const [pendingThumb, setPendingThumb] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [legacyCleared, setLegacyCleared] = useState(false);
  const [copyJob, setCopyJob] = useState<CopyJob | null>(null);
  const [pasteCopy, setPasteCopy] = useState<PasteCopy | null>(null);

  const languages = recordings.data?.languages?.length ? recordings.data.languages : FALLBACK_TRACK_LANGUAGES;
  const tracks = useMemo(() => recordings.data?.tracks ?? [], [recordings.data]);
  const rows = useMemo(() => buildLanguageRows(languages, tracks), [languages, tracks]);
  const folderUrl = recordings.data?.library?.folder_url ?? null;

  const viewOf = (row: TrackRow | undefined) => (row?.track ?? null) as RecordingTrackView | null;

  // The tab in the URL when it names a language on this chapter. Otherwise the
  // first recording that still needs work, so a teacher lands where they left off.
  const selectedCode = useMemo(() => {
    if (lang && rows.some((r) => r.code === lang)) return lang;
    const unfinished = rows.find((r) => r.track && !planRecording(viewOf(r), r.label).stage.startsWith('live'));
    return unfinished?.code ?? rows[0]?.code ?? 'en';
  }, [lang, rows]);

  const selectedRow = rows.find((r) => r.code === selectedCode);
  const selectedTrack = viewOf(selectedRow);
  const selectedLabel = selectedRow?.label ?? selectedCode;
  const plan = planRecording(selectedTrack, selectedLabel);
  // A copy holds its language from the moment it starts until the copy is
  // attached, derived from the copy itself so no busy flag can be left behind.
  const copyingCode =
    copyJob && ['starting', 'copying', 'attaching'].includes(copyJob.status.phase) ? copyJob.code : null;
  const selectedBusy: RecordingBusy = busy[selectedCode] ?? (copyingCode === selectedCode ? 'copying' : null);

  const thumbnail = useAuthSWR<{ url: string | null }>(
    tokenReady && selectedTrack && selectedTrack.video_source !== 'youtube'
      ? `${trackUrl(fileId, selectedTrack.id)}/thumbnail?size=large`
      : null,
    { revalidateOnFocus: false },
  );

  const call = useCallback(<T,>(url: string, init?: RequestInit) => authedJson<T>(getToken, url, init), [getToken]);
  const refresh = useCallback(async () => {
    await recordings.mutate();
  }, [recordings]);
  const setBusyFor = (code: string, value: RecordingBusy) => setBusy((prev) => ({ ...prev, [code]: value }));
  const notify = (message: string, severity: Snack['severity'] = 'success', undo?: () => void) =>
    setSnack({ message, severity, undo });

  /* ── Navigation ───────────────────────────────────────────────────────── */

  const folderId = chapter.data?.file.folder_id ?? null;
  const chapterTitle = chapter.data?.file.title ?? '';
  const backHref = recordingsBackHref({ fileId, folderId, from });

  /**
   * Switch language without a trip to the server.
   *
   * router.replace re-requests the page for the new search string, so the tab
   * only moved once that round trip came back, and on Vercel every tab press
   * would cost a function call. Next (14.1+) keeps useSearchParams in step with
   * the native history API, so this updates the URL and the tab at once.
   */
  const selectTab = (code: string) => {
    setPlaying(null);
    window.history.replaceState(null, '', recordingsHref({ fileId, lang: code, from }));
  };
  const changeTab = selectTab;

  /* ── Checkpoints ──────────────────────────────────────────────────────── */

  const prepareTrack = useCallback(
    async (
      code: string,
      label: string,
      trackId: string,
      opts: { vtt?: string | null; redo?: boolean; confirmReset?: boolean } = {},
    ) => {
      setBusyFor(code, 'preparing');
      try {
        const res = await call<PrepareResponse>(`${trackUrl(fileId, trackId)}/prepare`, {
          method: 'POST',
          body: JSON.stringify({
            ...(opts.vtt ? { vtt_content: opts.vtt } : {}),
            ...(opts.redo ? { redo: true } : {}),
            ...(opts.confirmReset ? { confirm_reset_progress: true } : {}),
          }),
        });
        if (res.status === 'prepared') {
          notify(
            `Created ${res.section_count} checkpoints for ${label}, with ${res.question_count} questions. Review them, then publish.`,
          );
        } else if (res.status === 'needs_transcript' || res.status === 'too_short') {
          notify(res.message || 'No transcript was found. Upload the .vtt file.', 'info');
        } else if (res.status === 'already_prepared') {
          notify(`${label} already has its checkpoints.`, 'info');
        }
        await refresh();
      } catch (err) {
        if (err instanceof RecordingsApiError && err.code === 'HAS_ATTEMPTS') {
          const row = rows.find((r) => r.code === code);
          if (row) {
            setConfirm({
              kind: 'reset_progress',
              row,
              attempts: Number(err.body.attempts) || 0,
              vtt: opts.vtt ?? null,
              redo: !!opts.redo,
            });
          }
        } else {
          notify(errorText(err, 'Could not create the checkpoints.'), 'error');
        }
      } finally {
        setBusyFor(code, null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [call, fileId, refresh, rows],
  );

  /** The last check before a transcript is used: is it in the right language row? */
  const applyTranscript = async (row: TrackRow, text: string) => {
    const track = row.track;
    if (!track) return;
    // A Tamil transcript on the English recording makes Tamil-script questions on
    // a video labelled English, and nothing downstream can notice. Asked, not refused.
    const script = detectTranscriptScript(text);
    if (transcriptLanguageConflict(script, row.code)) {
      const target = languages.find((l) => l.code === script.likelyLanguage) ?? null;
      const free = target && !tracks.some((t) => t.language === target.code);
      setConfirm({
        kind: 'script',
        row,
        text,
        message:
          script.kind === 'tamil'
            ? `This transcript is ${script.tamilPct}% Tamil script, and you are adding it to the ${row.label} recording.`
            : `This transcript is ${script.latinPct}% Latin script, and you are adding it to the ${row.label} recording.`,
        moveTo: free && target ? { code: target.code, label: target.label } : null,
      });
      return;
    }
    await prepareTrack(row.code, row.label, track.id, { vtt: text });
  };

  /**
   * Pick one or more transcript files and use them.
   *
   * More than one because a long class is made in Google AI Studio in parts, and
   * the teacher uploads every part together. .srt and .txt as well as .vtt,
   * because an AI Studio answer is saved from Notepad and a Whisper app writes SRT.
   * Whatever arrives is merged into canonical WEBVTT here, so the server only
   * ever sees one clean file.
   */
  const uploadTranscript = (row: TrackRow) => {
    const track = row.track as RecordingTrackView | null;
    if (!track) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.vtt,.srt,.txt,text/vtt,text/plain,application/x-subrip';
    input.onchange = async () => {
      const chosen = Array.from(input.files || []);
      if (!chosen.length) return;
      const files = await Promise.all(chosen.map(async (f) => ({ name: f.name, text: await f.text() })));

      const duration = track.recording?.duration_seconds || track.video_duration_seconds || 0;
      const parts = planAiStudioParts(duration);
      const merged = mergeTranscriptFiles(files, { durationSeconds: duration, parts });

      if (!merged.entries.length) {
        notify(
          chosen.length > 1
            ? 'None of those files has timestamps. Save the AI Studio answer exactly as it came, then upload it again.'
            : 'That file has no timestamps. Save the AI Studio answer exactly as it came, then upload it again.',
          'error',
        );
        return;
      }
      if (new Blob([merged.vtt]).size > MAX_TRANSCRIPT_BYTES) {
        notify('That transcript is too large to upload. Check you chose the transcript and not the video.', 'error');
        return;
      }

      const warning = coverageWarning(merged, duration, parts.length);
      if (warning) {
        setConfirm({ kind: 'coverage', row, text: merged.vtt, message: warning });
        return;
      }
      await applyTranscript(row, merged.vtt);
    };
    input.click();
  };

  /* ── The video ────────────────────────────────────────────────────────── */

  const loadPendingThumb = (res: ResolveLinkResponse) => {
    setPendingThumb(null);
    call<{ url: string | null }>(
      `/api/sharepoint/thumbnail?drive=${encodeURIComponent(res.item.drive_id)}&item=${encodeURIComponent(res.item.item_id)}&size=medium`,
    )
      .then((r) => setPendingThumb(r.url))
      .catch(() => setPendingThumb(null));
  };

  const resolveLink = (code: string, ref: VideoRef) =>
    call<ResolveLinkResponse>(`${tracksUrl(fileId)}/resolve-link`, {
      method: 'POST',
      body: JSON.stringify({ ...ref, language: code }),
    });

  const onPick = async (item: DriveItem) => {
    const code = pickerFor;
    if (!code) return;
    const ref: VideoRef =
      item.driveId && item.id ? { drive_id: item.driveId, item_id: item.id } : { url: item.webUrl };
    setPending({ code, ref, resolved: null, error: null, errorCode: null });
    try {
      const res = await resolveLink(code, ref);
      setPending({ code, ref, resolved: res, error: null, errorCode: null });
      loadPendingThumb(res);
    } catch (err) {
      const e = err instanceof RecordingsApiError ? err : null;
      setPending({ code, ref, resolved: null, error: errorText(err, 'Could not check that video.'), errorCode: e?.code ?? null });
    }
  };

  const onPaste = async (url: string) => {
    const code = pasteFor;
    if (!code) return;
    const ref: VideoRef = { url };
    setPasteChecking(true);
    setPasteError(null);
    setPasteCopy(null);
    try {
      const res = await resolveLink(code, ref);
      setPasteFor(null);
      setPending({ code, ref, resolved: res, error: null, errorCode: null });
      loadPendingThumb(res);
    } catch (err) {
      const e = err instanceof RecordingsApiError ? err : null;
      const inOneDrive = e?.code === 'RECORDING_IN_ONEDRIVE' ? (e.body.item as ResolvedLinkItem | undefined) : undefined;
      if (e?.code === 'RECORDING_UNREACHABLE') {
        // SharePoint did not answer: the only case that can be attached anyway.
        setPasteFor(null);
        setPending({ code, ref, resolved: null, error: e.message, errorCode: e.code });
      } else if (e && inOneDrive?.drive_id && inOneDrive.item_id) {
        // The right video in the wrong place: offer the copy rather than a refusal.
        setPasteCopy({
          code,
          ref: { drive_id: inOneDrive.drive_id, item_id: inOneDrive.item_id },
          file: { name: inOneDrive.name, sizeBytes: inOneDrive.size_bytes, durationSeconds: inOneDrive.duration_seconds },
          message: e.message,
        });
      } else {
        setPasteError(errorText(err, 'Could not check that link.'));
      }
    } finally {
      setPasteChecking(false);
    }
  };

  /**
   * Save a video onto a language. The choice is passed in rather than read from
   * `pending`, so a finished copy can be attached the moment it lands, with no
   * state update to wait for.
   */
  const attachVideo = async (
    choice: PendingVideo,
    opts: { keepCheckpoints: boolean; force?: boolean; copied?: boolean },
  ) => {
    const row = rows.find((r) => r.code === choice.code);
    if (!row) return;

    const refBody =
      'url' in choice.ref ? { recording_url: choice.ref.url } : { drive_id: choice.ref.drive_id, item_id: choice.ref.item_id };

    setBusyFor(row.code, 'saving');
    try {
      const res = row.track
        ? await call<{ track: { id: string }; clearedCheckpoints?: boolean }>(trackUrl(fileId, row.track.id), {
            method: 'PATCH',
            body: JSON.stringify({ ...refBody, keep_checkpoints: opts.keepCheckpoints, ...(opts.force ? { force: true } : {}) }),
          })
        : await call<{ track: { id: string }; restored?: boolean; checkpointsCleared?: boolean }>(tracksUrl(fileId), {
            method: 'POST',
            body: JSON.stringify({ language: row.code, ...refBody, ...(opts.force ? { force: true } : {}) }),
          });

      if (!opts.copied) setPending(null);
      setPlaying(null);
      const trackId = row.track?.id ?? res.track.id;
      const cleared = 'clearedCheckpoints' in res && res.clearedCheckpoints;
      const restoredWithCheckpoints = 'restored' in res && res.restored && !res.checkpointsCleared;

      if (opts.copied) {
        notify(
          !row.track
            ? `Copied the ${row.label} video into the Neram library and added it.`
            : cleared
              ? `Copied the ${row.label} video into the Neram library. The copy did not match, so its checkpoints were removed.`
              : `Copied the ${row.label} video into the Neram library. Its checkpoints and student progress were kept.`,
        );
      } else if (row.track) {
        notify(
          cleared
            ? `Replaced the ${row.label} video. The checkpoints made for the old video were removed.`
            : `Replaced the ${row.label} video. Its checkpoints were kept.`,
        );
      } else {
        notify(restoredWithCheckpoints ? `Restored the ${row.label} recording, checkpoints and all.` : `Added the ${row.label} video.`);
      }

      await refresh();
      void thumbnail.mutate();

      // A new video, or one whose checkpoints were cleared: find its transcript
      // and create the checkpoints now, without waiting to be asked.
      if (cleared || (!row.track && !restoredWithCheckpoints)) {
        void prepareTrack(row.code, row.label, trackId);
      }
    } catch (err) {
      // The copy says what went wrong in its own sheet.
      if (opts.copied) throw err;
      const e = err instanceof RecordingsApiError ? err : null;
      setPending({ ...choice, error: errorText(err, 'Could not save the video.'), errorCode: e?.code ?? null });
    } finally {
      setBusyFor(row.code, null);
    }
  };

  /* ── Copying a OneDrive video into the library ────────────────────────── */

  const rememberCopy = (job: CopyJob) => {
    try {
      sessionStorage.setItem(
        copyStorageKey(fileId, job.code),
        JSON.stringify({
          ref: job.ref,
          file: job.file,
          operation: job.operation,
          startedAt: job.startedAt,
        }),
      );
    } catch {
      // No storage (a private window): a reload loses the progress, and Copy again recovers the file.
    }
  };

  const forgetCopy = (code: string) => {
    try {
      sessionStorage.removeItem(copyStorageKey(fileId, code));
    } catch {
      /* as above */
    }
  };

  const failCopy = (operation: string | null, message: string) =>
    setCopyJob((prev) =>
      prev && prev.operation === operation ? { ...prev, open: true, status: { phase: 'failed', message } } : prev,
    );

  const openCopy = (job: Pick<CopyJob, 'code' | 'ref' | 'file'>) => {
    if (copyingCode && copyJob?.code === job.code) {
      setCopyJob({ ...copyJob, open: true });
      return;
    }
    if (copyingCode) {
      notify('Another video is being copied. Wait for it to finish, then copy this one.', 'info');
      return;
    }
    setCopyJob({
      ...job,
      status: { phase: 'confirm' },
      operation: null,
      startedAt: null,
      polls: 0,
      open: true,
    });
  };

  const openCopyForTrack = (row: TrackRow) => {
    const track = viewOf(row);
    if (!track?.recording_url) return;
    openCopy({
      code: row.code,
      ref: { url: track.recording_url },
      file: {
        name: track.recording?.name || track.recording_file_name || 'This video',
        sizeBytes: track.recording?.size_bytes ?? null,
        durationSeconds: track.recording?.duration_seconds ?? track.video_duration_seconds ?? null,
      },
    });
  };

  /** The copy is in the library: attach it, keeping what was made from the original. */
  const attachCopy = async (job: CopyJob, item: ResolvedLinkItem) => {
    forgetCopy(job.code);
    setCopyJob((prev) => (prev && prev.code === job.code ? { ...prev, status: { phase: 'attaching' } } : prev));
    try {
      await attachVideo(
        { code: job.code, ref: { drive_id: item.drive_id, item_id: item.item_id }, resolved: null, error: null, errorCode: null },
        { keepCheckpoints: true, copied: true },
      );
      setCopyJob(null);
    } catch (err) {
      setCopyJob((prev) =>
        prev && prev.code === job.code
          ? {
              ...prev,
              open: true,
              status: {
                phase: 'failed',
                message: errorText(err, 'The copy finished, but it could not be attached. Press Try again.'),
              },
            }
          : prev,
      );
    }
  };

  const startCopy = async () => {
    if (!copyJob) return;
    const starting: CopyJob = {
      ...copyJob,
      status: { phase: 'starting' },
      operation: null,
      startedAt: null,
      polls: 0,
      open: true,
    };
    setCopyJob(starting);
    const refBody =
      'url' in starting.ref ? { url: starting.ref.url } : { drive_id: starting.ref.drive_id, item_id: starting.ref.item_id };
    try {
      const res = await call<CopyToLibraryResponse>(copyToLibraryUrl(fileId), {
        method: 'POST',
        body: JSON.stringify(refBody),
      });
      if (res.status === 'done') {
        await attachCopy(starting, res.item);
        return;
      }
      const running: CopyJob = {
        ...starting,
        status: { phase: 'copying', percent: null },
        operation: res.operation,
        startedAt: Date.now(),
      };
      rememberCopy(running);
      setCopyJob(running);
    } catch (err) {
      failCopy(null, errorText(err, copyFailureMessage(null)));
    }
  };

  const closeCopy = () => {
    if (!copyJob) return;
    const { phase } = copyJob.status;
    // A running copy is only hidden; the card shows it and reopens this.
    if (phase === 'copying') setCopyJob({ ...copyJob, open: false });
    else if (phase === 'confirm' || phase === 'failed') setCopyJob(null);
  };

  const copyOperation = copyJob?.operation ?? null;
  const copyPolls = copyJob?.polls ?? 0;
  const copyRunning = copyJob?.status.phase === 'copying';

  /**
   * Ask how the copy is getting on, sooner at first and less often as it runs,
   * and only while one is running, so the page costs a few calls per copy.
   */
  useEffect(() => {
    if (!copyJob || !copyRunning || !copyOperation) return;
    const job = copyJob;
    const elapsed = Date.now() - (job.startedAt ?? Date.now());
    if (elapsed > COPY_GIVE_UP_MS) {
      forgetCopy(job.code);
      failCopy(job.operation, copyFailureMessage('COPY_TIMEOUT'));
      return;
    }

    let cancelled = false;
    const delay = elapsed < 30_000 ? 3_000 : elapsed < 120_000 ? 5_000 : 8_000;
    const timer = window.setTimeout(async () => {
      try {
        const res = await call<CopyProgressResponse>(
          `${copyToLibraryUrl(fileId)}?operation=${encodeURIComponent(job.operation!)}`,
        );
        if (cancelled) return;
        if (res.status === 'done') {
          await attachCopy(job, res.item);
        } else if (res.status === 'failed') {
          forgetCopy(job.code);
          failCopy(job.operation, res.error);
        } else {
          setCopyJob((prev) =>
            prev && prev.operation === job.operation
              ? { ...prev, polls: prev.polls + 1, status: { phase: 'copying', percent: res.percent } }
              : prev,
          );
        }
      } catch (err) {
        if (cancelled) return;
        // Refused outright (not a copy's address, or signed out): asking again will not help.
        if (err instanceof RecordingsApiError && err.status >= 400 && err.status < 500) {
          forgetCopy(job.code);
          failCopy(job.operation, err.message);
          return;
        }
        // A check that did not get through is not a failed copy. Ask again.
        setCopyJob((prev) => (prev && prev.operation === job.operation ? { ...prev, polls: prev.polls + 1 } : prev));
      }
    }, delay);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copyOperation, copyPolls, copyRunning]);

  // A copy started before a reload carries on in SharePoint: pick its progress up again.
  useEffect(() => {
    if (!recordings.data || copyJob) return;
    for (const row of rows) {
      let saved: Partial<Pick<CopyJob, 'ref' | 'file' | 'operation' | 'startedAt'>> | null = null;
      try {
        saved = JSON.parse(sessionStorage.getItem(copyStorageKey(fileId, row.code)) || 'null');
      } catch {
        saved = null;
      }
      if (saved?.operation && saved.ref && saved.file) {
        setCopyJob({
          code: row.code,
          ref: saved.ref,
          file: saved.file,
          status: { phase: 'copying', percent: null },
          operation: saved.operation,
          startedAt: Number(saved.startedAt) || Date.now(),
          polls: 0,
          open: false,
        });
        return;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordings.data]);

  /* ── Publishing, moving, removing ─────────────────────────────────────── */

  const setStatus = async (row: TrackRow, status: 'published' | 'draft', allowOpen: boolean, quiet = false) => {
    const track = row.track;
    if (!track) return;
    setBusyFor(row.code, 'publishing');
    try {
      await call(trackUrl(fileId, track.id), {
        method: 'PATCH',
        body: JSON.stringify(allowOpen ? { status, allow_open: true } : { status }),
      });
      await refresh();
      if (!quiet) {
        notify(
          status === 'published'
            ? `${row.label} is live. Students can watch it now.`
            : `${row.label} is unpublished. Students no longer see it.`,
          'success',
          () => void setStatus(row, status === 'published' ? 'draft' : 'published', allowOpen || !track.section_count, true),
        );
      }
    } catch (err) {
      notify(errorText(err, 'Could not update the recording.'), 'error');
    } finally {
      setBusyFor(row.code, null);
    }
  };

  const moveLanguage = async (row: TrackRow, code: string) => {
    const track = row.track;
    if (!track) return;
    setBusyFor(row.code, 'saving');
    try {
      const res = await call<{ movedLanguage: string | null }>(trackUrl(fileId, track.id), {
        method: 'PATCH',
        body: JSON.stringify({ language: code }),
      });
      await refresh();
      notify(`Moved the recording to ${res.movedLanguage || code}. Its transcript and checkpoints came with it.`);
      router.replace(recordingsHref({ fileId, lang: code, from }), { scroll: false });
    } catch (err) {
      notify(errorText(err, 'Could not move the recording.'), 'error');
    } finally {
      setBusyFor(row.code, null);
    }
  };

  const removeRecording = async (row: TrackRow) => {
    const track = row.track;
    if (!track) return;
    setConfirm(null);
    setBusyFor(row.code, 'saving');
    try {
      await call(trackUrl(fileId, track.id), { method: 'DELETE' });
      setPlaying(null);
      await refresh();
      notify(`Removed the ${row.label} recording. Students no longer see it.`);
    } catch (err) {
      notify(errorText(err, 'Could not remove the recording.'), 'error');
    } finally {
      setBusyFor(row.code, null);
    }
  };

  const clearLegacyLink = async () => {
    try {
      await call(`/api/study-materials/files/${encodeURIComponent(fileId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ recording: null }),
      });
      setLegacyCleared(true);
      notify('Removed the old video link.');
    } catch (err) {
      notify(errorText(err, 'Could not remove the old link.'), 'error');
    }
  };

  const handleAction = (row: TrackRow, kind: FlowActionKind) => {
    const track = row.track;
    switch (kind) {
      case 'find_video':
      case 'replace_video':
        setPickerFor(row.code);
        return;
      case 'copy_to_library':
        openCopyForTrack(row);
        return;
      case 'paste_link':
        setPasteError(null);
        setPasteFor(row.code);
        return;
      case 'upload_transcript':
        uploadTranscript(row);
        return;
      case 'create_checkpoints':
        if (track) void prepareTrack(row.code, row.label, track.id);
        return;
      case 'publish':
        void setStatus(row, 'published', false);
        return;
      case 'publish_open':
        void setStatus(row, 'published', true);
        return;
      case 'unpublish':
        void setStatus(row, 'draft', false);
        return;
      case 'review_checkpoints':
        if (track) router.push(checkpointsHref({ fileId, trackId: track.id, from }));
        return;
    }
  };

  /* ── Render ───────────────────────────────────────────────────────────── */

  if (!authLoading && !isTeacher) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">This page is for teachers only.</Alert>
      </Box>
    );
  }

  const tabs: LanguageTab[] = rows.map((row) => {
    const rowPlan = planRecording(viewOf(row), row.label);
    return { code: row.code, label: row.label, status: rowPlan.tabStatus, stage: rowPlan.stage };
  });
  const live = rows.filter((row) => row.state.live).map((row) => row.label);
  const legacyLink = !legacyCleared ? chapter.data?.file.recording?.url ?? null : null;

  const breadcrumbs = desktop
    ? from === 'library'
      ? [{ label: 'Study Materials', href: backHref }]
      : [
          { label: 'Study Materials', href: folderId ? `/teacher/study-materials?folder=${encodeURIComponent(folderId)}` : '/teacher/study-materials' },
          { label: chapterTitle || 'Chapter', href: chapterSetupHref(fileId) },
        ]
    : [{ label: from === 'library' ? 'Study Materials' : chapterTitle || 'Chapter', href: backHref }];

  const moveTargets = rows
    .filter((row) => row.code !== selectedCode)
    .map((row) => ({ code: row.code, label: row.label, taken: !!row.track }));

  const pickerLabel = rows.find((r) => r.code === pickerFor)?.label ?? '';
  const pasteLabel = rows.find((r) => r.code === pasteFor)?.label ?? '';
  const pendingLabel = rows.find((r) => r.code === pending?.code)?.label ?? '';

  return (
    <Box sx={{ maxWidth: 1180, mx: 'auto', pb: { xs: 1, md: 4 } }}>
      <PageHeader
        title="Class recordings"
        subtitle={chapterTitle || undefined}
        backHref={backHref}
        breadcrumbs={breadcrumbs}
        action={
          can('system.settings') ? (
            <Button
              startIcon={<TuneRoundedIcon />}
              onClick={() => setManageOpen(true)}
              sx={{ minHeight: 44, textTransform: 'none' }}
            >
              Languages
            </Button>
          ) : undefined
        }
      />

      {legacyLink && (
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" onClick={clearLegacyLink} sx={{ minHeight: 44, textTransform: 'none' }}>
              Remove it
            </Button>
          }
        >
          This chapter still has an old video link that no student can see. Add the video as a recording below, then
          remove the old link.
        </Alert>
      )}

      {recordings.error && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" onClick={() => void recordings.mutate()} sx={{ minHeight: 44, textTransform: 'none' }}>
              Try again
            </Button>
          }
        >
          Could not load the recordings. {recordings.error.message}
        </Alert>
      )}

      {!recordings.data ? (
        <Box aria-busy="true">
          <Skeleton variant="rounded" height={64} sx={{ mb: 2, borderRadius: 2 }} />
          <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: '7fr 5fr' } }}>
            <Skeleton variant="rounded" sx={{ aspectRatio: '16 / 9', height: 'auto', borderRadius: 2 }} />
            <Skeleton variant="rounded" height={320} sx={{ borderRadius: 3 }} />
          </Box>
        </Box>
      ) : (
        <>
          <LanguageTabs tabs={tabs} value={selectedCode} onChange={changeTab} />

          <Typography
            variant="body2"
            aria-live="polite"
            sx={{ mt: 1.25, mb: 2.5, fontWeight: 600, color: live.length ? 'success.dark' : 'text.secondary' }}
          >
            {live.length
              ? `Students see: ${live.join(', ')}`
              : 'Students see nothing yet. Publish a recording to show it to them.'}
          </Typography>

          <Box role="tabpanel" id={panelId(selectedCode)} aria-labelledby={tabId(selectedCode)}>
            {!selectedRow?.track || !selectedTrack ? (
              <AddVideoPanel
                label={selectedLabel}
                busy={!!selectedBusy}
                folderUrl={folderUrl}
                onFind={() => setPickerFor(selectedCode)}
                onPaste={() => {
                  setPasteError(null);
                  setPasteFor(selectedCode);
                }}
              />
            ) : (
              <>
                <Box
                  sx={{
                    display: 'grid',
                    gap: { xs: 2.5, md: 3 },
                    gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 7fr) minmax(0, 5fr)' },
                    alignItems: 'start',
                  }}
                >
                  <RecordingVideoCard
                    label={selectedLabel}
                    track={selectedTrack}
                    thumbnailUrl={thumbnail.data?.url ?? null}
                    player={
                      playing === selectedTrack.id ? (
                        <TrackPreviewPlayer
                          fileId={fileId}
                          trackId={selectedTrack.id}
                          title={selectedTrack.recording?.name || selectedTrack.title}
                          getToken={getToken}
                        />
                      ) : null
                    }
                    onPlay={() => setPlaying(selectedTrack.id)}
                    onReplace={() => setPickerFor(selectedCode)}
                    moveTargets={moveTargets}
                    onMove={(code) => void moveLanguage(selectedRow, code)}
                    onRemove={() => setConfirm({ kind: 'remove', row: selectedRow })}
                    busy={!!selectedBusy}
                    onCopyToLibrary={() => openCopyForTrack(selectedRow)}
                    copying={
                      copyJob?.code === selectedCode && copyJob.status.phase === 'copying'
                        ? { percent: copyJob.status.percent }
                        : null
                    }
                  />
                  <RecordingSteps
                    label={selectedLabel}
                    track={selectedTrack}
                    plan={plan}
                    busy={selectedBusy}
                    onAction={(kind) => handleAction(selectedRow, kind)}
                    onLookAgain={() => void prepareTrack(selectedCode, selectedLabel, selectedTrack.id)}
                    onReplaceTranscript={() => uploadTranscript(selectedRow)}
                    onRedoCheckpoints={() => setConfirm({ kind: 'redo', row: selectedRow })}
                    primaryInStickyBar
                  />
                </Box>

                {plan.primary && (
                  <StickyActionBar>
                    <Button
                      variant="contained"
                      onClick={() => plan.primary && handleAction(selectedRow, plan.primary.kind)}
                      // A running copy stays pressable here too, to show its progress again.
                      disabled={!!selectedBusy && !(selectedBusy === 'copying' && copyRunning)}
                      sx={{ textTransform: 'none', fontWeight: 700 }}
                    >
                      {selectedBusy === 'preparing'
                        ? 'Creating checkpoints...'
                        : selectedBusy === 'copying'
                          ? copyJob?.status.phase === 'copying' && copyJob.status.percent != null
                            ? `Copying... ${copyJob.status.percent}%`
                            : 'Copying...'
                          : plan.primary.label}
                    </Button>
                  </StickyActionBar>
                )}
              </>
            )}
          </Box>

          <Box sx={{ display: 'flex', justifyContent: { xs: 'stretch', sm: 'flex-end' }, mt: 3 }}>
            <Button
              variant="outlined"
              onClick={() => router.push(backHref)}
              sx={{ minHeight: 48, px: 4, textTransform: 'none', fontWeight: 600, width: { xs: '100%', sm: 'auto' } }}
            >
              Done
            </Button>
          </Box>
        </>
      )}

      {/* ── Finding the video ───────────────────────────────────────────── */}
      <DriveFilePickerDialog
        open={!!pickerFor}
        onClose={() => setPickerFor(null)}
        getToken={getToken}
        onPick={(item) => void onPick(item)}
        kind="video"
        scope="site"
        title={pickerLabel ? `Choose the ${pickerLabel} class recording` : 'Choose the class recording'}
        subtitle="Search the Neram SharePoint library. Videos are not uploaded to Nexus, so put the recording in the library first, then pick it here."
        onPasteLink={() => {
          const code = pickerFor;
          if (code) {
            setPasteError(null);
            setPasteFor(code);
          }
        }}
        openFolderUrl={folderUrl}
        openFolderLabel="Open the Class videos folder"
      />

      <PasteLinkSheet
        open={!!pasteFor}
        label={pasteLabel}
        busy={pasteChecking}
        error={pasteError}
        onClose={() => {
          setPasteFor(null);
          setPasteCopy(null);
        }}
        onSubmit={(url) => void onPaste(url)}
        copyOffer={pasteCopy && pasteCopy.code === pasteFor ? { message: pasteCopy.message } : null}
        onCopy={() => {
          if (!pasteCopy) return;
          const offer = pasteCopy;
          setPasteFor(null);
          setPasteCopy(null);
          openCopy({ code: offer.code, ref: offer.ref, file: offer.file });
        }}
        onEdit={() => {
          setPasteCopy(null);
          setPasteError(null);
        }}
      />

      <ConfirmVideoSheet
        open={!!pending}
        label={pendingLabel}
        busy={!!pending && busy[pending.code] === 'saving'}
        checking={!!pending && !pending.resolved && !pending.error}
        resolved={pending?.resolved ?? null}
        thumbnailUrl={pendingThumb}
        error={pending?.error ?? null}
        errorCode={pending?.errorCode ?? null}
        onClose={() => setPending(null)}
        onChooseAnother={() => {
          const code = pending?.code ?? null;
          setPending(null);
          if (code) setPickerFor(code);
        }}
        onConfirm={(opts) => {
          if (pending) void attachVideo(pending, opts);
        }}
        onForce={
          pending && 'url' in pending.ref
            ? () => void attachVideo(pending, { keepCheckpoints: false, force: true })
            : undefined
        }
      />

      {/* ── Copying a OneDrive video into the library ──────────────────── */}
      {copyJob && (
        <CopyToLibrarySheet
          open={copyJob.open}
          label={rows.find((r) => r.code === copyJob.code)?.label ?? copyJob.code}
          file={copyJob.file}
          destination={libraryDestinationPath({
            folderUrl,
            rootPath: recordings.data?.library?.folder_path,
            chapterTitle,
          })}
          keepsCheckpoints={(rows.find((r) => r.code === copyJob.code)?.track?.section_count ?? 0) > 0}
          status={copyJob.status}
          onClose={closeCopy}
          onCopy={() => void startCopy()}
          onChooseAnother={() => {
            const code = copyJob.code;
            forgetCopy(code);
            setCopyJob(null);
            setPickerFor(code);
          }}
        />
      )}

      {/* ── Questions ───────────────────────────────────────────────────── */}
      <ResponsiveSheet
        open={confirm?.kind === 'remove'}
        onClose={() => setConfirm(null)}
        title={confirm?.kind === 'remove' ? `Remove the ${confirm.row.label} recording?` : ''}
        description="Students stop seeing it now. If you add a video to this language again later, its checkpoints come back."
        actions={
          <>
            <Button onClick={() => setConfirm(null)} sx={{ textTransform: 'none' }}>
              Cancel
            </Button>
            <Button
              variant="contained"
              color="error"
              onClick={() => confirm?.kind === 'remove' && void removeRecording(confirm.row)}
              sx={{ textTransform: 'none', fontWeight: 700 }}
            >
              Remove recording
            </Button>
          </>
        }
      />

      <ResponsiveSheet
        open={confirm?.kind === 'redo'}
        onClose={() => setConfirm(null)}
        title={confirm?.kind === 'redo' ? `Redo the ${confirm.row.label} checkpoints?` : ''}
        description="Every checkpoint and question is replaced with new ones written from the transcript. Changes you made to them are lost."
        actions={
          <>
            <Button onClick={() => setConfirm(null)} sx={{ textTransform: 'none' }}>
              Keep them
            </Button>
            <Button
              variant="contained"
              onClick={() => {
                if (confirm?.kind !== 'redo' || !confirm.row.track) return;
                const { row } = confirm;
                setConfirm(null);
                void prepareTrack(row.code, row.label, row.track!.id, { redo: true });
              }}
              sx={{ textTransform: 'none', fontWeight: 700 }}
            >
              Redo checkpoints
            </Button>
          </>
        }
      />

      <ResponsiveSheet
        open={confirm?.kind === 'reset_progress'}
        onClose={() => setConfirm(null)}
        title="Students have already started these checkpoints"
        description={
          confirm?.kind === 'reset_progress'
            ? `There ${confirm.attempts === 1 ? 'is 1 attempt' : `are ${confirm.attempts} attempts`} on the current checkpoints. Replacing them resets that progress, and those students will have to pass the new ones.`
            : ''
        }
        actions={
          <>
            <Button onClick={() => setConfirm(null)} sx={{ textTransform: 'none' }}>
              Keep current checkpoints
            </Button>
            <Button
              variant="contained"
              color="error"
              onClick={() => {
                if (confirm?.kind !== 'reset_progress' || !confirm.row.track) return;
                const { row, vtt, redo } = confirm;
                setConfirm(null);
                void prepareTrack(row.code, row.label, row.track!.id, { vtt, redo, confirmReset: true });
              }}
              sx={{ textTransform: 'none', fontWeight: 700 }}
            >
              Replace anyway
            </Button>
          </>
        }
      />

      <ResponsiveSheet
        open={confirm?.kind === 'script'}
        onClose={() => setConfirm(null)}
        title="Is this the right transcript?"
        description={
          confirm?.kind === 'script'
            ? `${confirm.message} Check it belongs to this recording.`
            : ''
        }
        actions={
          confirm?.kind === 'script' ? (
            <>
              <Button onClick={() => setConfirm(null)} sx={{ textTransform: 'none' }}>
                Cancel
              </Button>
              {confirm.moveTo && (
                <Button
                  variant="outlined"
                  onClick={async () => {
                    const { row, text, moveTo } = confirm;
                    if (!moveTo || !row.track) return;
                    setConfirm(null);
                    await moveLanguage(row, moveTo.code);
                    void prepareTrack(moveTo.code, moveTo.label, row.track.id, { vtt: text });
                  }}
                  sx={{ textTransform: 'none' }}
                >
                  Move to {confirm.moveTo.label} and continue
                </Button>
              )}
              <Button
                variant="contained"
                onClick={() => {
                  const { row, text } = confirm;
                  setConfirm(null);
                  if (row.track) void prepareTrack(row.code, row.label, row.track.id, { vtt: text });
                }}
                sx={{ textTransform: 'none', fontWeight: 700 }}
              >
                Use it for {confirm.row.label}
              </Button>
            </>
          ) : undefined
        }
      />

      <ResponsiveSheet
        open={confirm?.kind === 'coverage'}
        onClose={() => setConfirm(null)}
        title="Is this the whole transcript?"
        description={confirm?.kind === 'coverage' ? confirm.message : ''}
        actions={
          confirm?.kind === 'coverage' ? (
            <>
              <Button
                onClick={() => {
                  const { row } = confirm;
                  setConfirm(null);
                  uploadTranscript(row);
                }}
                sx={{ textTransform: 'none', minHeight: 44 }}
              >
                Choose files again
              </Button>
              <Button
                variant="contained"
                onClick={() => {
                  const { row, text } = confirm;
                  setConfirm(null);
                  void applyTranscript(row, text);
                }}
                sx={{ textTransform: 'none', fontWeight: 700, minHeight: 44 }}
              >
                Use it anyway
              </Button>
            </>
          ) : undefined
        }
      />

      <ManageTrackLanguagesDialog
        open={manageOpen}
        getToken={getToken}
        onClose={() => setManageOpen(false)}
        onSaved={() => {
          void refresh();
          notify('Language list saved.');
        }}
      />

      <Snackbar
        open={!!snack}
        autoHideDuration={snack?.undo ? 8000 : 5000}
        onClose={(_, reason) => {
          if (reason !== 'clickaway') setSnack(null);
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ bottom: { xs: 148, md: 24 } }}
      >
        <Alert
          severity={snack?.severity ?? 'info'}
          variant="filled"
          onClose={() => setSnack(null)}
          action={
            snack?.undo ? (
              <Button
                color="inherit"
                size="small"
                onClick={() => {
                  const undo = snack.undo;
                  setSnack(null);
                  undo?.();
                }}
                sx={{ minHeight: 40, textTransform: 'none', fontWeight: 700 }}
              >
                Undo
              </Button>
            ) : undefined
          }
          sx={{ width: '100%', alignItems: 'center' }}
        >
          {snack?.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

'use client';

/**
 * Read and edit the checkpoints of one language's recording, with the video beside them.
 *
 * WHAT CHANGED, and why. The page this replaces:
 *   - sent Back to the Study Materials root, dropping the teacher out of the
 *     chapter and the language; Back now returns to that recording's tab;
 *   - threw edits away on any navigation; unsaved work is now guarded and backed
 *     up, and a save updates the page in place instead of reloading it;
 *   - asked for raw seconds with no video to take them from; the player is here,
 *     times read as 15:24, and "Now" takes the time the video is at;
 *   - said "Blank = all" for a pass mark the server fills from a percentage; it
 *     now shows the real number;
 *   - let a checkpoint with no questions be saved, which no student could ever
 *     pass; that is refused, with every problem named where it is.
 *
 * On a laptop the player, the timeline and the list sit on the left and stay in
 * view; the open checkpoint is on the right. On a phone they stack, and the save
 * bar stays above the bottom navigation.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Skeleton,
  Snackbar,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import PublishRoundedIcon from '@mui/icons-material/PublishRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import PageHeader from '@/components/PageHeader';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useLeaveGuard } from '@/hooks/useLeaveGuard';
import { draftReducer, initialDraft, isDirty, toSavePayload } from '@/lib/checkpoint-draft';
import { hasBlockingIssues, validateCheckpoints } from '@/lib/checkpoint-validation';
import { recordingsHref, type RecordingsFrom } from '@/lib/recordings-nav';
import type { GateInfo } from '@/lib/pass-mark';
import type { EditableQuestion } from '@/lib/recap-sections';
import type { VideoTransport } from '@/components/video/types';
import TrackPreviewPlayer from '@/components/study-materials/recordings/TrackPreviewPlayer';
import ResponsiveSheet from '@/components/study-materials/recordings/ResponsiveSheet';
import { authedJson, trackUrl } from '@/components/study-materials/recordings/recordings-api';
import CheckpointTimeline from './CheckpointTimeline';
import CheckpointOutline from './CheckpointOutline';
import CheckpointDetail from './CheckpointDetail';

interface TrackHead {
  id: string;
  title: string;
  language: string;
  language_label: string | null;
  status: string;
  readiness: string;
  recording_url: string | null;
  recording_name: string | null;
  video_source: string;
  video_duration_seconds: number | null;
  gate: GateInfo;
}

interface SectionsResponse {
  track: TrackHead;
  sections: unknown[];
}

interface Snack {
  message: string;
  severity: 'success' | 'info' | 'error';
  undo?: () => void;
}

const backupKey = (trackId: string) => `nexus:checkpoints:${trackId}`;
const errorText = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

export default function CheckpointWorkbench({
  fileId,
  trackId,
  from,
}: {
  fileId: string;
  trackId: string;
  from: RecordingsFrom;
}) {
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const { getToken, isTeacher, loading: authLoading, tokenReady } = useNexusAuthContext();

  const [draft, dispatch] = useReducer(draftReducer, null, () => initialDraft());
  const [track, setTrack] = useState<TrackHead | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'publish' | null>(null);
  const [snack, setSnack] = useState<Snack | null>(null);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const [backup, setBackup] = useState<unknown[] | null>(null);
  const [removeKey, setRemoveKey] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const transportRef = useRef<VideoTransport | null>(null);
  const playerRef = useRef<HTMLDivElement | null>(null);

  const call = useCallback(<T,>(url: string, init?: RequestInit) => authedJson<T>(getToken, url, init), [getToken]);
  const sectionsUrl = `${trackUrl(fileId, trackId)}/sections`;

  /* ── Load ─────────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!tokenReady) return;
    let cancelled = false;
    call<SectionsResponse>(sectionsUrl)
      .then((data) => {
        if (cancelled) return;
        setTrack(data.track);
        setDuration(data.track.video_duration_seconds ?? null);
        dispatch({ type: 'load', sections: data.sections || [] });

        // Unsaved work from an earlier visit, offered rather than applied.
        try {
          const raw = sessionStorage.getItem(backupKey(trackId));
          if (raw) {
            const parsed = JSON.parse(raw) as { sections?: unknown[] };
            const server = JSON.stringify(
              toSavePayload(draftReducer(initialDraft(), { type: 'load', sections: data.sections || [] })),
            );
            if (Array.isArray(parsed.sections) && JSON.stringify(parsed.sections) !== server) {
              setBackup(parsed.sections);
            } else {
              sessionStorage.removeItem(backupKey(trackId));
            }
          }
        } catch {
          // Storage blocked or unreadable: nothing to offer.
        }
      })
      .catch((err) => {
        if (!cancelled) setLoadError(errorText(err, 'Could not load these checkpoints.'));
      });
    return () => {
      cancelled = true;
    };
  }, [tokenReady, call, sectionsUrl, trackId]);

  const dirty = isDirty(draft);

  // Keep a copy through a refresh or a closed tab.
  useEffect(() => {
    if (!track) return;
    const timer = setTimeout(() => {
      try {
        if (dirty) {
          sessionStorage.setItem(backupKey(trackId), JSON.stringify({ savedAt: Date.now(), sections: toSavePayload(draft) }));
        } else if (!backup) {
          sessionStorage.removeItem(backupKey(trackId));
        }
      } catch {
        // A full or blocked sessionStorage must not stop the editor.
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [draft, dirty, track, trackId, backup]);

  /* ── What needs fixing ────────────────────────────────────────────────── */

  const issues = useMemo(
    () => validateCheckpoints(draft.sections, { durationSeconds: duration }),
    [draft.sections, duration],
  );
  const blocking = hasBlockingIssues(issues);
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const issuesBySection = useMemo(() => {
    const map = new Map<number, { errors: number; warnings: number }>();
    for (const issue of issues) {
      const entry = map.get(issue.sectionIndex) ?? { errors: 0, warnings: 0 };
      if (issue.severity === 'error') entry.errors += 1;
      else entry.warnings += 1;
      map.set(issue.sectionIndex, entry);
    }
    return map;
  }, [issues]);

  const selectedIndex = draft.sections.findIndex((s) => s.key === draft.selectedKey);
  const selected = selectedIndex >= 0 ? draft.sections[selectedIndex] : null;

  const showFirstError = () => {
    const first = issues.find((i) => i.severity === 'error');
    if (first) dispatch({ type: 'select', key: draft.sections[first.sectionIndex]?.key ?? null });
  };

  /* ── Navigation ───────────────────────────────────────────────────────── */

  const backHref = recordingsHref({ fileId, lang: track?.language ?? null, from });
  const { leave } = useLeaveGuard(dirty, (href) => setLeaveTo(href));

  /* ── Saving and publishing ────────────────────────────────────────────── */

  const save = useCallback(async (): Promise<boolean> => {
    if (hasBlockingIssues(validateCheckpoints(draft.sections, { durationSeconds: duration }))) {
      setSnack({ message: 'Fix the items marked in red, then save.', severity: 'error' });
      showFirstError();
      return false;
    }
    setBusy('save');
    try {
      const res = await call<{ track: { sections?: unknown[] } }>(sectionsUrl, {
        method: 'PUT',
        body: JSON.stringify({ sections: toSavePayload(draft) }),
      });
      // The save hands back new ids on a draft. Adopt them in place, with no
      // reload, so the teacher keeps their place.
      dispatch({ type: 'load', sections: res.track?.sections ?? [] });
      setBackup(null);
      try {
        sessionStorage.removeItem(backupKey(trackId));
      } catch {
        /* nothing to clear */
      }
      setSnack({ message: 'Saved.', severity: 'success' });
      return true;
    } catch (err) {
      setSnack({ message: errorText(err, 'Could not save.'), severity: 'error' });
      return false;
    } finally {
      setBusy(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, duration, call, sectionsUrl, trackId]);

  const label = track?.language_label || track?.language || '';
  const published = track?.status === 'published';

  const publish = async () => {
    if (!track) return;
    if (dirty && !(await save())) return;
    setBusy('publish');
    try {
      await call(trackUrl(fileId, trackId), { method: 'PATCH', body: JSON.stringify({ status: 'published' }) });
      setTrack({ ...track, status: 'published', readiness: 'ready' });
      setSnack({ message: `${label} is live. Students can watch it now.`, severity: 'success' });
    } catch (err) {
      setSnack({ message: errorText(err, 'Could not publish.'), severity: 'error' });
    } finally {
      setBusy(null);
    }
  };

  // Ctrl or Cmd + S saves, as in every editor a teacher already uses.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (dirty && !busy) void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dirty, busy, save]);

  /* ── The player ───────────────────────────────────────────────────────── */

  const playFrom = (seconds: number) => {
    transportRef.current?.seek(seconds);
    transportRef.current?.play();
    if (!desktop) playerRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  };

  const marks = draft.sections.map((section, i) => ({
    id: section.key,
    at: section.end_timestamp_seconds,
    label: `Checkpoint ${i + 1} questions`,
  }));

  /* ── Render ───────────────────────────────────────────────────────────── */

  if (!authLoading && !isTeacher) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">This page is for teachers only.</Alert>
      </Box>
    );
  }

  const breadcrumbs = desktop
    ? [
        { label: 'Study Materials', href: '/teacher/study-materials' },
        { label: 'Class recordings', href: backHref },
      ]
    : [{ label: 'Class recordings', href: backHref }];

  return (
    <Box sx={{ maxWidth: 1280, mx: 'auto', pb: 1 }}>
      <PageHeader
        title={track ? `${label} checkpoints` : 'Checkpoints'}
        subtitle={track?.title}
        backHref={backHref}
        breadcrumbs={breadcrumbs}
        action={
          track ? (
            <Chip label={published ? 'Live' : 'Draft'} color={published ? 'success' : 'default'} sx={{ fontWeight: 700 }} />
          ) : undefined
        }
      />

      {loadError && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" href={backHref} sx={{ minHeight: 44, textTransform: 'none', fontWeight: 700 }}>
              Back to Class recordings
            </Button>
          }
        >
          {loadError}
        </Alert>
      )}

      {backup && (
        <Alert
          severity="info"
          sx={{ mb: 2 }}
          action={
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <Button
                color="inherit"
                onClick={() => {
                  dispatch({ type: 'restore', sections: backup });
                  setBackup(null);
                }}
                sx={{ minHeight: 44, textTransform: 'none', fontWeight: 700 }}
              >
                Restore
              </Button>
              <Button
                color="inherit"
                onClick={() => {
                  setBackup(null);
                  try {
                    sessionStorage.removeItem(backupKey(trackId));
                  } catch {
                    /* nothing to clear */
                  }
                }}
                sx={{ minHeight: 44, textTransform: 'none' }}
              >
                Discard
              </Button>
            </Box>
          }
        >
          You have changes from earlier that were not saved.
        </Alert>
      )}

      {errorCount > 0 && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" onClick={showFirstError} sx={{ minHeight: 44, textTransform: 'none', fontWeight: 700 }}>
              Show
            </Button>
          }
        >
          {errorCount === 1 ? '1 thing to fix before saving.' : `${errorCount} things to fix before saving.`}
        </Alert>
      )}

      {!track ? (
        !loadError && (
          <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: '5fr 7fr' } }} aria-busy="true">
            <Skeleton variant="rounded" sx={{ aspectRatio: '16 / 9', height: 'auto', borderRadius: 2 }} />
            <Skeleton variant="rounded" height={420} sx={{ borderRadius: 3 }} />
          </Box>
        )
      ) : (
        <Box
          sx={{
            display: 'grid',
            gap: { xs: 2, md: 3 },
            gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 5fr) minmax(0, 7fr)' },
            alignItems: 'start',
          }}
        >
          <Box
            sx={{
              position: { md: 'sticky' },
              top: { md: 72 },
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              minWidth: 0,
            }}
          >
            <Box ref={playerRef} sx={{ scrollMarginTop: 72 }}>
              {track.recording_url ? (
                <TrackPreviewPlayer
                  fileId={fileId}
                  trackId={trackId}
                  title={track.recording_name || track.title}
                  getToken={getToken}
                  marks={marks}
                  transportRef={transportRef}
                  onTimeUpdate={(seconds) => setNow(Math.floor(seconds))}
                  onLoadedMetadata={(seconds) => {
                    if (seconds > 0) setDuration(Math.round(seconds));
                  }}
                />
              ) : (
                <Alert severity="info">This recording has no video yet, so there is nothing to play.</Alert>
              )}
            </Box>
            <CheckpointTimeline
              sections={draft.sections}
              selectedKey={draft.selectedKey}
              durationSeconds={duration}
              currentSeconds={now}
              onSelect={(key) => dispatch({ type: 'select', key })}
            />
            <CheckpointOutline
              sections={draft.sections}
              selectedKey={draft.selectedKey}
              issuesBySection={issuesBySection}
              onSelect={(key) => dispatch({ type: 'select', key })}
              onAdd={() => dispatch({ type: 'addSection', durationSeconds: duration })}
              disabled={!!busy}
            />
          </Box>

          <Box sx={{ minWidth: 0 }}>
            {selected ? (
              <CheckpointDetail
                key={selected.key}
                section={selected}
                index={selectedIndex}
                total={draft.sections.length}
                gate={track.gate}
                issues={issues.filter((issue) => issue.sectionIndex === selectedIndex)}
                nowSeconds={now > 0 ? now : null}
                onPatch={(patch) => dispatch({ type: 'patchSection', key: selected.key, patch })}
                onPatchQuestion={(qi, patch: Partial<EditableQuestion>) =>
                  dispatch({ type: 'patchQuestion', key: selected.key, index: qi, patch })
                }
                onAddQuestion={() => dispatch({ type: 'addQuestion', key: selected.key })}
                onRemoveQuestion={(qi) => {
                  const question = selected.questions[qi];
                  const key = selected.key;
                  dispatch({ type: 'removeQuestion', key, index: qi });
                  setSnack({
                    message: `Deleted question ${qi + 1}.`,
                    severity: 'info',
                    undo: () => dispatch({ type: 'restoreQuestion', key, index: qi, question }),
                  });
                }}
                onRemove={() => setRemoveKey(selected.key)}
                onPlayFrom={playFrom}
                disabled={!!busy}
              />
            ) : (
              <Paper variant="outlined" sx={{ borderRadius: 3, p: { xs: 3, sm: 4 }, textAlign: 'center' }}>
                <Typography component="h2" sx={{ fontWeight: 700, mb: 0.75 }}>
                  No checkpoints yet
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Go back to Class recordings to create them from the transcript, or add one here by hand.
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<AddRoundedIcon />}
                  onClick={() => dispatch({ type: 'addSection', durationSeconds: duration })}
                  sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700 }}
                >
                  Add checkpoint
                </Button>
              </Paper>
            )}
          </Box>
        </Box>
      )}

      {track && (
        <Paper
          elevation={3}
          sx={{
            position: 'sticky',
            bottom: { xs: 72, md: 16 },
            zIndex: (t) => t.zIndex.appBar - 1,
            mt: 3,
            p: 1.25,
            borderRadius: 3,
            border: 1,
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 1,
          }}
        >
          <Typography
            variant="body2"
            aria-live="polite"
            sx={{ flex: 1, minWidth: 140, pl: 1, fontWeight: 600, color: dirty ? 'warning.dark' : 'text.secondary' }}
          >
            {busy === 'save' ? 'Saving...' : dirty ? 'Unsaved changes' : 'All changes saved'}
          </Typography>
          <Button
            variant={published ? 'contained' : 'outlined'}
            startIcon={busy === 'save' ? <CircularProgress size={16} color="inherit" /> : <SaveOutlinedIcon />}
            onClick={() => void save()}
            disabled={!dirty || !!busy}
            sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700 }}
          >
            Save
          </Button>
          {!published && (
            <Button
              variant="contained"
              startIcon={busy === 'publish' ? <CircularProgress size={16} color="inherit" /> : <PublishRoundedIcon />}
              onClick={() => void publish()}
              disabled={!!busy || draft.sections.length === 0 || blocking}
              sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700 }}
            >
              {dirty ? 'Save and publish' : `Publish ${label}`}
            </Button>
          )}
        </Paper>
      )}

      <ResponsiveSheet
        open={!!leaveTo}
        onClose={() => setLeaveTo(null)}
        disableClose={busy === 'save'}
        title="Leave without saving?"
        description="Your changes to these checkpoints have not been saved."
        actions={
          <>
            <Button onClick={() => setLeaveTo(null)} disabled={busy === 'save'} sx={{ textTransform: 'none' }}>
              Stay
            </Button>
            <Button
              color="error"
              disabled={busy === 'save'}
              onClick={() => {
                const href = leaveTo;
                setLeaveTo(null);
                try {
                  sessionStorage.removeItem(backupKey(trackId));
                } catch {
                  /* nothing to clear */
                }
                if (href) leave(href);
              }}
              sx={{ textTransform: 'none' }}
            >
              Leave without saving
            </Button>
            <Button
              variant="contained"
              disabled={busy === 'save'}
              onClick={async () => {
                const href = leaveTo;
                if (await save()) {
                  setLeaveTo(null);
                  if (href) leave(href);
                }
              }}
              sx={{ textTransform: 'none', fontWeight: 700 }}
            >
              Save and leave
            </Button>
          </>
        }
      />

      <ResponsiveSheet
        open={!!removeKey}
        onClose={() => setRemoveKey(null)}
        title="Delete this checkpoint?"
        description="Its questions go with it. Nothing changes for students until you save."
        actions={
          <>
            <Button onClick={() => setRemoveKey(null)} sx={{ textTransform: 'none' }}>
              Keep it
            </Button>
            <Button
              variant="contained"
              color="error"
              onClick={() => {
                if (removeKey) dispatch({ type: 'removeSection', key: removeKey });
                setRemoveKey(null);
              }}
              sx={{ textTransform: 'none', fontWeight: 700 }}
            >
              Delete checkpoint
            </Button>
          </>
        }
      />

      <Snackbar
        open={!!snack}
        autoHideDuration={snack?.undo ? 8000 : 4000}
        onClose={(_, reason) => {
          if (reason !== 'clickaway') setSnack(null);
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ bottom: { xs: 148, md: 96 } }}
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

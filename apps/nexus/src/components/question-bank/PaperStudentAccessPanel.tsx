'use client';

/**
 * Everything that decides what a student sees of one original paper.
 *
 * Three rows, in the order they have to be settled: link the PDF, set the mock,
 * then publish. Publishing last is not a style choice, it is the dependency: a
 * paper with neither questions nor a PDF has nothing to show, and the server
 * refuses it. The readiness line above the switch says what is missing so the
 * refusal never arrives as a surprise.
 *
 * Reads and writes one route, /api/question-bank/papers/[id]/access, which
 * returns the whole panel in a single call rather than one per row.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Paper,
  Skeleton,
  Switch,
  Typography,
  alpha,
  useTheme,
} from '@neram/ui';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import LinkOffOutlinedIcon from '@mui/icons-material/LinkOffOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import TestResultsPanel from '@/components/tests/TestResultsPanel';
import ExamScheduleDialog from '@/components/scheduled-exams/ExamScheduleDialog';
import { useAuthFetch } from '@/components/curriculum/shared';
import type { GetToken } from '@/lib/nexus-swr';

interface StaffView {
  paper: { id: string; is_student_visible: boolean; duration_minutes: number | null };
  question_count: number;
  study_file: { id: string; title: string; file_name: string; folder_id: string } | null;
  test: {
    test_id: string;
    placement_id: string;
    title: string;
    question_count: number;
    duration_minutes: number | null;
    passing_pct: number | null;
  } | null;
  publish_blocker: string | null;
}

export interface PaperStudentAccessPanelProps {
  paperId: string;
  getToken: GetToken;
  /** Bumped by the page when something outside this panel changed the paper. */
  refreshKey?: number;
}

export default function PaperStudentAccessPanel({
  paperId,
  getToken,
  refreshKey,
}: PaperStudentAccessPanelProps) {
  const theme = useTheme();
  const authFetch = useAuthFetch();
  const [view, setView] = useState<StaffView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [examOpen, setExamOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`/api/question-bank/papers/${paperId}/access`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Could not load student access.');
      setView(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load student access.');
    } finally {
      setLoading(false);
    }
  }, [paperId, getToken]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  /** Every write here answers with the whole panel, so one call refreshes it. */
  const write = async (
    label: string,
    path: string,
    init: RequestInit,
    applies: (json: any) => StaffView | null,
  ) => {
    setBusy(label);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(path, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'That did not work.');
      const next = applies(json);
      if (next) setView(next);
      else await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setBusy(null);
    }
  };

  const setStudyFile = (fileId: string | null) =>
    write(
      'file',
      `/api/question-bank/papers/${paperId}/access`,
      { method: 'PATCH', body: JSON.stringify({ study_file_id: fileId }) },
      (json) => json.data,
    );

  const setVisible = (visible: boolean) =>
    write(
      'publish',
      `/api/question-bank/papers/${paperId}/access`,
      { method: 'PATCH', body: JSON.stringify({ is_student_visible: visible }) },
      (json) => json.data,
    );

  const generateTest = () =>
    write(
      'test',
      `/api/question-bank/papers/${paperId}/test`,
      { method: 'POST', body: JSON.stringify({ generate: true }) },
      () => null,
    );

  const removeTest = () =>
    write('test', `/api/question-bank/papers/${paperId}/test`, { method: 'DELETE' }, () => null);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} variant="rounded" height={96} sx={{ borderRadius: 3 }} />
        ))}
      </Box>
    );
  }

  if (!view) {
    return <Alert severity="error">{error || 'Could not load student access.'}</Alert>;
  }

  const readyLine = [
    view.question_count > 0 ? `${view.question_count} questions` : 'No active questions',
    view.study_file ? 'PDF linked' : 'No PDF',
    view.test ? 'Test ready' : 'No test',
  ].join(' · ');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ borderRadius: 2 }}>
          {error}
        </Alert>
      )}

      {/* ── 1. The PDF ─────────────────────────────────────────────────── */}
      <Row
        icon={<PictureAsPdfOutlinedIcon />}
        color={theme.palette.info.main}
        title="Original PDF"
        body={
          view.study_file
            ? view.study_file.title || view.study_file.file_name
            : 'Students see the real paper alongside the questions. Pick the file from Study Materials.'
        }
        action={
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              size="small"
              variant={view.study_file ? 'outlined' : 'contained'}
              onClick={() => setPickerOpen(true)}
              disabled={busy === 'file'}
              sx={{ minHeight: 40, textTransform: 'none', borderRadius: 2 }}
            >
              {view.study_file ? 'Change' : 'Link PDF'}
            </Button>
            {view.study_file && (
              <IconButton
                aria-label="Unlink the PDF"
                onClick={() => setStudyFile(null)}
                disabled={busy === 'file'}
                sx={{ width: 40, height: 40 }}
              >
                <LinkOffOutlinedIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
        }
      />

      {/* ── 2. The mock ────────────────────────────────────────────────── */}
      <Row
        icon={<TimerOutlinedIcon />}
        color={theme.palette.success.main}
        title="Timed test"
        body={
          view.test
            ? `${view.test.title} · ${view.test.question_count} questions${
                view.test.duration_minutes ? ` · ${view.test.duration_minutes} min` : ' · untimed'
              }`
            : view.question_count > 0
              ? `Build one from this paper's ${view.question_count} active questions, in their original order.`
              : 'Activate this paper’s questions before a test can be built from them.'
        }
        action={
          view.test ? (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {/* The first of the three doors into scheduling. A paper that
                  already has a mock is the most natural thing in the product to
                  sit as a real exam. */}
              <Button
                size="small"
                variant="contained"
                onClick={() => setExamOpen(true)}
                sx={{ minHeight: 40, textTransform: 'none', borderRadius: 2 }}
              >
                Schedule as exam
              </Button>
              <Button
                size="small"
                variant="outlined"
                href={`/teacher/tests/${view.test.test_id}`}
                sx={{ minHeight: 40, textTransform: 'none', borderRadius: 2 }}
              >
                Edit
              </Button>
              <IconButton
                aria-label="Remove the test from this paper"
                onClick={removeTest}
                disabled={busy === 'test'}
                sx={{ width: 40, height: 40 }}
              >
                <LinkOffOutlinedIcon fontSize="small" />
              </IconButton>
            </Box>
          ) : (
            <Button
              size="small"
              variant="contained"
              color="success"
              disabled={view.question_count === 0 || busy === 'test'}
              onClick={generateTest}
              startIcon={
                busy === 'test' ? (
                  <CircularProgress size={14} color="inherit" />
                ) : (
                  <AutoAwesomeOutlinedIcon />
                )
              }
              sx={{ minHeight: 40, textTransform: 'none', borderRadius: 2 }}
            >
              Generate
            </Button>
          )
        }
      />

      {/* ── 3. Publish ─────────────────────────────────────────────────── */}
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          borderRadius: 3,
          borderColor: view.paper.is_student_visible
            ? alpha(theme.palette.success.main, 0.4)
            : 'divider',
          bgcolor: view.paper.is_student_visible
            ? alpha(theme.palette.success.main, 0.04)
            : 'transparent',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="subtitle1" fontWeight={700}>
              Publish to students
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {view.publish_blocker ||
                (view.paper.is_student_visible
                  ? 'Live on the student Question Bank.'
                  : 'Students will see this paper on their Question Bank.')}
            </Typography>
          </Box>
          <Switch
            checked={view.paper.is_student_visible}
            disabled={busy === 'publish' || (!!view.publish_blocker && !view.paper.is_student_visible)}
            onChange={(e) => setVisible(e.target.checked)}
            inputProps={{ 'aria-label': 'Publish this paper to students' }}
          />
        </Box>
        <Divider sx={{ my: 1.5 }} />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <CheckCircleOutlinedIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
          <Typography variant="caption" color="text.secondary">
            Students get: {readyLine}
          </Typography>
        </Box>
      </Paper>

      {/* ── 4. How they did ───────────────────────────────────────────────
          Only once there is a test to have done. The panel is the existing
          teacher results view, unchanged, so per-student rows and the
          "most students got this wrong" question list behave here exactly as
          they do on the test's own page. */}
      {view.test && (
        <Box sx={{ mt: 1 }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
            Results
          </Typography>
          <TestResultsPanel testId={view.test.test_id} authFetch={authFetch} />
        </Box>
      )}

      <StudyFilePicker
        open={pickerOpen}
        getToken={getToken}
        onClose={() => setPickerOpen(false)}
        onPick={(fileId) => {
          setPickerOpen(false);
          void setStudyFile(fileId);
        }}
      />

      {view?.test && (
        <ExamScheduleDialog
          open={examOpen}
          onClose={() => setExamOpen(false)}
          testId={view.test.test_id}
          testTitle={view.test.title}
        />
      )}
    </Box>
  );
}

function Row({
  icon,
  color,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  color: string;
  title: string;
  body: string;
  action: React.ReactNode;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 2,
            flexShrink: 0,
            display: 'grid',
            placeItems: 'center',
            bgcolor: alpha(color, 0.1),
            color,
          }}
        >
          {icon}
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ lineHeight: 1.3 }}>
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {body}
          </Typography>
        </Box>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1.5 }}>{action}</Box>
    </Paper>
  );
}

/**
 * Walk the Study Materials tree and pick one file.
 *
 * Deliberately a plain browser rather than a search box: papers are filed by
 * year inside exam folders, and a teacher looking for "NATA 2025" knows where it
 * lives far better than they know what it was named on upload.
 */
function StudyFilePicker({
  open,
  getToken,
  onClose,
  onPick,
}: {
  open: boolean;
  getToken: GetToken;
  onClose: () => void;
  onPick: (fileId: string) => void;
}) {
  const [parent, setParent] = useState<string | null>(null);
  const [data, setData] = useState<{
    breadcrumb: { id: string; name: string }[];
    folders: { id: string; name: string; item_count?: number }[];
    files: { id: string; title: string; file_name: string; kind: string }[];
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const token = await getToken();
        const res = await fetch(`/api/study-materials/folders?parent=${parent ?? 'root'}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!cancelled && res.ok) setData(json);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, parent, getToken]);

  // Reopening should start at the top rather than wherever the last search ended.
  useEffect(() => {
    if (open) setParent(null);
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" fontWeight={700}>
            Link the original PDF
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
            {data?.breadcrumb?.length
              ? data.breadcrumb.map((b) => b.name).join(' / ')
              : 'Study Materials'}
          </Typography>
        </Box>
        <IconButton onClick={onClose} aria-label="Close">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0, minHeight: 320 }}>
        {loading ? (
          <Box sx={{ p: 2 }}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} variant="rounded" height={52} sx={{ mb: 1, borderRadius: 2 }} />
            ))}
          </Box>
        ) : (
          <Box sx={{ p: 1 }}>
            {parent && (
              <PickerRow
                icon={<FolderOutlinedIcon />}
                label=".."
                sub="Back"
                onClick={() =>
                  setParent(
                    data?.breadcrumb && data.breadcrumb.length > 1
                      ? data.breadcrumb[data.breadcrumb.length - 2].id
                      : null,
                  )
                }
              />
            )}
            {(data?.folders || []).map((f) => (
              <PickerRow
                key={f.id}
                icon={<FolderOutlinedIcon />}
                label={f.name}
                sub={f.item_count != null ? `${f.item_count} items` : undefined}
                onClick={() => setParent(f.id)}
                chevron
              />
            ))}
            {(data?.files || []).map((f) => (
              <PickerRow
                key={f.id}
                icon={<PictureAsPdfOutlinedIcon />}
                label={f.title || f.file_name}
                sub={f.file_name}
                onClick={() => onPick(f.id)}
              />
            ))}
            {!loading && !(data?.folders || []).length && !(data?.files || []).length && (
              <Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
                Nothing in this folder.
              </Typography>
            )}
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PickerRow({
  icon,
  label,
  sub,
  onClick,
  chevron,
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  onClick: () => void;
  chevron?: boolean;
}) {
  return (
    <Box
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      tabIndex={0}
      role="button"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        p: 1.25,
        minHeight: 52,
        borderRadius: 2,
        cursor: 'pointer',
        '&:hover': { bgcolor: 'action.hover' },
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
      }}
    >
      <Box sx={{ color: 'text.secondary', display: 'flex' }}>{icon}</Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" fontWeight={600} noWrap>
          {label}
        </Typography>
        {sub && (
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
            {sub}
          </Typography>
        )}
      </Box>
      {chevron && <ChevronRightIcon sx={{ color: 'text.disabled' }} />}
    </Box>
  );
}

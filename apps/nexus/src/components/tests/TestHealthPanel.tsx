'use client';

/**
 * What is wrong with this paper.
 *
 * Renders nothing at all when nothing is wrong, which is the common case and
 * should stay invisible. A permanent "0 issues" badge trains people to ignore
 * the space, and then the one time it matters they ignore it too.
 *
 * The three streams are labelled rather than merged, because what a teacher does
 * next differs by stream: a structural fault is fixed in the question bank, a
 * technical one is escalated, and a student report is answered.
 *
 * THE APP LINES NAME PEOPLE AND CAN BE CLEARED. On acf8084d (2026-09-17) the
 * banner said "21 students could not submit" with no way to see who, and no way
 * to say the bug behind it had been fixed, so it would have stayed red forever.
 * Each App line now counts distinct students (the route does that), opens to
 * "See who" with each student's face beside their name, and "Mark as fixed"
 * hides the App lines until a student hits something new.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Paper,
  Snackbar,
  Typography,
  useMediaQuery,
} from '@neram/ui';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import RecordVoiceOverOutlinedIcon from '@mui/icons-material/RecordVoiceOverOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import StudentAvatar from '@/components/students/StudentAvatar';
import { copyText, downloadText } from '@/lib/clipboard';
import { buildHealthPrompt } from '@/lib/test-health';
import type { AffectedStudent, TestIssue, TestIssueStream } from '@/lib/test-health';

const STREAM_META: Record<TestIssueStream, { label: string; icon: React.ReactNode }> = {
  structural: { label: 'Paper', icon: <BuildOutlinedIcon sx={{ fontSize: 15 }} /> },
  technical: { label: 'App', icon: <BugReportOutlinedIcon sx={{ fontSize: 15 }} /> },
  reported: { label: 'Students', icon: <RecordVoiceOverOutlinedIcon sx={{ fontSize: 15 }} /> },
};

interface ReportRow {
  id: string;
  question_id: string;
  report_type: string | null;
  description: string | null;
  created_at: string;
}

/** One student an App problem happened to, as the health route sends it. */
interface AffectedRow extends AffectedStudent {
  name: string | null;
  avatar_url: string | null;
}

interface Toast {
  message: string;
  severity: 'success' | 'error';
  /** Offer Undo (after a successful Mark as fixed). */
  undo: boolean;
}

const REPORT_LABEL: Record<string, string> = {
  wrong_answer: 'Answer looks wrong',
  no_correct_option: 'No correct option',
  question_error: 'Mistake in the question',
  missing_solution: 'No solution given',
  unclear_question: 'Question is unclear',
  other: 'Other',
};

const FOCUS_RING = {
  '&.Mui-focusVisible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 },
} as const;

function when(at: string | null): string {
  if (!at) return 'Time not recorded';
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return 'Time not recorded';
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

export default function TestHealthPanel({
  testId,
  testTitle,
  placementId,
  runLabel,
  getToken,
}: {
  testId: string;
  /** For the copied problem, which reaches an AI with no access to this screen. */
  testTitle?: string | null;
  placementId?: string | null;
  /** How the run picker labels the run in view, e.g. "Exam: 18 Aug". */
  runLabel?: string | null;
  getToken: () => Promise<string | null>;
}) {
  const [issues, setIssues] = useState<TestIssue[] | null>(null);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [affected, setAffected] = useState<Record<string, AffectedRow[]>>({});
  const [clearedAt, setClearedAt] = useState<string | null>(null);
  const [blocking, setBlocking] = useState(false);
  const [failed, setFailed] = useState(false);
  const [openPhases, setOpenPhases] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<'clear' | 'undo' | 'copy' | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  // Separate from the content so the message stays put while the Snackbar fades out.
  const [toastOpen, setToastOpen] = useState(false);
  const showToast = (next: Toast) => {
    setToast(next);
    setToastOpen(true);
  };
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  const base = `/api/question-bank/tests/${testId}/health`;

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(base, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('health check failed');
      const json = await res.json();
      setIssues(json.data?.issues || []);
      setReports(json.data?.reports || []);
      setAffected(json.data?.affected || {});
      setClearedAt(json.data?.cleared?.cleared_at ?? null);
      setBlocking(Boolean(json.data?.blocking));
      setFailed(false);
    } catch {
      // Said out loud rather than swallowed. A silent failure here reads as
      // "this paper is fine", which is the one wrong answer this panel can give.
      setFailed(true);
      setIssues([]);
    }
  }, [base, getToken]);

  useEffect(() => {
    load();
  }, [load]);

  const send = useCallback(
    async (method: 'POST' | 'DELETE') => {
      const token = await getToken();
      if (!token) throw new Error('Your session has expired. Sign in again and retry.');
      const res = await fetch(`${base}/clear`, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'That did not go through. Try again.');
    },
    [base, getToken],
  );

  const markFixed = async () => {
    if (busy) return;
    setBusy('clear');
    try {
      await send('POST');
      setOpenPhases(new Set());
      await load();
      showToast({
        message: 'Marked as fixed. The App lines are hidden until a student hits a new problem.',
        severity: 'success',
        undo: true,
      });
    } catch (err) {
      showToast({
        message: err instanceof Error ? err.message : 'Could not mark this paper as fixed. Try again.',
        severity: 'error',
        undo: false,
      });
    } finally {
      setBusy(null);
    }
  };

  const undo = async () => {
    if (busy) return;
    setBusy('undo');
    setToastOpen(false);
    try {
      await send('DELETE');
      await load();
      showToast({ message: 'Undone. The App problems are showing again.', severity: 'success', undo: false });
    } catch (err) {
      showToast({
        message: err instanceof Error ? err.message : 'Could not undo. Try again.',
        severity: 'error',
        undo: false,
      });
    } finally {
      setBusy(null);
    }
  };

  /**
   * The banner, as a prompt.
   *
   * The loop this closes: copy the problem, get it fixed, confirm, press Mark as
   * fixed. Retyping "6 students could not submit" into a chat loses every fact
   * that makes it findable, so the paste carries the ids, the names, the times
   * and what the app actually said.
   *
   * Download is the fallback rather than a failure message, because the clipboard
   * is refused on an insecure origin and whenever the window has lost focus, and
   * neither is something a teacher can do anything about. See lib/clipboard.ts.
   */
  const copyPrompt = async () => {
    if (busy) return;
    setBusy('copy');
    try {
      const text = buildHealthPrompt({
        testTitle: testTitle || 'Untitled paper',
        testId,
        placementId: placementId ?? null,
        runLabel: runLabel ?? null,
        pageUrl: typeof window === 'undefined' ? '' : window.location.href,
        issues: issues || [],
        affected,
        reports,
      });
      if (await copyText(text)) {
        showToast({ message: 'Copied. Paste it to Claude and ask for a fix.', severity: 'success', undo: false });
      } else {
        downloadText(`test-problem-${testId}.txt`, text);
        showToast({
          message: 'Your browser blocked the clipboard, so it downloaded as a file instead.',
          severity: 'success',
          undo: false,
        });
      }
    } catch (err) {
      showToast({
        message: err instanceof Error ? err.message : 'Could not copy the problem. Try again.',
        severity: 'error',
        undo: false,
      });
    } finally {
      setBusy(null);
    }
  };

  const togglePhase = (phase: string) =>
    setOpenPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phase)) next.delete(phase);
      else next.add(phase);
      return next;
    });

  // Rendered whatever the panel shows: after Mark as fixed the panel often has
  // nothing left to show, and the confirmation with its Undo must outlive it.
  const toastView = (
    <Snackbar
      open={toastOpen && Boolean(toast)}
      autoHideDuration={toast?.undo ? 8000 : 5000}
      onClose={(_, reason) => {
        if (reason !== 'clickaway') setToastOpen(false);
      }}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      // Above the teacher bottom nav on phones, so Undo and the nav stay tappable.
      sx={{ mb: { xs: 8, md: 0 } }}
    >
      {toast ? (
        <Alert
          severity={toast.severity}
          variant="filled"
          // A confirmation is polite; only a failure interrupts.
          role={toast.severity === 'error' ? 'alert' : 'status'}
          onClose={() => setToastOpen(false)}
          action={
            toast.undo ? (
              <Button color="inherit" onClick={undo} sx={{ minHeight: 44, fontWeight: 700, ...FOCUS_RING }}>
                Undo
              </Button>
            ) : undefined
          }
          // The .dark tokens: white on the Nexus success.main is about 3.3:1,
          // under the 4.5:1 a sentence needs. success.dark and error.dark clear it.
          sx={{
            width: '100%',
            alignItems: 'center',
            bgcolor: toast.severity === 'success' ? 'success.dark' : 'error.dark',
            color: 'common.white',
            '& .MuiAlert-icon': { color: 'common.white' },
          }}
        >
          {toast.message}
        </Alert>
      ) : (
        <span />
      )}
    </Snackbar>
  );

  if (issues === null) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
        <CircularProgress size={14} />
        <Typography variant="caption" color="text.secondary">
          Checking this paper
        </Typography>
      </Box>
    );
  }

  if (failed) {
    return (
      <>
        <Alert severity="warning" sx={{ mb: 2 }}>
          Could not check this paper for problems. This does not mean it is fine, only that the check
          did not run.
        </Alert>
        {toastView}
      </>
    );
  }

  // Nothing wrong: render nothing. See the file comment.
  if (issues.length === 0) return toastView;

  const hasAppIssues = issues.some((i) => i.stream === 'technical');

  return (
    <>
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          mb: 2,
          borderRadius: 2,
          borderColor: blocking ? 'error.main' : 'warning.main',
          borderWidth: 1.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <ReportProblemOutlinedIcon sx={{ fontSize: 20, color: blocking ? 'error.main' : 'warning.main' }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {blocking ? 'This paper has problems that affect students sitting it' : 'Worth a look'}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {issues.map((issue, i) => {
            const who = issue.stream === 'technical' && issue.phase ? affected[issue.phase] || [] : [];
            const phase = issue.phase || '';
            const open = who.length > 0 && openPhases.has(phase);
            const listId = `test-health-who-${phase}`;
            return (
              <Box key={i}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                  <Chip
                    size="small"
                    icon={STREAM_META[issue.stream].icon as any}
                    label={STREAM_META[issue.stream].label}
                    color={issue.severity === 'error' ? 'error' : 'warning'}
                    variant="outlined"
                    sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700, flexShrink: 0, mt: 0.25 }}
                  />
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="body2" sx={{ lineHeight: 1.5 }}>
                      {issue.title}
                    </Typography>
                    {who.length > 0 && (
                      <Button
                        size="small"
                        variant="text"
                        onClick={() => togglePhase(phase)}
                        aria-expanded={open}
                        // The list is unmounted while closed, so only point at it when it exists.
                        aria-controls={open ? listId : undefined}
                        endIcon={
                          <ExpandMoreIcon
                            sx={{
                              transform: open ? 'rotate(180deg)' : 'none',
                              transition: reduceMotion ? 'none' : 'transform 200ms ease-out',
                            }}
                          />
                        }
                        sx={{ minHeight: 44, px: 1, ml: -1, textTransform: 'none', fontWeight: 600, ...FOCUS_RING }}
                      >
                        {open ? 'Hide names' : 'See who'}
                      </Button>
                    )}
                  </Box>
                </Box>

                {who.length > 0 && (
                  <Collapse in={open} timeout={reduceMotion ? 0 : 'auto'} unmountOnExit>
                    <Box
                      component="ul"
                      id={listId}
                      aria-label={issue.title}
                      sx={{ listStyle: 'none', m: 0, mt: 0.5, p: 0, pl: { xs: 0, sm: 5 } }}
                    >
                      {who.map((s) => {
                        const name = s.name?.trim() || 'Unknown student';
                        return (
                          <Box
                            component="li"
                            key={s.student_id}
                            sx={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 1,
                              py: 1,
                              borderTop: 1,
                              borderColor: 'divider',
                            }}
                          >
                            <StudentAvatar userId={s.student_id} name={name} src={s.avatar_url} size={32} />
                            <Box sx={{ minWidth: 0, flex: 1 }}>
                              <Typography variant="body2" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
                                {name}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                Last {when(s.last_at)} · {s.times} {s.times === 1 ? 'time' : 'times'}
                              </Typography>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ display: 'block', overflowWrap: 'anywhere' }}
                              >
                                {s.message || 'No message recorded'}
                              </Typography>
                            </Box>
                          </Box>
                        );
                      })}
                    </Box>
                  </Collapse>
                )}
              </Box>
            );
          })}
        </Box>

        <Box
          sx={{
            mt: 1.5,
            pt: 1.5,
            borderTop: 1,
            borderColor: 'divider',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            columnGap: 1.5,
            rowGap: 1,
          }}
        >
          <Button
            variant="contained"
            onClick={copyPrompt}
            disabled={busy !== null}
            startIcon={busy === 'copy' ? <CircularProgress size={16} color="inherit" /> : <ContentCopyOutlinedIcon />}
            sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600, ...FOCUS_RING }}
          >
            Copy for Claude
          </Button>
          {hasAppIssues && (
            <Button
              variant="outlined"
              onClick={markFixed}
              disabled={busy !== null}
              startIcon={busy === 'clear' ? <CircularProgress size={16} color="inherit" /> : <TaskAltOutlinedIcon />}
              sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600, ...FOCUS_RING }}
            >
              Mark as fixed
            </Button>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ flex: '1 1 200px' }}>
            {hasAppIssues
              ? 'Copy hands the whole problem over. Mark as fixed hides the App lines above, and anything that fails for a student after now shows again.'
              : 'Copy hands the whole problem over, with the ids and the names an AI needs to find it.'}
            {hasAppIssues && clearedAt ? ` Last marked fixed ${when(clearedAt)}.` : ''}
          </Typography>
        </Box>

        {reports.length > 0 && (
          <Box sx={{ mt: 2, pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.75 }}>
              What students said
            </Typography>
            {/* Verbatim. A tally tells a teacher there is a problem; the sentence
                tells them what it is, and these have been sitting unread because
                the only surface for them was a page nothing links to. */}
            {reports.slice(0, 5).map((r) => (
              <Box key={r.id} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, mb: 0.5 }}>
                <Chip
                  size="small"
                  label={REPORT_LABEL[r.report_type || 'other'] || 'Other'}
                  variant="outlined"
                  sx={{ height: 18, fontSize: '0.62rem', fontWeight: 700, flexShrink: 0 }}
                />
                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.4 }}>
                  {r.description?.trim() || 'No detail given'}
                </Typography>
              </Box>
            ))}
            {reports.length > 5 && (
              <Typography variant="caption" color="text.secondary">
                and {reports.length - 5} more
              </Typography>
            )}
          </Box>
        )}
      </Paper>
      {toastView}
    </>
  );
}

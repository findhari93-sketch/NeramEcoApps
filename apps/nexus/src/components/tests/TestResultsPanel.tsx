'use client';

/**
 * The data, the run scope and the dialogs behind the Questions and Students
 * tabs of a test.
 *
 * On the test page the page owns the tab and the run, and this stays mounted
 * while a teacher moves between tabs, so switching never costs a second fetch
 * and the run they picked is the run both tabs are about. Mounted on its own
 * (the paper workspace does this) it keeps its own run picker and its own
 * Students/Questions switch, and behaves the same.
 *
 * The chain it wires up is the point:
 *
 *   spot a bad question -> check it with an AI -> fix it -> re-grade the
 *   attempts marked on the old answer -> tell the students whose score moved.
 *
 * Each step hands the next one its recipients, so the teacher is never asked
 * to reconstruct a list the app already knows.
 *
 * It also owns the student selection, so a finished reopen or message clears it.
 * On 11 Sept all 26 students stayed selected after a reopen that had already
 * happened, which reads as "it did not work".
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  IconButton,
  Paper,
  Skeleton,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import GradingOutlinedIcon from '@mui/icons-material/GradingOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import StudentAttemptSheet from '@/components/tests/StudentAttemptSheet';
import TestResultsStudents, {
  type StudentResultRow,
  type StudentResultStats,
} from '@/components/tests/TestResultsStudents';
import TestQuestionsView, {
  type PoolQuestion,
  type QuestionAnalysisRow,
} from '@/components/tests/TestQuestionsView';
import QuestionDoctorDialog from '@/components/tests/QuestionDoctorDialog';
import QuestionEditDialog from '@/components/tests/QuestionEditDialog';
import RegradePreviewDialog from '@/components/tests/RegradePreviewDialog';
import TestMessageDialog, { type MessageRecipient } from '@/components/tests/TestMessageDialog';
import CountAttemptSheet from '@/components/tests/CountAttemptSheet';
import ExamResultsSheet from '@/components/scheduled-exams/ExamResultsSheet';
import StudentAvatar from '@/components/students/StudentAvatar';
import { excusedLabel, isResultFilter, type ResultFilter } from '@/lib/test-result-filters';
import {
  DEFAULT_QUESTION_FILTERS,
  QUESTION_FILTER_PARAMS,
  questionFiltersFromParams,
  questionFiltersToParams,
  type QuestionFilters,
} from '@/lib/question-filters';
import { formatReopenUntil } from '@/lib/reopen-deadline';
import type { TestMessageTemplate } from '@/lib/test-message-templates';

/**
 * The exam a run belongs to, and the only thing on this screen that decides
 * whether students can see anything at all. Null on every other door: a class
 * test and an assigned paper show a student their answers the moment they
 * submit, and only an exam holds them back.
 */
interface RunExam {
  id: string;
  title: string | null;
  results_state: string;
  results_published_at: string | null;
  closes_at: string | null;
}

interface RunSummary {
  placement_id: string | null;
  door: 'practice' | 'class' | 'exam' | 'other';
  context_type: string | null;
  label: string;
  opens_at: string | null;
  closes_at: string | null;
  attempts: number;
  is_active: boolean;
}

const BUCKET_LABELS: Record<string, string> = {
  mandatory_attended: 'In the class',
  mandatory_caught_up: 'Caught up later',
  excused_pending_catchup: 'Still catching up, not required yet',
  excused_new_joiner: 'Joined after this class',
  teacher_override_mandatory: 'Required by you',
  teacher_override_excused: 'Excused by you',
};

const STATUS_TEXT: Record<string, string> = {
  submitted: '',
  in_progress: 'In progress',
  not_started: 'Not started',
  missed: 'Missed the date',
  excused: 'Not required',
};

const NO_POOL: PoolQuestion[] = [];

/** What the re-grade banner needs to say, once a fix has landed. */
interface StaleNotice {
  answerKeyChanged: number;
  staleAttempts: number;
}

interface Notice {
  text: string;
  /** Offer to show the questions an AI just fixed. */
  showFixed?: boolean;
}

function freshQuestionFilters(): QuestionFilters {
  if (typeof window === 'undefined') return { ...DEFAULT_QUESTION_FILTERS, pct: [0, 100] };
  const params = new URL(window.location.href).searchParams;
  return questionFiltersFromParams((k) => params.get(k));
}

export default function TestResultsPanel({
  testId,
  authFetch,
  getToken,
  getTeacherToken,
  view: controlledView,
  runId: controlledRunId,
  onRunIdChange,
  onRunLabelChange,
  initialRunId = '',
  initialFilter,
  testTitle,
  pool = NO_POOL,
  onQuestionsChanged,
}: {
  testId: string;
  authFetch: (url: string, init?: RequestInit) => Promise<any>;
  /** For the response sheet drawer, which fetches directly rather than via authFetch. */
  getToken: () => Promise<string | null>;
  /**
   * The teacher's Graph token, whose scopes carry the Teams chat permissions.
   * Messages go out with it; getToken's base scopes cannot open a 1:1 chat, which
   * is why a class send on 11 Sept reached no student's Teams chat. Omitted (the
   * paper workspace), the base token is used and the receipt says what failed.
   */
  getTeacherToken?: () => Promise<string | null>;
  /** Which tab the page is on. Omitted, the panel shows its own switch. */
  view?: 'questions' | 'students';
  /** The run both tabs report on, when the page owns it. Empty means all time. */
  runId?: string;
  onRunIdChange?: (runId: string) => void;
  /**
   * How the run picker names the selected run, lifted for anything outside the
   * panel that has to say which run it means. The health banner sits above the
   * tabs, and a problem copied out of it is much harder to act on without it.
   */
  onRunLabelChange?: (label: string | null) => void;
  /** The run to start on when the panel owns the run itself. */
  initialRunId?: string;
  /** Open straight onto one group of students, from a shared or bookmarked link. */
  initialFilter?: string;
  /**
   * The paper's own name, for anything a student reads.
   *
   * The run LABEL ("Exam: Indus Valley, 18 Aug") is internal vocabulary that
   * belongs in the run picker. A message telling somebody to redo "Exam: Indus
   * Valley, 18 Aug" names a scheduling row at them; the paper is what they sat.
   */
  testTitle?: string;
  /**
   * The paper's questions as the test holds them, text and answers included.
   * Omitted, the questions list is built from the analysis rows alone.
   */
  pool?: PoolQuestion[];
  /** A question was edited here, so the page's copy of the paper is stale. */
  onQuestionsChanged?: () => void;
}) {
  const [ownView, setOwnView] = useState<'questions' | 'students'>('students');
  const [ownRunId, setOwnRunId] = useState(initialRunId);
  const view = controlledView ?? ownView;
  const runId = controlledRunId ?? ownRunId;

  const changeRun = (next: string) => {
    if (controlledRunId === undefined) setOwnRunId(next);
    onRunIdChange?.(next);
  };

  const [rows, setRows] = useState<StudentResultRow[] | null>(null);
  const [questions, setQuestions] = useState<QuestionAnalysisRow[]>([]);
  const [stats, setStats] = useState<StudentResultStats | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [runExam, setRunExam] = useState<RunExam | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [scoreShown, setScoreShown] = useState<'first' | 'best'>('best');
  const [filter, setFilter] = useState<ResultFilter>(isResultFilter(initialFilter) ? initialFilter : 'all');
  const [qFilters, setQFilters] = useState<QuestionFilters>(freshQuestionFilters);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [sheet, setSheet] = useState<{ list: StudentResultRow[]; index: number } | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  // Dialog state. Each one is opened by the step before it.
  const [doctorIds, setDoctorIds] = useState<string[] | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [regradeOpen, setRegradeOpen] = useState(false);
  const [stale, setStale] = useState<StaleNotice | null>(null);
  const [message, setMessage] = useState<{
    recipients: MessageRecipient[];
    template: TestMessageTemplate;
    mode: 'reopen' | 'message';
  } | null>(null);
  const [countFor, setCountFor] = useState<StudentResultRow | null>(null);

  const scoredRun = useRef<string | null>(null);

  /** authFetch, but carrying the token that can post to Teams as the teacher. */
  const teacherFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      if (!getTeacherToken) return authFetch(url, init);
      const token = await getTeacherToken();
      if (!token) throw new Error('Not signed in');
      const res = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
          ...(init?.headers || {}),
        },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Request failed');
      }
      return res.json();
    },
    [authFetch, getTeacherToken],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = runId ? `?placement_id=${encodeURIComponent(runId)}` : '';
      const json = await authFetch(`/api/question-bank/tests/${testId}/results${qs}`);
      setRows(json.data?.rows || []);
      setQuestions(json.data?.questions || []);
      setStats(json.data?.stats || null);
      setRuns(json.data?.runs || []);
      setRunExam(json.data?.run?.exam ?? null);
      setError(null);
      // A dated run is about what the class knew on the day, so it leads with
      // the first sitting. An always-open practice pool has no such day. Set
      // once per run, so a reload after a reopen keeps the teacher's choice.
      if (scoredRun.current !== runId) {
        scoredRun.current = runId;
        const door = json.data?.run?.door;
        setScoreShown(door === 'class' || door === 'exam' ? 'first' : 'best');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load results');
      setRows((prev) => prev ?? []);
    } finally {
      setLoading(false);
    }
  }, [authFetch, testId, runId]);

  useEffect(() => {
    load();
  }, [load]);

  // A selection belongs to one run. Carrying it to another would reopen or
  // message people the teacher picked on a different screen.
  useEffect(() => {
    setSelected(new Set());
  }, [runId]);

  /**
   * Keep the student group and the question filters in the URL.
   *
   * So "the five who did not pass" and "0% questions nobody has checked" are
   * links a teacher can send themselves, and a back press out of a drawer
   * returns to the view they were working through. history.state is carried
   * over because the router keeps its own entry there.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (filter === 'all') url.searchParams.delete('filter');
    else url.searchParams.set('filter', filter);
    const params = questionFiltersToParams(qFilters);
    for (const key of QUESTION_FILTER_PARAMS) {
      const value = params[key];
      if (value == null) url.searchParams.delete(key);
      else url.searchParams.set(key, value);
    }
    window.history.replaceState(window.history.state, '', url.toString());
  }, [filter, qFilters]);

  const isRunScoped = Boolean(stats?.roster_total);
  const currentRun = useMemo(() => runs.find((r) => r.placement_id === runId) || null, [runs, runId]);

  useEffect(() => {
    onRunLabelChange?.(currentRun?.label ?? null);
  }, [currentRun, onRunLabelChange]);

  async function setAccess(studentId: string, action: 'open' | 'close') {
    if (!runId) return;
    setActing(studentId);
    try {
      await authFetch(`/api/tests/runs/${runId}/access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, action }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change access');
    } finally {
      setActing(null);
    }
  }

  async function decide(studentId: string, decision: 'granted' | 'declined') {
    if (!runId) return;
    setActing(studentId);
    try {
      const live = await authFetch(`/api/tests/runs/${runId}/access`);
      const mine = (live.data?.requests || []).find(
        (r: any) => r.student_id === studentId && r.status === 'pending',
      );
      if (mine) {
        await authFetch(`/api/tests/runs/${runId}/access`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ request_id: mine.id, decision }),
        });
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not answer that request');
    } finally {
      setActing(null);
    }
  }

  async function undoCount(row: StudentResultRow) {
    if (!runId) return;
    setActing(row.student_id);
    try {
      await authFetch(`/api/tests/runs/${runId}/credits?student_id=${encodeURIComponent(row.student_id)}`, {
        method: 'DELETE',
      });
      setNotice({ text: `No longer counting ${row.student_name || 'their'} own attempt.` });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not undo that count');
    } finally {
      setActing(null);
    }
  }

  /**
   * Students a teacher reopened who turn out to have sat it inside the window.
   *
   * On 11 Sept Samruddhi and Inaya were reopened while the exam already had
   * their sitting through Study Materials. Their window is not closed silently:
   * the teacher opened it, so the teacher is shown it and closes it.
   */
  const reopenedButSat = (rows || []).filter((r) => r.window_open_until && r.sat_via === 'window');

  async function closeReopens(target: StudentResultRow[]) {
    if (!runId || target.length === 0) return;
    setActing('bulk');
    try {
      await authFetch(`/api/tests/runs/${runId}/access/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_ids: target.map((r) => r.student_id), action: 'close' }),
      });
      setNotice({ text: `Closed the reopen for ${target.length} student${target.length === 1 ? '' : 's'}.` });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not close those reopens');
    } finally {
      setActing(null);
    }
  }

  function exportCsv() {
    const header = [
      'Student',
      'Group',
      'Status',
      'Attempts',
      'First %',
      'First marks',
      'Best %',
      'Best marks',
      'Passed',
      'First attempt at',
      'Last attempt at',
      'Self-study attempts',
      'Self-study best %',
      'Reason given',
      'Their note',
    ];
    const quote = (s: string | null | undefined) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const marks = (score: number | null, total: number | null) =>
      score == null || total == null ? '' : `${score}/${total}`;
    const lines = [header.join(',')];
    // Walks every row, not the filtered view: the export is the whole run, which
    // is the single most useful thing about it now that non-attempters are in it.
    for (const r of rows || []) {
      lines.push(
        [
          `"${(r.student_name || 'Unknown').replace(/"/g, '""')}"`,
          `"${BUCKET_LABELS[r.bucket || ''] || ''}"`,
          `"${r.status === 'submitted' ? 'Done' : r.status === 'excused' ? excusedLabel(r.bucket, r.excused_note) : STATUS_TEXT[r.status]}"`,
          r.attempts,
          r.first_percentage ?? '',
          marks(r.first_score, r.first_total_marks),
          r.best_percentage ?? '',
          marks(r.best_score, r.best_total_marks),
          r.passed == null ? '' : r.passed ? 'yes' : 'no',
          r.first_submitted_at ?? '',
          r.last_submitted_at ?? '',
          r.elsewhere?.attempts ?? 0,
          r.elsewhere?.best_percentage == null ? '' : Math.round(r.elsewhere.best_percentage),
          quote(r.why?.label ?? (r.request_note ? 'Asked to reopen' : '')),
          quote([r.why?.note, r.request_note].filter(Boolean).join(' / ')),
        ].join(','),
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-results-${testId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function showFixed() {
    setQFilters({ ...DEFAULT_QUESTION_FILTERS, pct: [0, 100], sort: qFilters.sort, ai: 'fixed' });
    if (controlledView === undefined) setOwnView('questions');
    setNotice(null);
  }

  const toRecipients = (list: StudentResultRow[]): MessageRecipient[] =>
    list.map((r) => ({
      id: r.student_id,
      name: r.student_name,
      behind: r.catchup?.state === 'behind',
    }));

  const waiting = (rows || []).filter((r) => r.access_request_pending);
  const sheetRow = sheet ? (sheet.list[sheet.index] ?? null) : null;

  let studentsBody: React.ReactNode;
  if (rows === null) {
    studentsBody = (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Skeleton variant="rectangular" height={72} sx={{ borderRadius: 2 }} />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rectangular" height={56} sx={{ borderRadius: 1.5 }} />
        ))}
      </Box>
    );
  } else if (stats && stats.attempts === 0 && !stats.roster_total) {
    // A run with a roster is never empty, even before anyone sits it: the list
    // of people who have not is exactly what the teacher came for.
    studentsBody = (
      <Paper variant="outlined" sx={{ py: 6, px: 3, textAlign: 'center', borderRadius: 2 }}>
        <GroupsOutlinedIcon sx={{ fontSize: 44, color: 'text.disabled', mb: 1 }} />
        <Typography variant="body2" color="text.secondary">
          Nobody has sat this test yet. Results appear here as soon as they do.
        </Typography>
      </Paper>
    );
  } else {
    studentsBody = (
      <>
        {waiting.length > 0 && (
          <Alert severity="info" sx={{ mb: 1.5 }}>
            {waiting.length} student{waiting.length !== 1 ? 's' : ''} asked to reopen this test. Approve or decline on
            their row below.
          </Alert>
        )}
        {reopenedButSat.length > 0 && (
          <Alert
            severity="info"
            sx={{ mb: 1.5, alignItems: 'center' }}
            action={
              <Button
                color="inherit"
                disabled={acting === 'bulk'}
                onClick={() => closeReopens(reopenedButSat)}
                sx={{ textTransform: 'none', fontWeight: 700, minHeight: 44 }}
              >
                Close their reopen
              </Button>
            }
          >
            {reopenedButSat.length === 1 ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <StudentAvatar
                  userId={reopenedButSat[0].student_id}
                  name={reopenedButSat[0].student_name}
                  src={reopenedButSat[0].avatar_url}
                  size={32}
                />
                <span>
                  {reopenedButSat[0].student_name || '1 student'} is reopened but already sat this inside the
                  window.
                </span>
              </Box>
            ) : (
              `${reopenedButSat.length} students you reopened already sat this inside the window.`
            )}
          </Alert>
        )}
        <TestResultsStudents
          rows={rows}
          stats={stats}
          isRunScoped={isRunScoped}
          runId={runId}
          scoreShown={scoreShown}
          onScoreShownChange={setScoreShown}
          filter={filter}
          onFilterChange={setFilter}
          acting={acting}
          selected={selected}
          onSelectedChange={setSelected}
          onOpenSheet={(row, ordered) => setSheet({ list: ordered, index: ordered.indexOf(row) })}
          onSetAccess={setAccess}
          onDecide={decide}
          onReopen={(list) =>
            setMessage({
              recipients: toRecipients(list),
              // The group the teacher filtered to is the strongest hint at what
              // they mean to say, so the sheet opens on that template rather than
              // making them pick it again.
              template:
                filter === 'not_done' || filter === 'no_reason' || list.every((r) => r.attempts === 0)
                  ? 'missed'
                  : 'redo',
              mode: 'reopen',
            })
          }
          onMessage={(list) =>
            setMessage({
              recipients: toRecipients(list),
              // "Not said why" is the group a teacher filters to in order to
              // ask, so the sheet opens on the message that asks, with its link
              // to the student's "Tell your teacher why".
              template: filter === 'no_reason' ? 'why' : filter === 'not_done' ? 'missed' : 'redo',
              mode: 'message',
            })
          }
          onCountAttempt={(row) => setCountFor(row)}
          onUndoCount={undoCount}
          onExportCsv={exportCsv}
        />
      </>
    );
  }

  return (
    <Box>
      {runs.length > 0 && (
        <TextField
          select
          size="small"
          label="Results from"
          value={runId}
          onChange={(e) => changeRun(e.target.value)}
          SelectProps={{ native: true }}
          InputProps={{ sx: { minHeight: 44, fontSize: 16 } }}
          sx={{ mb: 1.5, minWidth: 260, width: { xs: '100%', sm: 'auto' } }}
        >
          <option value="">Everyone, all time</option>
          {runs.map((r) => (
            <option key={r.placement_id || 'unassigned'} value={r.placement_id || ''}>
              {r.label} ({r.attempts})
            </option>
          ))}
        </TextField>
      )}

      {/* Publishing, on the screen a teacher actually lands on.
          The Conducted card says "Results not published" and links here, and
          until now the only publish button in the product was on the timetable
          exam page, which nothing here linked to. The sheet is unchanged: it
          already knows about exam day, the second sitting and finalising. What
          is new is reaching it, and saying in words what pressing it does. */}
      {runExam && (
        <Alert
          severity={
            runExam.results_state === 'unpublished'
              ? 'warning'
              : runExam.results_state === 'provisional'
                ? 'info'
                : 'success'
          }
          icon={runExam.results_state === 'unpublished' ? <VisibilityOffOutlinedIcon /> : undefined}
          sx={{
            mb: 1.5,
            alignItems: { xs: 'flex-start', sm: 'center' },
            '& .MuiAlert-message': { width: '100%' },
          }}
          data-testid="exam-results-state"
        >
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              alignItems: { xs: 'stretch', sm: 'center' },
              gap: 1.5,
            }}
          >
            <Box sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {runExam.results_state === 'unpublished'
                  ? 'Results not published'
                  : runExam.results_state === 'provisional'
                    ? 'Results are out, marked provisional'
                    : 'Results are final'}
              </Typography>
              <Typography variant="caption" sx={{ display: 'block', mt: 0.25 }}>
                {runExam.results_state === 'unpublished'
                  ? 'Nobody can see their score, their rank or their answers yet. Publishing gives every student their own marks and opens the answers and solutions, and puts one summary card in the class Teams channel.'
                  : runExam.results_state === 'provisional'
                    ? 'Students can see their marks. They stay provisional until the drawings are marked, then press again to finalise.'
                    : `Students have their marks and their answers${
                        runExam.results_published_at ? ` since ${formatDay(runExam.results_published_at)}` : ''
                      }.`}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                Anyone who sits it late, through a reopen or after catching up, is ranked in a separate
                second sitting list. Press the same button again once they are in. The channel is told
                about the exam only once, so nobody is named there for missing the class.
              </Typography>
            </Box>
            <Button
              variant={runExam.results_state === 'unpublished' ? 'contained' : 'outlined'}
              onClick={() => setPublishOpen(true)}
              startIcon={<CampaignOutlinedIcon />}
              data-testid="open-exam-results"
              sx={{
                minHeight: 48,
                flexShrink: 0,
                textTransform: 'none',
                fontWeight: 700,
                width: { xs: '100%', sm: 'auto' },
              }}
            >
              {runExam.results_state === 'unpublished' ? 'Publish results' : 'Review results'}
            </Button>
          </Box>
        </Alert>
      )}

      {runExam && (
        <ExamResultsSheet
          open={publishOpen}
          onClose={() => setPublishOpen(false)}
          examId={runExam.id}
          onPublished={load}
        />
      )}

      {notice && (
        <Alert
          severity="success"
          sx={{ mb: 1.5, alignItems: 'center' }}
          action={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {notice.showFixed && (
                <Button
                  color="inherit"
                  onClick={showFixed}
                  sx={{ textTransform: 'none', fontWeight: 700, minHeight: 44 }}
                >
                  Show fixed
                </Button>
              )}
              <IconButton aria-label="Dismiss" color="inherit" onClick={() => setNotice(null)} sx={{ width: 44, height: 44 }}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
          }
        >
          {notice.text}
        </Alert>
      )}

      {/* The bridge from "fixed the question" to "fix the scores it produced".
          Without it the correction only ever helps future sitters, and the
          people who were marked wrong by the old key stay marked wrong. */}
      {stale && stale.staleAttempts > 0 && (
        <Alert
          severity="warning"
          icon={<GradingOutlinedIcon />}
          sx={{ mb: 1.5 }}
          action={
            <Button
              size="small"
              variant="contained"
              onClick={() => setRegradeOpen(true)}
              sx={{ textTransform: 'none', minHeight: 44 }}
            >
              Re-grade
            </Button>
          }
        >
          {stale.answerKeyChanged} question{stale.answerKeyChanged === 1 ? '' : 's'} changed answer.{' '}
          {stale.staleAttempts} attempt{stale.staleAttempts === 1 ? ' was' : 's were'} marked on the old one.
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 1.5 }} action={<Button onClick={load}>Retry</Button>}>
          {error}
        </Alert>
      )}

      {controlledView === undefined && (
        <ToggleButtonGroup
          size="small"
          exclusive
          value={ownView}
          onChange={(_, v) => v && setOwnView(v)}
          aria-label="Show"
          sx={{ mb: 1.5 }}
        >
          <ToggleButton value="students" sx={{ textTransform: 'none', px: 2, minHeight: 44 }}>
            Students
          </ToggleButton>
          <ToggleButton value="questions" sx={{ textTransform: 'none', px: 2, minHeight: 44 }}>
            Questions
          </ToggleButton>
        </ToggleButtonGroup>
      )}

      {view === 'questions' ? (
        <TestQuestionsView
          pool={pool}
          analysis={questions}
          statsLoading={loading}
          filters={qFilters}
          onFiltersChange={setQFilters}
          onReview={(ids) => setDoctorIds(ids)}
          onEdit={(id) => setEditId(id)}
        />
      ) : (
        studentsBody
      )}

      {/* The drill-down. "7 attempts" was a dead end until this existed. */}
      <StudentAttemptSheet
        open={sheetRow != null}
        endpoint={
          sheetRow
            ? `/api/question-bank/tests/${testId}/attempts/${sheetRow.student_id}${
                runId ? `?placement_id=${encodeURIComponent(runId)}` : ''
              }`
            : ''
        }
        subtitle={currentRun?.label || 'Every attempt, all time'}
        student={
          sheetRow ? { id: sheetRow.student_id, name: sheetRow.student_name, avatar_url: sheetRow.avatar_url } : null
        }
        getToken={getToken}
        onClose={() => setSheet(null)}
        onPrev={() => setSheet((s) => (s && s.index > 0 ? { ...s, index: s.index - 1 } : s))}
        onNext={() => setSheet((s) => (s && s.index < s.list.length - 1 ? { ...s, index: s.index + 1 } : s))}
        hasPrev={Boolean(sheet && sheet.index > 0)}
        hasNext={Boolean(sheet && sheet.index < sheet.list.length - 1)}
      />

      <QuestionDoctorDialog
        open={doctorIds !== null}
        onClose={() => setDoctorIds(null)}
        testId={testId}
        placementId={runId || null}
        questionIds={doctorIds || []}
        stats={questions}
        authFetch={authFetch}
        onApplied={(result) => {
          const checked = result.checked ?? 0;
          setNotice({
            text:
              checked > 0
                ? `Checked ${checked} with AI. ${
                    result.applied > 0 ? `Fixed ${result.applied}.` : 'Nothing needed changing.'
                  }`
                : `Applied ${result.applied} question fix${result.applied === 1 ? '' : 'es'}.`,
            showFixed: result.applied > 0,
          });
          setStale(
            result.answerKeyChanged > 0
              ? { answerKeyChanged: result.answerKeyChanged, staleAttempts: result.staleAttempts }
              : null,
          );
          load();
          onQuestionsChanged?.();
        }}
      />

      <QuestionEditDialog
        open={editId !== null}
        onClose={() => setEditId(null)}
        questionId={editId}
        authFetch={authFetch}
        getToken={getToken}
        onSaved={() => {
          setNotice({ text: 'Question saved.' });
          load();
          onQuestionsChanged?.();
        }}
      />

      <RegradePreviewDialog
        open={regradeOpen}
        onClose={() => setRegradeOpen(false)}
        testId={testId}
        placementId={runId || null}
        authFetch={authFetch}
        onApplied={(movedIds) => {
          setStale(null);
          setNotice({ text: `Re-graded ${movedIds.length} attempt${movedIds.length === 1 ? '' : 's'}.` });
          load();
          // Straight into the composer with exactly the people whose score
          // moved. A number that changes on a student's record without a word
          // from their teacher is how trust in the marking goes.
          if (movedIds.length > 0 && runId) {
            const moved = (rows || []).filter((r) => movedIds.includes(r.student_id));
            setMessage({ recipients: toRecipients(moved), template: 'regraded', mode: 'message' });
          }
        }}
      />

      {runId && (
        <CountAttemptSheet
          open={countFor !== null}
          onClose={() => setCountFor(null)}
          placementId={runId}
          student={countFor ? { id: countFor.student_id, name: countFor.student_name } : null}
          authFetch={authFetch}
          onCounted={(counted) => {
            const row = countFor;
            setCountFor(null);
            const pct = counted.percentage == null ? 'their attempt' : `${Math.round(counted.percentage)}%`;
            setNotice({
              text: `Counted ${pct} for ${row?.student_name || 'them'}.${counted.closedReopen ? ' Their reopen is closed.' : ''}`,
            });
            load();
            // Tell them straight away, the same hand-off as a re-grade: they are
            // the ones writing in to say they already did it.
            if (row) {
              setMessage({ recipients: toRecipients([row]), template: 'counted', mode: 'message' });
            }
          }}
        />
      )}

      {message && runId && (
        <TestMessageDialog
          open
          onClose={() => setMessage(null)}
          mode={message.mode}
          placementId={runId}
          recipients={message.recipients}
          testTitle={testTitle || currentRun?.label || 'this test'}
          passMark={stats?.pass_mark_pct ?? null}
          dueLabel={currentRun?.closes_at ? formatDay(currentRun.closes_at) : null}
          initialTemplate={message.template}
          authFetch={teacherFetch}
          onSent={(summary) => {
            // Done means done: the selection that produced this send is spent.
            setSelected(new Set());
            setNotice({
              text:
                summary.reopened > 0 && summary.closesAt
                  ? `Reopened for ${summary.reopened} until ${formatReopenUntil(summary.closesAt)}. Reached ${summary.reached}.`
                  : `Message sent. Reached ${summary.reached}.`,
            });
            load();
          }}
        />
      )}
    </Box>
  );
}

function formatDay(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

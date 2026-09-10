'use client';

/**
 * Who sat this test, which questions are not doing their job, and what to do
 * about either.
 *
 * Two halves answering two different questions. The student list answers "who
 * needs help". The question list answers "is this paper any good", which is the
 * loop that keeps a growing bank trustworthy: a question almost nobody gets
 * right is usually ambiguous rather than hard, and without surfacing it nobody
 * ever finds it again.
 *
 * Both halves used to stop at surfacing. This file is now the orchestrator that
 * closes them: it owns the data, the run scope and the dialogs, while the two
 * lists (TestResultsStudents, TestResultsQuestions) own their own presentation
 * and selection. The chain it wires up is the point:
 *
 *   spot a bad question -> fix it (by hand or with an AI) -> re-grade the
 *   attempts that were marked on the old answer -> tell the students whose
 *   score moved.
 *
 * Each of those steps hands the next one its recipients, so the teacher is never
 * asked to reconstruct a list the app already knows.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Paper,
  Skeleton,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@neram/ui';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import GradingOutlinedIcon from '@mui/icons-material/GradingOutlined';
import StudentAttemptSheet from '@/components/tests/StudentAttemptSheet';
import TestResultsStudents, { type StudentResultRow } from '@/components/tests/TestResultsStudents';
import TestResultsQuestions, {
  type QuestionAnalysisRow,
} from '@/components/tests/TestResultsQuestions';
import QuestionDoctorDialog from '@/components/tests/QuestionDoctorDialog';
import QuestionEditDialog from '@/components/tests/QuestionEditDialog';
import RegradePreviewDialog from '@/components/tests/RegradePreviewDialog';
import TestMessageDialog, { type MessageRecipient } from '@/components/tests/TestMessageDialog';
import { isResultFilter, type ResultFilter } from '@/lib/test-result-filters';
import type { TestMessageTemplate } from '@/lib/test-message-templates';

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

interface Stats {
  students: number;
  attempts: number;
  average: number | null;
  passed: number;
  roster_total: number | null;
  mandatory: number | null;
  submitted: number | null;
  not_started: number | null;
  missed: number | null;
  excused: number | null;
  average_first: number | null;
  average_first_marks: { score: number; total: number } | null;
  average_best_marks: { score: number; total: number } | null;
  pass_mark_pct: number | null;
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

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, flex: 1, minWidth: 120 }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
        {label}
      </Typography>
      <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
        {value}
      </Typography>
      {hint && (
        <Typography variant="caption" color="text.secondary">
          {hint}
        </Typography>
      )}
    </Paper>
  );
}

/** What the re-grade banner needs to say, once a fix has landed. */
interface StaleNotice {
  answerKeyChanged: number;
  staleAttempts: number;
}

export default function TestResultsPanel({
  testId,
  authFetch,
  getToken,
  initialRunId = '',
  initialFilter,
  testTitle,
}: {
  testId: string;
  authFetch: (url: string, init?: RequestInit) => Promise<any>;
  /** For the response sheet drawer, which fetches directly rather than via authFetch. */
  getToken: () => Promise<string | null>;
  /** Open straight onto one run, for "See results" links from the runs list. */
  initialRunId?: string;
  /** Open straight onto one group, from a shared or bookmarked link. */
  initialFilter?: string;
  /**
   * The paper's own name, for anything a student reads.
   *
   * The run LABEL ("Exam: Indus Valley, 18 Aug") is internal vocabulary that
   * belongs in the run picker. A message telling somebody to redo "Exam: Indus
   * Valley, 18 Aug" names a scheduling row at them; the paper is what they sat.
   */
  testTitle?: string;
}) {
  const [view, setView] = useState<'students' | 'questions'>('students');
  const [rows, setRows] = useState<StudentResultRow[] | null>(null);
  const [questions, setQuestions] = useState<QuestionAnalysisRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [runId, setRunId] = useState<string>(initialRunId);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [scoreShown, setScoreShown] = useState<'first' | 'best'>('best');
  const [filter, setFilter] = useState<ResultFilter>(
    isResultFilter(initialFilter) ? initialFilter : 'all',
  );

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
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const qs = runId ? `?placement_id=${encodeURIComponent(runId)}` : '';
      const json = await authFetch(`/api/question-bank/tests/${testId}/results${qs}`);
      setRows(json.data?.rows || []);
      setQuestions(json.data?.questions || []);
      setStats(json.data?.stats || null);
      setRuns(json.data?.runs || []);
      // A dated run is about what the class knew on the day, so it leads with
      // the first sitting. An always-open practice pool has no such day.
      const door = json.data?.run?.door;
      setScoreShown(door === 'class' || door === 'exam' ? 'first' : 'best');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load results');
      setRows([]);
    }
  }, [authFetch, testId, runId]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Keep the active group in the URL.
   *
   * So "the five who did not pass" is a link a teacher can send themselves, and
   * so a back press out of the response drawer returns to the group they were
   * working through rather than to everyone.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (filter === 'all') url.searchParams.delete('filter');
    else url.searchParams.set('filter', filter);
    window.history.replaceState({}, '', url.toString());
  }, [filter]);

  const isRunScoped = Boolean(stats?.roster_total);
  const currentRun = useMemo(
    () => runs.find((r) => r.placement_id === runId) || null,
    [runs, runId],
  );

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

  async function bulkReopen(studentIds: string[]) {
    if (!runId) return;
    setActing('bulk');
    try {
      const json = await authFetch(`/api/tests/runs/${runId}/access/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_ids: studentIds, action: 'open' }),
      });
      const counts = json.data?.counts;
      // Reported honestly rather than as a blanket success: a partial grant is
      // the case a teacher most needs to know about, because the students it
      // missed will not tell them.
      setNotice(
        counts?.failed
          ? `Reopened for ${counts.ok} of ${counts.requested}. ${counts.failed} could not be opened.`
          : `Reopened for ${counts?.ok ?? studentIds.length} student${(counts?.ok ?? studentIds.length) === 1 ? '' : 's'}.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reopen for those students');
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
    ];
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
          `"${r.status === 'submitted' ? 'Done' : STATUS_TEXT[r.status]}"`,
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

  if (rows === null) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rectangular" height={64} sx={{ borderRadius: 1.5 }} />
        ))}
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" action={<Button onClick={load}>Retry</Button>}>
        {error}
      </Alert>
    );
  }

  // A run with a roster is never empty, even before anyone sits it: the list of
  // people who have not is exactly what the teacher came for.
  if (stats && stats.attempts === 0 && !stats.roster_total) {
    return (
      <Paper variant="outlined" sx={{ py: 6, px: 3, textAlign: 'center', borderRadius: 2 }}>
        <GroupsOutlinedIcon sx={{ fontSize: 44, color: 'text.disabled', mb: 1 }} />
        <Typography variant="body2" color="text.secondary">
          Nobody has sat this test yet. Results appear here as soon as they do.
        </Typography>
      </Paper>
    );
  }

  const flagged = questions.filter((q) => q.needs_review);
  const waiting = (rows || []).filter((r) => r.access_request_pending);
  const notDone = (stats?.not_started ?? 0) + (stats?.missed ?? 0);
  const sheetRow = sheet ? sheet.list[sheet.index] ?? null : null;

  return (
    <Box>
      {runs.length > 0 && (
        <TextField
          select
          size="small"
          label="Showing"
          value={runId}
          onChange={(e) => setRunId(e.target.value)}
          SelectProps={{ native: true }}
          sx={{ mb: 2, minWidth: 240, width: { xs: '100%', sm: 'auto' } }}
          helperText="A run is one scheduled use of this paper: who it is for, when it closes, and how they did."
        >
          <option value="">Everyone, all time</option>
          {runs.map((r) => (
            <option key={r.placement_id || 'unassigned'} value={r.placement_id || ''}>
              {r.label} ({r.attempts})
            </option>
          ))}
        </TextField>
      )}

      {stats && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
          {isRunScoped ? (
            <>
              <StatTile
                label="DONE"
                value={`${stats.submitted ?? 0} of ${stats.mandatory ?? stats.roster_total ?? 0}`}
                hint="of the students this is set for"
              />
              <StatTile
                label="NOT DONE"
                value={String(notDone)}
                hint={`${stats.not_started ?? 0} not started, ${stats.missed ?? 0} missed the date`}
              />
              <StatTile
                label="AVERAGE"
                value={
                  scoreShown === 'first'
                    ? stats.average_first == null
                      ? '-'
                      : `${stats.average_first}%`
                    : stats.average == null
                      ? '-'
                      : `${stats.average}%`
                }
                hint={
                  scoreShown === 'first'
                    ? stats.average_first_marks
                      ? `first attempt, ${stats.average_first_marks.score} of ${stats.average_first_marks.total} marks`
                      : 'first attempt'
                    : stats.average_best_marks
                      ? `best each, ${stats.average_best_marks.score} of ${stats.average_best_marks.total} marks`
                      : 'best score each'
                }
              />
              <StatTile
                label="PASSED"
                value={String(stats.passed)}
                hint={
                  stats.pass_mark_pct == null
                    ? undefined
                    : `pass mark ${Math.round(stats.pass_mark_pct)}%`
                }
              />
            </>
          ) : (
            <>
              <StatTile label="STUDENTS" value={String(stats.students)} />
              <StatTile label="ATTEMPTS" value={String(stats.attempts)} hint="retakes included" />
              <StatTile
                label="AVERAGE"
                value={stats.average == null ? '-' : `${stats.average}%`}
                hint="best score each"
              />
              <StatTile label="PASSED" value={String(stats.passed)} />
            </>
          )}
        </Box>
      )}

      {notice && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      {/* The bridge from "fixed the question" to "fix the scores it produced".
          Without it the correction only ever helps future sitters, and the
          people who were marked wrong by the old key stay marked wrong. */}
      {stale && stale.staleAttempts > 0 && (
        <Alert
          severity="warning"
          icon={<GradingOutlinedIcon />}
          sx={{ mb: 2 }}
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
          {stale.staleAttempts} attempt{stale.staleAttempts === 1 ? ' was' : 's were'} marked on the
          old one.
        </Alert>
      )}

      {waiting.length > 0 && view === 'students' && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {waiting.length} student{waiting.length !== 1 ? 's' : ''} asked to reopen this test.
          Approve or decline on their row below.
        </Alert>
      )}

      {flagged.length > 0 && view === 'students' && (
        <Alert
          severity="warning"
          icon={<WarningAmberOutlinedIcon />}
          sx={{ mb: 2 }}
          action={
            <Button size="small" onClick={() => setView('questions')} sx={{ textTransform: 'none' }}>
              Show me
            </Button>
          }
        >
          {flagged.length} question{flagged.length !== 1 ? 's' : ''} almost nobody got right. Worth a
          read before you blame the class.
        </Alert>
      )}

      <ToggleButtonGroup
        size="small"
        exclusive
        value={view}
        onChange={(_, v) => v && setView(v)}
        sx={{ mb: 2, flexWrap: 'wrap' }}
      >
        <ToggleButton value="students" sx={{ textTransform: 'none', px: 2, minHeight: 40 }}>
          Students
        </ToggleButton>
        <ToggleButton value="questions" sx={{ textTransform: 'none', px: 2, minHeight: 40 }}>
          Question analysis
        </ToggleButton>
      </ToggleButtonGroup>

      {view === 'students' ? (
        <TestResultsStudents
          rows={rows}
          isRunScoped={isRunScoped}
          runId={runId}
          runLabel={currentRun?.label || 'Every attempt, all time'}
          scoreShown={scoreShown}
          onScoreShownChange={setScoreShown}
          filter={filter}
          onFilterChange={setFilter}
          acting={acting}
          onOpenSheet={(row, ordered) =>
            setSheet({ list: ordered, index: ordered.indexOf(row) })
          }
          onSetAccess={setAccess}
          onDecide={decide}
          onBulkReopen={bulkReopen}
          onMessage={(selectedRows) =>
            setMessage({
              recipients: selectedRows.map((r) => ({ id: r.student_id, name: r.student_name })),
              // The group the teacher filtered to is the strongest hint at what
              // they mean to say, so the composer opens on that template rather
              // than making them pick it again.
              template: filter === 'not_done' ? 'missed' : 'redo',
            })
          }
          onExportCsv={exportCsv}
        />
      ) : (
        <TestResultsQuestions
          questions={questions}
          onReview={(ids) => setDoctorIds(ids)}
          onEdit={(id) => setEditId(id)}
        />
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
          sheetRow
            ? {
                id: sheetRow.student_id,
                name: sheetRow.student_name,
                avatar_url: sheetRow.avatar_url,
              }
            : null
        }
        getToken={getToken}
        onClose={() => setSheet(null)}
        onPrev={() => setSheet((s) => (s && s.index > 0 ? { ...s, index: s.index - 1 } : s))}
        onNext={() =>
          setSheet((s) => (s && s.index < s.list.length - 1 ? { ...s, index: s.index + 1 } : s))
        }
        hasPrev={Boolean(sheet && sheet.index > 0)}
        hasNext={Boolean(sheet && sheet.index < sheet.list.length - 1)}
      />

      <QuestionDoctorDialog
        open={doctorIds !== null}
        onClose={() => setDoctorIds(null)}
        testId={testId}
        questionIds={doctorIds || []}
        stats={questions}
        authFetch={authFetch}
        onApplied={(result) => {
          setNotice(
            `Applied ${result.applied} question fix${result.applied === 1 ? '' : 'es'}.`,
          );
          setStale(
            result.answerKeyChanged > 0
              ? { answerKeyChanged: result.answerKeyChanged, staleAttempts: result.staleAttempts }
              : null,
          );
          load();
        }}
      />

      <QuestionEditDialog
        open={editId !== null}
        onClose={() => setEditId(null)}
        questionId={editId}
        authFetch={authFetch}
        getToken={getToken}
        onSaved={() => {
          setNotice('Question saved.');
          load();
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
          setNotice(`Re-graded ${movedIds.length} attempt${movedIds.length === 1 ? '' : 's'}.`);
          load();
          // Straight into the composer with exactly the people whose score
          // moved. A number that changes on a student's record without a word
          // from their teacher is how trust in the marking goes.
          if (movedIds.length > 0 && runId) {
            const moved = (rows || []).filter((r) => movedIds.includes(r.student_id));
            setMessage({
              recipients: moved.map((r) => ({ id: r.student_id, name: r.student_name })),
              template: 'regraded',
            });
          }
        }}
      />

      {message && runId && (
        <TestMessageDialog
          open
          onClose={() => setMessage(null)}
          placementId={runId}
          recipients={message.recipients}
          testTitle={testTitle || currentRun?.label || 'this test'}
          passMark={stats?.pass_mark_pct ?? null}
          dueLabel={currentRun?.closes_at ? formatDay(currentRun.closes_at) : null}
          initialTemplate={message.template}
          authFetch={authFetch}
          onSent={() => load()}
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

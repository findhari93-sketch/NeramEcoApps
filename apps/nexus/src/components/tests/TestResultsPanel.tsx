'use client';

/**
 * Who sat this test, and which questions are not doing their job.
 *
 * Two halves that answer two different questions. The student table answers
 * "who needs help". The question table answers "is this paper any good", which
 * is the loop that keeps a growing bank trustworthy: a question almost nobody
 * gets right is usually ambiguous rather than hard, and without surfacing it
 * nobody ever finds it again.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Chip,
  Skeleton,
  Alert,
  Divider,
  TextField,
  LinearProgress,
  ToggleButton,
  ToggleButtonGroup,
  InputAdornment,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import StudentAvatar from '@/components/students/StudentAvatar';
import StudentAttemptSheet from '@/components/tests/StudentAttemptSheet';

type ResultStatus = 'submitted' | 'in_progress' | 'not_started' | 'missed' | 'excused';

interface ResultRow {
  student_id: string;
  student_name: string | null;
  /** The route has always sent this; the panel simply never asked for it. */
  avatar_url: string | null;
  attempts: number;
  first_percentage: number | null;
  first_score: number | null;
  first_total_marks: number | null;
  first_submitted_at: string | null;
  best_percentage: number | null;
  best_score: number | null;
  best_total_marks: number | null;
  last_percentage: number | null;
  last_submitted_at: string | null;
  passed: boolean | null;
  status: ResultStatus;
  bucket: string | null;
  is_mandatory: boolean | null;
  provisional: boolean;
  window_open_until: string | null;
  access_request_pending: boolean;
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

/**
 * Group headings for the roster, in the order a teacher reads them: the people
 * who were there, then the people who caught up, then the people nothing is
 * owed by yet. Naming the reason a student is excused is what stops the chase
 * list being ignored.
 */
const BUCKET_LABELS: Record<string, string> = {
  mandatory_attended: 'In the class',
  mandatory_caught_up: 'Caught up later',
  excused_pending_catchup: 'Still catching up, not required yet',
  excused_new_joiner: 'Joined after this class',
  teacher_override_mandatory: 'Required by you',
  teacher_override_excused: 'Excused by you',
};

const BUCKET_ORDER = [
  'mandatory_attended',
  'mandatory_caught_up',
  'teacher_override_mandatory',
  'excused_pending_catchup',
  'excused_new_joiner',
  'teacher_override_excused',
];

const STATUS_TEXT: Record<ResultStatus, string> = {
  submitted: '',
  in_progress: 'In progress',
  not_started: 'Not started',
  missed: 'Missed the date',
  excused: 'Not required',
};

interface QuestionRow {
  question_id: string;
  question_text: string | null;
  sort_order: number;
  answered: number;
  correct: number;
  correct_pct: number | null;
  top_wrong_option: { key: string; text: string | null; count: number } | null;
  needs_review: boolean;
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

function formatWhen(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

/**
 * A percentage always travels with the marks it came from.
 *
 * The whole reason this panel was rebuilt: a bare "100%" told a teacher nothing
 * about how many questions that was, or out of what. Never render a percentage
 * without calling this.
 */
function formatScore(pct: number | null, score: number | null, total: number | null): string {
  if (pct == null) return '-';
  const rounded = Math.round(pct);
  if (score == null || total == null || total <= 0) return `${rounded}%`;
  return `${rounded}% (${score}/${total})`;
}

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

export default function TestResultsPanel({
  testId,
  authFetch,
  getToken,
  initialRunId = '',
}: {
  testId: string;
  authFetch: (url: string, init?: RequestInit) => Promise<any>;
  /** For the response sheet drawer, which fetches directly rather than via authFetch. */
  getToken: () => Promise<string | null>;
  /** Open straight onto one run, for "See results" links from the runs list. */
  initialRunId?: string;
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [view, setView] = useState<'students' | 'questions'>('students');
  const [rows, setRows] = useState<ResultRow[] | null>(null);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [runId, setRunId] = useState<string>(initialRunId);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Which number leads each row. First is the honest measure of what a student
  // knew when the paper was set; best is how far they got after retries.
  const [scoreShown, setScoreShown] = useState<'first' | 'best'>('best');
  // Index into the flattened, grouped list, so prev/next walks what the teacher
  // is actually looking at rather than the unsorted rows behind it.
  const [sheetIndex, setSheetIndex] = useState<number | null>(null);
  const [acting, setActing] = useState<string | null>(null);

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

  const filtered = (rows || []).filter((r) =>
    !search.trim() ? true : (r.student_name || '').toLowerCase().includes(search.trim().toLowerCase()),
  );

  const isRunScoped = Boolean(stats?.roster_total);

  /**
   * Grouped rather than filtered, so the whole picture is one scroll. A teacher
   * looking for who to chase should not have to know which tab it hides behind.
   */
  const groups = isRunScoped
    ? BUCKET_ORDER.map((bucket) => ({
        bucket,
        label: BUCKET_LABELS[bucket] || bucket,
        rows: filtered.filter((r) => r.bucket === bucket),
      })).filter((g) => g.rows.length > 0)
    : [{ bucket: '', label: '', rows: filtered }];

  // The reading order on screen, which is what prev/next in the drawer follows.
  const walk = groups.flatMap((g) => g.rows);
  const sheetRow = sheetIndex == null ? null : walk[sheetIndex] ?? null;

  /**
   * Open or close the run for one student.
   *
   * Only offered on a run, because there is no window to open on the paper wide
   * view. Reloads rather than patching the row in place: the status a student
   * ends up in depends on the run's own close time as well as their grant, and
   * recomputing that here would be a second opinion that drifts.
   */
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

  const waiting = (rows || []).filter((r) => r.access_request_pending);

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
    ];
    const marks = (score: number | null, total: number | null) =>
      score == null || total == null ? '' : `${score}/${total}`;
    const lines = [header.join(',')];
    // Walks `rows`, not `filtered`: the export is the whole run, which is the
    // single most useful thing about it now that non-attempters are in there.
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
  const notDone = (stats?.not_started ?? 0) + (stats?.missed ?? 0);

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
                hint={stats.pass_mark_pct == null ? undefined : `pass mark ${Math.round(stats.pass_mark_pct)}%`}
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
          {flagged.length} question{flagged.length !== 1 ? 's' : ''} almost nobody got right. Worth a read before
          you blame the class.
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
        <>
          <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
            <TextField
              size="small"
              placeholder="Search students"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ flex: 1, minWidth: 180 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlinedIcon sx={{ fontSize: 18 }} />
                  </InputAdornment>
                ),
              }}
            />
            {isRunScoped && (
              <ToggleButtonGroup
                size="small"
                exclusive
                value={scoreShown}
                onChange={(_, v) => v && setScoreShown(v)}
                aria-label="Score shown"
              >
                <ToggleButton value="first" sx={{ textTransform: 'none', px: 1.5, minHeight: 44 }}>
                  First attempt
                </ToggleButton>
                <ToggleButton value="best" sx={{ textTransform: 'none', px: 1.5, minHeight: 44 }}>
                  Best attempt
                </ToggleButton>
              </ToggleButtonGroup>
            )}
            <Button
              variant="outlined"
              startIcon={<DownloadOutlinedIcon />}
              onClick={exportCsv}
              sx={{ textTransform: 'none', minHeight: 44 }}
            >
              CSV (all students)
            </Button>
          </Box>

          <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
            {filtered.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
                No student matches that search.
              </Typography>
            ) : (
              groups.map((group) => (
                <Box key={group.bucket || 'all'}>
                  {group.label && (
                    <Box sx={{ px: 1.5, py: 1, bgcolor: 'action.hover' }}>
                      <Typography variant="caption" sx={{ fontWeight: 800, letterSpacing: 0.3 }}>
                        {group.label.toUpperCase()} ({group.rows.length})
                      </Typography>
                    </Box>
                  )}
                  {group.rows.map((r, i) => {
                    const lead =
                      scoreShown === 'first'
                        ? { pct: r.first_percentage, score: r.first_score, total: r.first_total_marks }
                        : { pct: r.best_percentage, score: r.best_score, total: r.best_total_marks };
                    const other =
                      scoreShown === 'first'
                        ? { label: 'Best', pct: r.best_percentage, score: r.best_score, total: r.best_total_marks }
                        : { label: 'First', pct: r.first_percentage, score: r.first_score, total: r.first_total_marks };
                    const sat = r.attempts > 0;

                    return (
                      <Box key={r.student_id}>
                        {i > 0 && <Divider />}
                        <Box
                          role="button"
                          tabIndex={0}
                          aria-label={`See ${r.student_name || 'this student'}'s answers`}
                          onClick={() => setSheetIndex(walk.indexOf(r))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSheetIndex(walk.indexOf(r));
                            }
                          }}
                          sx={{
                            p: 1.5,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1.5,
                            flexWrap: 'wrap',
                            minHeight: 48,
                            cursor: 'pointer',
                            '&:hover': { bgcolor: 'action.hover' },
                            '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
                          }}
                        >
                          <StudentAvatar
                            userId={r.student_id}
                            name={r.student_name}
                            src={r.avatar_url}
                            size={32}
                          />
                          <Box sx={{ flex: 1, minWidth: 140 }}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                              {r.student_name || 'Unknown student'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {sat ? (
                                <>
                                  {scoreShown === 'first' ? 'First' : 'Best'}{' '}
                                  {formatScore(lead.pct, lead.score, lead.total)}
                                  {other.pct != null && other.pct !== lead.pct
                                    ? ` · ${other.label} ${formatScore(other.pct, other.score, other.total)}`
                                    : ''}
                                  {` · ${r.attempts} attempt${r.attempts !== 1 ? 's' : ''}`}
                                  {r.last_submitted_at ? ` · last ${formatWhen(r.last_submitted_at)}` : ''}
                                  {r.provisional ? ' · provisional' : ''}
                                </>
                              ) : (
                                <>
                                  {STATUS_TEXT[r.status]}
                                  {r.window_open_until ? ` · open until ${formatWhen(r.window_open_until)}` : ''}
                                  {r.access_request_pending ? ' · asked to reopen' : ''}
                                </>
                              )}
                            </Typography>
                          </Box>
                          {!isMobile && sat && lead.pct != null && (
                            <Box sx={{ width: 120 }}>
                              <LinearProgress
                                variant="determinate"
                                value={Math.min(100, lead.pct)}
                                color={r.passed === false ? 'warning' : 'success'}
                                sx={{ height: 6, borderRadius: 3 }}
                              />
                            </Box>
                          )}
                          {/* The teacher's half of the reopen flow, right on
                              the row where they noticed the problem. */}
                          {isRunScoped && runId && !sat && (
                            <Box
                              sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {r.access_request_pending ? (
                                <>
                                  <Button
                                    size="small"
                                    variant="contained"
                                    disabled={acting === r.student_id}
                                    onClick={() => decide(r.student_id, 'granted')}
                                    sx={{ textTransform: 'none', minHeight: 44 }}
                                  >
                                    Approve
                                  </Button>
                                  <Button
                                    size="small"
                                    disabled={acting === r.student_id}
                                    onClick={() => decide(r.student_id, 'declined')}
                                    sx={{ textTransform: 'none', minHeight: 44 }}
                                  >
                                    Decline
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  size="small"
                                  disabled={acting === r.student_id}
                                  onClick={() =>
                                    setAccess(r.student_id, r.window_open_until ? 'close' : 'open')
                                  }
                                  sx={{ textTransform: 'none', minHeight: 44 }}
                                >
                                  {r.window_open_until ? 'Close' : 'Open for them'}
                                </Button>
                              )}
                            </Box>
                          )}
                          <Chip
                            size="small"
                            label={
                              sat
                                ? formatScore(lead.pct, lead.score, lead.total)
                                : STATUS_TEXT[r.status]
                            }
                            color={
                              !sat
                                ? r.status === 'missed'
                                  ? 'warning'
                                  : 'default'
                                : r.passed === true
                                  ? 'success'
                                  : r.passed === false
                                    ? 'default'
                                    : 'primary'
                            }
                            sx={{ height: 26, fontWeight: 700, minWidth: 56 }}
                          />
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              ))
            )}
          </Paper>
        </>
      ) : (
        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
          {questions.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
              No answers recorded yet.
            </Typography>
          ) : (
            questions.map((q, i) => (
              <Box key={q.question_id}>
                {i > 0 && <Divider />}
                <Box sx={{ p: 1.75, bgcolor: q.needs_review ? 'warning.light' : 'transparent' }}>
                  <Box sx={{ display: 'flex', gap: 1, mb: 0.75 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', minWidth: 20 }}>
                      {i + 1}
                    </Typography>
                    <Typography variant="body2" sx={{ flex: 1, fontWeight: 500 }}>
                      {q.question_text || 'Question'}
                    </Typography>
                    <Chip
                      size="small"
                      label={q.correct_pct == null ? 'No data' : `${q.correct_pct}%`}
                      color={
                        q.correct_pct == null
                          ? 'default'
                          : q.correct_pct >= 70
                            ? 'success'
                            : q.correct_pct >= 40
                              ? 'warning'
                              : 'error'
                      }
                      sx={{ height: 24, fontWeight: 700, flexShrink: 0 }}
                    />
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {q.correct} of {q.answered} got it right
                    {q.top_wrong_option
                      ? ` · most picked "${q.top_wrong_option.text || q.top_wrong_option.key}" (${q.top_wrong_option.count})`
                      : ''}
                  </Typography>
                  {q.needs_review && (
                    <Typography variant="caption" sx={{ display: 'block', mt: 0.5, fontWeight: 700 }}>
                      Check this question. At this rate it is more likely unclear than hard.
                    </Typography>
                  )}
                </Box>
              </Box>
            ))
          )}
        </Paper>
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
        subtitle={runs.find((r) => r.placement_id === runId)?.label || 'Every attempt, all time'}
        student={
          sheetRow
            ? { id: sheetRow.student_id, name: sheetRow.student_name, avatar_url: sheetRow.avatar_url }
            : null
        }
        getToken={getToken}
        onClose={() => setSheetIndex(null)}
        onPrev={() => setSheetIndex((i) => (i != null && i > 0 ? i - 1 : i))}
        onNext={() => setSheetIndex((i) => (i != null && i < walk.length - 1 ? i + 1 : i))}
        hasPrev={sheetIndex != null && sheetIndex > 0}
        hasNext={sheetIndex != null && sheetIndex < walk.length - 1}
      />
    </Box>
  );
}

'use client';

/**
 * Who sat this test, and what to do about the ones who did not.
 *
 * The numbers at the top ARE the filters. Four stat cards used to sit above
 * both results tabs and do nothing when pressed, while a separate row of chips
 * did the filtering; a teacher reads "Not passed 5" and wants the five.
 *
 * FILTER, then SELECT ALL. "The five who did not pass" and "the twenty-six who
 * never sat it" are two taps rather than twenty-six clicks, and the active
 * filter is written into the URL so the exact view is shareable and survives a
 * back press. A selection carries across filters, so "everyone who has not
 * done it, plus everyone under the pass mark" can be one message.
 *
 * The filter never widens what the run shows: every predicate reads fields the
 * results route already sent, so this is a view over the same rows, not a
 * second opinion about who is on the roster.
 */

import { useMemo, useState } from 'react';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  IconButton,
  LinearProgress,
  Menu,
  MenuItem,
  Paper,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import LockOpenOutlinedIcon from '@mui/icons-material/LockOpenOutlined';
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import StudentAvatar from '@/components/students/StudentAvatar';
import StudentStatFilters, { type StatFilterTile, type StatTone } from '@/components/tests/StudentStatFilters';
import StudentListToolbar, { PausedFootnote } from '@/components/students/list/StudentListToolbar';
import { useStudentListView } from '@/components/students/list/useStudentListView';
import type { ExtraSort, ListAccessors } from '@/lib/student-list-view';
import {
  RESULT_FILTER_EMPTY,
  RESULT_FILTER_LABELS,
  countByResultFilter,
  matchesResultFilter,
  type ResultFilter,
} from '@/lib/test-result-filters';

type ResultStatus = 'submitted' | 'in_progress' | 'not_started' | 'missed' | 'excused';

export interface StudentResultRow {
  student_id: string;
  student_name: string | null;
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
  elsewhere: { attempts: number; best_percentage: number | null; last_at: string | null } | null;
  /**
   * How their sitting on this run was decided: the run's own door, another door
   * inside the window, or a teacher's count. Absent on the paper wide view.
   */
  sat_via?: 'run' | 'window' | 'teacher' | null;
  sat_via_at?: string | null;
  /** A dormant student shown only because they really sat it. Not in any count. */
  paused?: boolean;
}

export interface StudentResultStats {
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
  /** Paused students the server left out entirely (no sitting). */
  paused_hidden?: number;
}

type ScoreSort = 'score_high' | 'score_low';

const ACCESSORS: ListAccessors<StudentResultRow> = {
  id: (r) => r.student_id,
  name: (r) => r.student_name,
};

/** Unscored students always sort after scored ones, whichever direction. */
function scoreSorts(scoreShown: 'first' | 'best'): ExtraSort<StudentResultRow, ScoreSort>[] {
  const pct = (r: StudentResultRow) => (scoreShown === 'first' ? r.first_percentage : r.best_percentage);
  const cmp = (dir: 1 | -1) => (a: StudentResultRow, b: StudentResultRow) => {
    const pa = pct(a);
    const pb = pct(b);
    if (pa == null && pb == null) return 0;
    if (pa == null) return 1;
    if (pb == null) return -1;
    return dir * (pa - pb);
  };
  return [
    { key: 'score_high', label: 'Score high to low', compare: cmp(-1) },
    { key: 'score_low', label: 'Score low to high', compare: cmp(1) },
  ];
}

const FIRST_SORTS = scoreSorts('first');
const BEST_SORTS = scoreSorts('best');
const LIST_URL_KEYS = { q: 'sq', sort: 'ssort', stage: 'sstage', status: 'sstatus' };

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

const TILE_TONES: Record<ResultFilter, StatTone> = {
  all: 'neutral',
  did: 'info',
  not_done: 'warning',
  passed: 'success',
  below_pass: 'error',
  below_avg: 'warning',
};

function formatWhen(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

/** A percentage always travels with the marks it came from. */
function formatScore(pct: number | null, score: number | null, total: number | null): string {
  if (pct == null) return '-';
  const rounded = Math.round(pct);
  if (score == null || total == null || total <= 0) return `${rounded}%`;
  return `${rounded}% (${score}/${total})`;
}

function selfStudyLine(e: { attempts: number; best_percentage: number | null }): string {
  const times = `${e.attempts} time${e.attempts === 1 ? '' : 's'}`;
  return e.best_percentage == null
    ? `Did this paper ${times} on their own`
    : `Did this paper ${times} on their own, best ${Math.round(e.best_percentage)}%`;
}

interface Props {
  rows: StudentResultRow[];
  stats: StudentResultStats | null;
  isRunScoped: boolean;
  runId: string;
  scoreShown: 'first' | 'best';
  onScoreShownChange: (v: 'first' | 'best') => void;
  filter: ResultFilter;
  onFilterChange: (f: ResultFilter) => void;
  acting: string | null;
  /** Owned by the panel, so a finished send can clear it. */
  selected: Set<string>;
  onSelectedChange: (next: Set<string>) => void;
  onOpenSheet: (row: StudentResultRow, ordered: StudentResultRow[]) => void;
  /** Close a live window. Opening always goes through the reopen sheet. */
  onSetAccess: (studentId: string, action: 'open' | 'close') => void;
  onDecide: (studentId: string, decision: 'granted' | 'declined') => void;
  /** Reopen for these students and tell them, in one sheet. */
  onReopen: (rows: StudentResultRow[]) => void;
  onMessage: (rows: StudentResultRow[]) => void;
  /** Count an attempt this student made through another door. */
  onCountAttempt: (row: StudentResultRow) => void;
  onUndoCount: (row: StudentResultRow) => void;
  onExportCsv: () => void;
}

export default function TestResultsStudents({
  rows,
  stats,
  isRunScoped,
  runId,
  scoreShown,
  onScoreShownChange,
  filter,
  onFilterChange,
  acting,
  selected,
  onSelectedChange,
  onOpenSheet,
  onSetAccess,
  onDecide,
  onReopen,
  onMessage,
  onCountAttempt,
  onUndoCount,
  onExportCsv,
}: Props) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [menuEl, setMenuEl] = useState<HTMLElement | null>(null);

  // Group actions only exist on a run: there is no window to open and no class
  // to post to on the paper-wide view.
  const canAct = isRunScoped && Boolean(runId);

  const average = scoreShown === 'first' ? (stats?.average_first ?? null) : (stats?.average ?? null);
  const averageMarks = scoreShown === 'first' ? stats?.average_first_marks : stats?.average_best_marks;
  const passMark = stats?.pass_mark_pct == null ? null : Math.round(stats.pass_mark_pct);

  // The shared student list: ranked search, sort, the stage ring filter, and no
  // dormant students. The result tiles stay this screen's own filter (prefilter);
  // a paused student who really sat it shows only under Everyone, tagged.
  const prefilter = useMemo(
    () => (r: StudentResultRow) => (r.paused ? filter === 'all' : matchesResultFilter(r, filter, { average, scoreShown })),
    [filter, average, scoreShown],
  );
  const keepPaused = useMemo(() => (r: StudentResultRow) => r.paused === true, []);
  const view = useStudentListView<StudentResultRow, ScoreSort>({
    rows,
    accessors: ACCESSORS,
    extraSorts: scoreShown === 'first' ? FIRST_SORTS : BEST_SORTS,
    defaultSort: 'score_high',
    prefilter,
    keepDormant: keepPaused,
    urlKeys: LIST_URL_KEYS,
    storageKey: 'nexus:test-results-students:sort',
  });
  const search = view.query;

  // Counts come off the whole run (after the stage filter), not the search, so a
  // tile does not change its number while somebody types a name. Paused rows are
  // never counted.
  const counts = useMemo(
    () => countByResultFilter(view.staged.filter((r) => !r.paused), { average, scoreShown }),
    [view.staged, average, scoreShown],
  );

  const tiles: StatFilterTile[] = useMemo(() => {
    const counted = view.staged.filter((r) => !r.paused);
    const notStarted = counted.filter((r) => r.status === 'not_started').length;
    const missed = counted.filter((r) => r.status === 'missed').length;
    const hints: Record<ResultFilter, string> = {
      all: isRunScoped ? 'set for this run' : `${stats?.attempts ?? 0} attempts, retakes included`,
      did: `of ${counts.all}`,
      not_done: `${notStarted} not started, ${missed} missed`,
      passed: passMark == null ? 'passed' : `${passMark}% or more`,
      below_pass: passMark == null ? 'sat it, did not pass' : `sat it, under ${passMark}%`,
      below_avg: average == null ? 'no average yet' : `sat it, under ${Math.round(average)}%`,
    };
    const keys: ResultFilter[] = isRunScoped
      ? ['all', 'did', 'not_done', 'passed', 'below_pass', 'below_avg']
      : ['all', 'passed', 'below_pass', 'below_avg'];
    return keys.map((key) => ({
      key,
      label: RESULT_FILTER_LABELS[key],
      value: counts[key],
      hint: hints[key],
      tone: TILE_TONES[key],
    }));
  }, [view.staged, counts, isRunScoped, stats?.attempts, passMark, average]);

  const filtered = view.shown;

  const groups = useMemo(
    () =>
      isRunScoped
        ? BUCKET_ORDER.map((bucket) => ({
            bucket,
            label: BUCKET_LABELS[bucket] || bucket,
            rows: filtered.filter((r) => r.bucket === bucket),
          })).filter((g) => g.rows.length > 0)
        : [{ bucket: '', label: '', rows: filtered }],
    [filtered, isRunScoped],
  );

  /** Reading order on screen, which is what the drawer's prev/next follows. */
  const walk = useMemo(() => groups.flatMap((g) => g.rows), [groups]);

  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.student_id)), [rows, selected]);
  const allShownSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.student_id));
  const someShownSelected = filtered.some((r) => selected.has(r.student_id));
  const selecting = selected.size > 0;

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange(next);
  }

  function toggleAllShown() {
    const next = new Set(selected);
    if (allShownSelected) filtered.forEach((r) => next.delete(r.student_id));
    else filtered.forEach((r) => next.add(r.student_id));
    onSelectedChange(next);
  }

  const summary =
    average == null
      ? null
      : `Average ${Math.round(average)}%${
          averageMarks ? ` (${averageMarks.score} of ${averageMarks.total} marks)` : ''
        }, ${scoreShown === 'first' ? 'first attempt' : 'best attempt each'}${
          passMark == null ? '' : ` · pass mark ${passMark}%`
        }`;

  return (
    <Box>
      <StudentStatFilters tiles={tiles} active={filter} onChange={onFilterChange} />

      <StudentListToolbar view={view} searchLabel="Search students" />

      <Box sx={{ display: 'flex', gap: 1, mb: 0.75, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end' }}>
        {isRunScoped && (
          <ToggleButtonGroup
            size="small"
            exclusive
            value={scoreShown}
            onChange={(_, v) => v && onScoreShownChange(v)}
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
        <IconButton
          aria-label="More student actions"
          onClick={(e) => setMenuEl(e.currentTarget)}
          sx={{ width: 44, height: 44 }}
        >
          <MoreVertIcon />
        </IconButton>
        <Menu anchorEl={menuEl} open={Boolean(menuEl)} onClose={() => setMenuEl(null)}>
          <MenuItem
            onClick={() => {
              setMenuEl(null);
              onExportCsv();
            }}
            sx={{ minHeight: 48, gap: 1 }}
          >
            <DownloadOutlinedIcon fontSize="small" />
            Download CSV (all students)
          </MenuItem>
        </Menu>
      </Box>

      {summary && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          {summary}
        </Typography>
      )}

      {canAct && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minHeight: 44, mb: 0.5 }}>
          <Checkbox
            checked={allShownSelected}
            indeterminate={someShownSelected && !allShownSelected}
            onChange={toggleAllShown}
            disabled={filtered.length === 0}
            inputProps={{
              'aria-label': allShownSelected
                ? `Unselect the ${filtered.length} shown`
                : `Select all ${filtered.length} shown`,
            }}
            sx={{ width: 44, height: 44 }}
          />
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {allShownSelected ? `All ${filtered.length} shown selected` : `Select all ${filtered.length} shown`}
          </Typography>
        </Box>
      )}

      <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: filter !== 'all' ? 1.5 : 0 }}>
              {search.trim() ? 'No student matches that search.' : RESULT_FILTER_EMPTY[filter]}
            </Typography>
            {filter !== 'all' && !search.trim() && (
              <Button onClick={() => onFilterChange('all')} sx={{ textTransform: 'none', minHeight: 44 }}>
                Show everyone
              </Button>
            )}
          </Box>
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
                const isSelected = selected.has(r.student_id);

                return (
                  <Box key={r.student_id}>
                    {i > 0 && <Divider />}
                    <Box
                      role="button"
                      tabIndex={0}
                      aria-label={
                        selecting && canAct
                          ? `Select ${r.student_name || 'this student'}`
                          : `See ${r.student_name || 'this student'}'s answers`
                      }
                      // Once anything is selected a row tap selects, the way a
                      // phone photo grid works. A tap that also opened a
                      // full-screen sheet would make selecting forty students
                      // impossible on a phone.
                      onClick={() => (selecting && canAct ? toggle(r.student_id) : onOpenSheet(r, walk))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          if (selecting && canAct) toggle(r.student_id);
                          else onOpenSheet(r, walk);
                        }
                      }}
                      sx={{
                        p: 1.25,
                        pl: canAct ? 0.5 : 1.5,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.25,
                        flexWrap: 'wrap',
                        minHeight: 56,
                        cursor: 'pointer',
                        bgcolor: isSelected ? 'action.selected' : 'transparent',
                        '&:hover': { bgcolor: 'action.hover' },
                        '&:focus-visible': {
                          outline: '2px solid',
                          outlineColor: 'primary.main',
                          outlineOffset: -2,
                        },
                      }}
                    >
                      {canAct && (
                        <Checkbox
                          checked={isSelected}
                          onChange={() => toggle(r.student_id)}
                          onClick={(e) => e.stopPropagation()}
                          inputProps={{ 'aria-label': `Select ${r.student_name || 'student'}` }}
                          sx={{ width: 44, height: 44 }}
                        />
                      )}
                      <StudentAvatar userId={r.student_id} name={r.student_name} src={r.avatar_url} size={32} />
                      <Box sx={{ flex: 1, minWidth: 140 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                            {r.student_name || 'Unknown student'}
                          </Typography>
                          {r.paused && (
                            <Chip
                              size="small"
                              label="Paused"
                              title="Dormant. Shown because they sat it; not counted in any number above."
                              aria-label="Paused, not counted"
                              sx={{ height: 22, fontWeight: 700, bgcolor: 'action.selected', color: 'text.secondary' }}
                            />
                          )}
                        </Box>
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

                        {/* How the sitting was counted, when it was not the run's
                            own door. Replaces the self-study line, which would
                            otherwise describe the same attempts twice. */}
                        {r.sat_via === 'window' || r.sat_via === 'teacher' ? (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                            <TaskAltOutlinedIcon sx={{ fontSize: 14, color: 'success.main' }} />
                            <Typography variant="caption" sx={{ color: 'success.dark' }}>
                              {r.sat_via === 'window'
                                ? 'Sat it on their own, inside the window'
                                : `Counted from their own attempt${r.sat_via_at ? ` on ${formatWhen(r.sat_via_at)}` : ''}`}
                            </Typography>
                          </Box>
                        ) : (
                          r.elsewhere &&
                          r.elsewhere.attempts > 0 && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                              <MenuBookOutlinedIcon sx={{ fontSize: 14, color: 'info.main' }} />
                              <Typography variant="caption" sx={{ color: 'info.main' }}>
                                {selfStudyLine(r.elsewhere)}
                              </Typography>
                            </Box>
                          )
                        )}
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

                      {/* The per-row reopen stays. Chasing one student should
                          not require selecting anybody. */}
                      {canAct && !selecting && (
                        <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                          {r.access_request_pending ? (
                            <>
                              <Button
                                size="small"
                                variant="contained"
                                disabled={acting === r.student_id}
                                onClick={() => onDecide(r.student_id, 'granted')}
                                sx={{ textTransform: 'none', minHeight: 44 }}
                              >
                                Approve
                              </Button>
                              <Button
                                size="small"
                                disabled={acting === r.student_id}
                                onClick={() => onDecide(r.student_id, 'declined')}
                                sx={{ textTransform: 'none', minHeight: 44 }}
                              >
                                Decline
                              </Button>
                            </>
                          ) : r.sat_via === 'teacher' ? (
                            <Button
                              size="small"
                              disabled={acting === r.student_id}
                              onClick={() => onUndoCount(r)}
                              aria-label={`Stop counting ${r.student_name || 'this student'}'s own attempt`}
                              sx={{ textTransform: 'none', minHeight: 44 }}
                            >
                              Undo count
                            </Button>
                          ) : (
                            <>
                              {!sat && r.elsewhere && r.elsewhere.attempts > 0 && (
                                <Button
                                  size="small"
                                  variant="outlined"
                                  disabled={acting === r.student_id}
                                  onClick={() => onCountAttempt(r)}
                                  aria-label={`Count ${r.student_name || 'this student'}'s own attempt`}
                                  sx={{ textTransform: 'none', minHeight: 44 }}
                                >
                                  Count their attempt
                                </Button>
                              )}
                              {/* Opening goes through the reopen sheet, so a
                                  single student is told when it closes too. */}
                              <Button
                                size="small"
                                disabled={acting === r.student_id}
                                startIcon={
                                  r.window_open_until ? undefined : <LockOpenOutlinedIcon sx={{ fontSize: 16 }} />
                                }
                                onClick={() =>
                                  r.window_open_until ? onSetAccess(r.student_id, 'close') : onReopen([r])
                                }
                                aria-label={
                                  r.window_open_until
                                    ? `Close this test for ${r.student_name || 'this student'}`
                                    : `Open this test for ${r.student_name || 'this student'}`
                                }
                                sx={{ textTransform: 'none', minHeight: 44 }}
                              >
                                {r.window_open_until ? 'Close' : sat ? 'Open again' : 'Open for them'}
                              </Button>
                            </>
                          )}
                        </Box>
                      )}

                      <Chip
                        size="small"
                        label={sat ? formatScore(lead.pct, lead.score, lead.total) : STATUS_TEXT[r.status]}
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

      <PausedFootnote count={(stats?.paused_hidden ?? 0) + view.pausedHidden} />

      {canAct && selecting && (
        <Box
          role="region"
          aria-label="Selected students"
          sx={{
            position: 'sticky',
            bottom: 0,
            zIndex: 2,
            mt: 1.5,
            display: 'flex',
            gap: 1,
            alignItems: 'center',
            flexWrap: 'wrap',
            p: 1.5,
            pb: 'calc(12px + env(safe-area-inset-bottom))',
            bgcolor: 'background.paper',
            borderTop: `1px solid ${theme.palette.divider}`,
            boxShadow: '0 -6px 16px rgba(15, 23, 42, 0.06)',
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 700, flex: isMobile ? '1 1 100%' : '0 0 auto' }}>
            {selected.size} selected
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => onSelectedChange(new Set())} sx={{ minHeight: 48, textTransform: 'none' }}>
            Clear
          </Button>
          {/* Reopen leads: it now carries the message with it. Message alone is
              for a changed score or a count, where no door needs opening. */}
          <Button
            variant="outlined"
            startIcon={<ChatOutlinedIcon />}
            onClick={() => onMessage(selectedRows)}
            sx={{ minHeight: 48, textTransform: 'none' }}
          >
            Message ({selected.size})
          </Button>
          <Button
            variant="contained"
            startIcon={<LockOpenOutlinedIcon />}
            onClick={() => onReopen(selectedRows)}
            sx={{ minHeight: 48, textTransform: 'none' }}
          >
            Reopen ({selected.size})
          </Button>
        </Box>
      )}
    </Box>
  );
}

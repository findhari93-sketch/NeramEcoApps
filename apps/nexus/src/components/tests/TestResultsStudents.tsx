'use client';

/**
 * Who sat this test, and what to do about the ones who did not.
 *
 * The list itself is unchanged: grouped by eligibility bucket, first-or-best
 * score, self-study context, and the per-row reopen. What is new is the two
 * things a teacher wanted to do with it and could not.
 *
 * FILTER, then SELECT ALL. "The five who did not pass" and "the twenty-six who
 * never sat it" are two taps rather than twenty-six clicks, and the active
 * filter is written into the URL so the exact view is shareable and survives a
 * back press.
 *
 * The filter never widens what the run shows: every predicate reads fields the
 * results route already sent, so this is a view over the same rows, not a
 * second opinion about who is on the roster.
 */

import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  InputAdornment,
  LinearProgress,
  Paper,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import LockOpenOutlinedIcon from '@mui/icons-material/LockOpenOutlined';
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined';
import StudentAvatar from '@/components/students/StudentAvatar';
import {
  RESULT_FILTER_EMPTY,
  RESULT_FILTER_LABELS,
  countByResultFilter,
  matchesResultFilter,
  visibleResultFilters,
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
}

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
  isRunScoped: boolean;
  runId: string;
  runLabel: string;
  scoreShown: 'first' | 'best';
  onScoreShownChange: (v: 'first' | 'best') => void;
  filter: ResultFilter;
  onFilterChange: (f: ResultFilter) => void;
  acting: string | null;
  onOpenSheet: (row: StudentResultRow, ordered: StudentResultRow[]) => void;
  onSetAccess: (studentId: string, action: 'open' | 'close') => void;
  onDecide: (studentId: string, decision: 'granted' | 'declined') => void;
  onBulkReopen: (studentIds: string[]) => void;
  onMessage: (rows: StudentResultRow[]) => void;
  onExportCsv: () => void;
}

export default function TestResultsStudents({
  rows,
  isRunScoped,
  runId,
  scoreShown,
  onScoreShownChange,
  filter,
  onFilterChange,
  acting,
  onOpenSheet,
  onSetAccess,
  onDecide,
  onBulkReopen,
  onMessage,
  onExportCsv,
}: Props) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [search, setSearch] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Counts come off the whole run, not the search, so a chip does not change
  // its number while somebody types a name.
  const counts = useMemo(() => countByResultFilter(rows), [rows]);
  const chips = useMemo(() => visibleResultFilters(counts), [counts]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        matchesResultFilter(r, filter) &&
        (!term || (r.student_name || '').toLowerCase().includes(term)),
    );
  }, [rows, filter, search]);

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

  const selectedRows = useMemo(
    () => rows.filter((r) => selected.has(r.student_id)),
    [rows, selected],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllShown() {
    setSelected(new Set(filtered.map((r) => r.student_id)));
  }

  function clearSelection() {
    setSelecting(false);
    setSelected(new Set());
  }

  return (
    <Box>
      {/* Filter chips. Horizontally scrollable rather than wrapped, so the row
          stays one line on a 375px screen instead of eating the fold. */}
      <Box
        sx={{
          display: 'flex',
          gap: 1,
          mb: 1.5,
          overflowX: 'auto',
          pb: 0.5,
          '&::-webkit-scrollbar': { height: 4 },
        }}
      >
        {chips.map((f) => (
          <Chip
            key={f}
            label={`${RESULT_FILTER_LABELS[f]} ${counts[f]}`}
            onClick={() => onFilterChange(f)}
            color={filter === f ? 'primary' : 'default'}
            variant={filter === f ? 'filled' : 'outlined'}
            sx={{ fontWeight: 700, height: 36, flexShrink: 0, cursor: 'pointer' }}
          />
        ))}
      </Box>

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
        <Button
          variant="outlined"
          startIcon={<DownloadOutlinedIcon />}
          onClick={onExportCsv}
          sx={{ textTransform: 'none', minHeight: 44 }}
        >
          CSV (all students)
        </Button>
      </Box>

      {/* Group actions only exist on a run: there is no window to open and no
          class to post to on the paper-wide view. */}
      {isRunScoped && runId && (
        <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
          <Button
            size="small"
            onClick={() => (selecting ? clearSelection() : setSelecting(true))}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            {selecting ? 'Cancel selecting' : 'Select students'}
          </Button>
          {selecting && filtered.length > 0 && (
            <Button
              size="small"
              variant="outlined"
              onClick={selectAllShown}
              sx={{ textTransform: 'none', minHeight: 44 }}
            >
              Select all {filtered.length} shown
            </Button>
          )}
        </Box>
      )}

      <Paper
        variant="outlined"
        sx={{ borderRadius: 2, overflow: 'hidden', mb: selecting && selected.size > 0 ? 10 : 0 }}
      >
        {filtered.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
            {search.trim() ? 'No student matches that search.' : RESULT_FILTER_EMPTY[filter]}
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
                    ? {
                        label: 'Best',
                        pct: r.best_percentage,
                        score: r.best_score,
                        total: r.best_total_marks,
                      }
                    : {
                        label: 'First',
                        pct: r.first_percentage,
                        score: r.first_score,
                        total: r.first_total_marks,
                      };
                const sat = r.attempts > 0;
                const isSelected = selected.has(r.student_id);

                return (
                  <Box key={r.student_id}>
                    {i > 0 && <Divider />}
                    <Box
                      role="button"
                      tabIndex={0}
                      aria-label={
                        selecting
                          ? `Select ${r.student_name || 'this student'}`
                          : `See ${r.student_name || 'this student'}'s answers`
                      }
                      // In selection mode the row selects rather than opening
                      // the drawer. A checkbox press that also opened a
                      // full-screen sheet would make selecting forty students
                      // impossible on a phone.
                      onClick={() => (selecting ? toggle(r.student_id) : onOpenSheet(r, walk))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          if (selecting) toggle(r.student_id);
                          else onOpenSheet(r, walk);
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
                        bgcolor: isSelected ? 'action.selected' : 'transparent',
                        '&:hover': { bgcolor: 'action.hover' },
                        '&:focus-visible': {
                          outline: '2px solid',
                          outlineColor: 'primary.main',
                          outlineOffset: -2,
                        },
                      }}
                    >
                      {selecting && (
                        <Checkbox
                          checked={isSelected}
                          onChange={() => toggle(r.student_id)}
                          onClick={(e) => e.stopPropagation()}
                          inputProps={{ 'aria-label': `Select ${r.student_name || 'student'}` }}
                          sx={{ p: 0.5 }}
                        />
                      )}
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
                              {r.window_open_until
                                ? ` · open until ${formatWhen(r.window_open_until)}`
                                : ''}
                              {r.access_request_pending ? ' · asked to reopen' : ''}
                            </>
                          )}
                        </Typography>

                        {r.elsewhere && r.elsewhere.attempts > 0 && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                            <MenuBookOutlinedIcon sx={{ fontSize: 14, color: 'info.main' }} />
                            <Typography variant="caption" sx={{ color: 'info.main' }}>
                              {selfStudyLine(r.elsewhere)}
                            </Typography>
                          </Box>
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

                      {/* The per-row reopen stays exactly as it was. Selection
                          is an addition, never a replacement: chasing one
                          student should not require entering a mode. */}
                      {isRunScoped && runId && !selecting && (
                        <Box
                          sx={{ display: 'flex', gap: 1, flexShrink: 0 }}
                          onClick={(e) => e.stopPropagation()}
                        >
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
                          ) : (
                            <Button
                              size="small"
                              disabled={acting === r.student_id}
                              startIcon={
                                r.window_open_until ? undefined : (
                                  <LockOpenOutlinedIcon sx={{ fontSize: 16 }} />
                                )
                              }
                              onClick={() =>
                                onSetAccess(r.student_id, r.window_open_until ? 'close' : 'open')
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

      {selecting && selected.size > 0 && (
        <Box
          sx={{
            position: 'sticky',
            bottom: 0,
            zIndex: 2,
            display: 'flex',
            gap: 1,
            alignItems: 'center',
            flexWrap: 'wrap',
            p: 1.5,
            pb: `calc(12px + env(safe-area-inset-bottom))`,
            bgcolor: 'background.paper',
            borderTop: `1px solid ${theme.palette.divider}`,
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 700, flex: isMobile ? '1 1 100%' : '0 0 auto' }}>
            {selected.size} selected
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Button
            variant="outlined"
            startIcon={<LockOpenOutlinedIcon />}
            onClick={() => onBulkReopen([...selected])}
            sx={{ minHeight: 48, textTransform: 'none' }}
          >
            Reopen ({selected.size})
          </Button>
          <Button
            variant="contained"
            startIcon={<ChatOutlinedIcon />}
            onClick={() => onMessage(selectedRows)}
            sx={{ minHeight: 48, textTransform: 'none' }}
          >
            Message ({selected.size})
          </Button>
        </Box>
      )}
    </Box>
  );
}

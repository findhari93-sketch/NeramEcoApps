'use client';

/**
 * One test, as a student sees it.
 *
 * Extracted from /student/tests when My tests grew folders and a delete, so that
 * the papers a student built for themselves and the papers their teacher set
 * render as the SAME object with the same chips and the same disabled reasons.
 * Forking it would have produced a second, quietly worse card for the section
 * students use most. See the tests hub for what that costs.
 *
 * The extras are opt-in and off by default: without `onMenu` there is no kebab,
 * without `selectable` there is no checkbox, so every existing caller renders
 * exactly what it rendered before.
 */

import { Box, Typography, Button, Paper, Chip, LinearProgress, Checkbox, IconButton } from '@neram/ui';
import MoreVertOutlinedIcon from '@mui/icons-material/MoreVertOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import ClassOutlinedIcon from '@mui/icons-material/ClassOutlined';
import { NEXUS_TEST_KIND_LABELS, type NexusTestKind } from '@neram/database';

export type TestStatus = 'open' | 'upcoming' | 'closed' | 'done';

export interface StudentTest {
  id: string;
  title: string;
  description: string | null;
  folder_id?: string | null;
  folder_label: string | null;
  question_count: number;
  test_type: string;
  test_kind?: string | null;
  duration_minutes: number | null;
  placement_id: string | null;
  placement_context?: string | null;
  passing_pct: number | null;
  available_from: string | null;
  available_until: string | null;
  attempt_limit: number | null;
  attempts: number;
  best_percentage: number | null;
  last_submitted_at: string | null;
  status?: TestStatus;
  /**
   * Class tests only. A SOFT deadline: past it the paper is late, never shut,
   * which is why it is a field of its own rather than available_until. Putting it
   * there would disable the button on the one card a student most needs to open.
   */
  due_at?: string | null;
  required?: boolean | null;
  class_id?: string | null;
  class_title?: string | null;
  /**
   * Scheduled exams only (model tests with a hard window and a published
   * rank). Absent on every ordinary test, so every existing caller renders
   * exactly what it rendered before.
   */
  is_exam?: boolean;
  /** This student is sitting inside a granted makeup window, not the main one. */
  is_makeup?: boolean;
  results_state?: 'unpublished' | 'provisional' | 'final';
  exam_result?: {
    rank: number | null;
    total_ranked: number;
    score: number | null;
    total_marks: number | null;
    percentage: number | null;
    is_provisional: boolean;
    absent: boolean;
  } | null;
}

export function formatWhen(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

/** The one line that tells a student what to do with this card. */
export function windowChip(
  t: StudentTest,
): { label: string; color: 'error' | 'warning' | 'default' | 'success' } | null {
  const now = Date.now();
  // A class test's own deadline comes first, and reads "Overdue" rather than
  // "Closed": the door is still open and the student can still finish it. Saying
  // Closed there would be a lie the Start button immediately contradicts.
  if (t.due_at) {
    const due = new Date(t.due_at).getTime();
    if (!Number.isNaN(due)) {
      if (due < now) return { label: 'Overdue', color: 'error' };
      const hoursLeft = (due - now) / 3600000;
      return {
        label: `Due ${formatWhen(t.due_at)}`,
        color: hoursLeft < 24 ? 'error' : hoursLeft < 72 ? 'warning' : 'default',
      };
    }
  }
  if (t.available_from && new Date(t.available_from).getTime() > now) {
    return { label: `Opens ${formatWhen(t.available_from)}`, color: 'default' };
  }
  if (t.available_until) {
    const until = new Date(t.available_until).getTime();
    if (until < now) return { label: 'Closed', color: 'default' };
    const hoursLeft = (until - now) / 3600000;
    return {
      label: `Due ${formatWhen(t.available_until)}`,
      color: hoursLeft < 24 ? 'error' : hoursLeft < 72 ? 'warning' : 'default',
    };
  }
  return null;
}

/**
 * Where this student's exam result stands. Exam-only, and null on everything
 * else (including an exam not yet attempted with nothing published), so the
 * chip only ever appears when it has something true to say.
 */
export function examResultChip(
  t: StudentTest,
): { label: string; color: 'error' | 'warning' | 'default' | 'success' } | null {
  if (!t.is_exam) return null;
  const r = t.exam_result;
  if (r?.absent) return { label: 'Absent', color: 'error' };
  if (r) {
    const label = `Rank ${r.rank ?? '-'} of ${r.total_ranked}`;
    return r.is_provisional
      ? { label: `${label} · Provisional`, color: 'warning' }
      : { label, color: 'success' };
  }
  // Attempted (status reads 'done') but results_state has not moved past
  // 'unpublished' yet: say so rather than leaving the card silent about it.
  if (t.status === 'done') return { label: 'Result not published yet', color: 'default' };
  return null;
}

export interface StudentTestCardProps {
  test: StudentTest;
  onStart: (t: StudentTest) => void;
  emphasis?: boolean;
  /** Show a checkbox and make the whole card toggle it instead of starting the test. */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  /** Provide to render the overflow kebab. Omit and no kebab appears. */
  onMenu?: (test: StudentTest, anchor: HTMLElement) => void;
}

export default function StudentTestCard({
  test,
  onStart,
  emphasis,
  selectable = false,
  selected = false,
  onToggleSelect,
  onMenu,
}: StudentTestCardProps) {
  const chip = windowChip(test);
  const resultChip = examResultChip(test);
  const notOpenYet = Boolean(test.available_from && new Date(test.available_from).getTime() > Date.now());
  const closed = Boolean(test.available_until && new Date(test.available_until).getTime() < Date.now());
  const outOfAttempts = Boolean(test.attempt_limit && test.attempts >= test.attempt_limit);
  const disabled = notOpenYet || closed || outOfAttempts;

  const toggle = () => onToggleSelect?.(test.id);

  return (
    <Paper
      variant="outlined"
      // In selection mode the whole card is the checkbox target. Asking a thumb
      // to find a 20px box on a 375px screen, once per card, is the difference
      // between clearing ten papers and giving up after three.
      onClick={selectable ? toggle : undefined}
      role={selectable ? 'checkbox' : undefined}
      aria-checked={selectable ? selected : undefined}
      tabIndex={selectable ? 0 : undefined}
      onKeyDown={
        selectable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggle();
              }
            }
          : undefined
      }
      sx={{
        p: emphasis ? 2 : 1.5,
        borderRadius: 2,
        borderColor: selected ? 'primary.main' : emphasis ? 'primary.main' : 'divider',
        borderWidth: selected || emphasis ? 2 : 1,
        bgcolor: selected ? 'action.selected' : undefined,
        cursor: selectable ? 'pointer' : undefined,
        transition: 'background-color 150ms, border-color 150ms',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
        {selectable && (
          <Checkbox
            checked={selected}
            onChange={toggle}
            onClick={(e) => e.stopPropagation()}
            inputProps={{ 'aria-label': `Select ${test.title}` }}
            sx={{ p: 0.5, mt: -0.25 }}
          />
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant={emphasis ? 'subtitle1' : 'body2'} sx={{ fontWeight: 700, lineHeight: 1.3 }}>
            {test.title}
          </Typography>
          {/* The class it came from, when it came from one. A student who owes
              three papers needs to know which lesson each belongs to before they
              can decide what to open. */}
          {test.class_title ? (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}
            >
              <ClassOutlinedIcon sx={{ fontSize: 13 }} />
              {test.class_title}
            </Typography>
          ) : (
            test.folder_label && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}
              >
                <FolderOutlinedIcon sx={{ fontSize: 13 }} />
                {test.folder_label}
              </Typography>
            )
          )}
        </Box>
        {chip && <Chip size="small" label={chip.label} color={chip.color} sx={{ height: 24, flexShrink: 0 }} />}
        {onMenu && !selectable && (
          <IconButton
            aria-label={`More actions for ${test.title}`}
            onClick={(e) => {
              e.stopPropagation();
              onMenu(test, e.currentTarget);
            }}
            sx={{ width: 44, height: 44, mt: -1, mr: -1, flexShrink: 0 }}
          >
            <MoreVertOutlinedIcon fontSize="small" />
          </IconButton>
        )}
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center', mb: 1.5 }}>
        {/* What kind of paper this is. Weekly, model and full read very
            differently to a student and used to be indistinguishable. */}
        {test.test_kind && test.test_kind !== 'classroom_assigned' && (
          <Chip
            size="small"
            color="primary"
            variant="outlined"
            label={NEXUS_TEST_KIND_LABELS[test.test_kind as NexusTestKind] || test.test_kind}
            sx={{ height: 22, fontSize: '0.7rem', fontWeight: 700 }}
          />
        )}
        {/* Only said for a class test, and only when it is optional. "Required"
            on everything else would be noise; "Optional" is the fact that
            changes what a student does next. */}
        {test.required === false && (
          <Chip size="small" variant="outlined" label="Optional" sx={{ height: 22, fontSize: '0.7rem' }} />
        )}
        <Chip
          size="small"
          variant="outlined"
          label={`${test.question_count} questions`}
          sx={{ height: 22, fontSize: '0.7rem' }}
        />
        {test.duration_minutes && (
          <Chip
            size="small"
            variant="outlined"
            label={`${test.duration_minutes} min`}
            sx={{ height: 22, fontSize: '0.7rem' }}
          />
        )}
        {test.passing_pct != null && (
          <Chip
            size="small"
            variant="outlined"
            label={`Pass ${test.passing_pct}%`}
            sx={{ height: 22, fontSize: '0.7rem' }}
          />
        )}
        {test.attempts > 0 && (
          <Chip
            size="small"
            label={`${test.attempts} attempt${test.attempts !== 1 ? 's' : ''}`}
            sx={{ height: 22, fontSize: '0.7rem' }}
          />
        )}
        {/* Exam-only: a granted makeup sitting, and where the result stands.
            Both are opt-in on is_exam, so no other card is affected. */}
        {test.is_exam && test.is_makeup && (
          <Chip size="small" variant="outlined" color="warning" label="Makeup" sx={{ height: 22, fontSize: '0.7rem' }} />
        )}
        {resultChip && (
          <Chip
            size="small"
            label={resultChip.label}
            color={resultChip.color}
            sx={{ height: 22, fontSize: '0.7rem', fontWeight: 700 }}
          />
        )}
      </Box>

      {test.best_percentage != null && (
        <Box sx={{ mb: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            <EmojiEventsOutlinedIcon sx={{ fontSize: 15, color: 'success.main' }} />
            <Typography variant="caption" sx={{ fontWeight: 700 }}>
              Best {Math.round(test.best_percentage)}%
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, test.best_percentage)}
            color={test.passing_pct != null && test.best_percentage >= test.passing_pct ? 'success' : 'primary'}
            sx={{ height: 6, borderRadius: 3 }}
          />
        </Box>
      )}

      {/* Hidden while selecting: a Start button inside a card whose job is to be
          ticked is a trap, and tapping it would take the student out of the
          selection they were halfway through building. */}
      {!selectable && (
        <Button
          fullWidth
          variant={emphasis ? 'contained' : 'outlined'}
          disabled={disabled}
          onClick={() => onStart(test)}
          sx={{ textTransform: 'none', minHeight: 44 }}
        >
          {outOfAttempts
            ? 'No attempts left'
            : notOpenYet
              ? 'Not open yet'
              : closed
                ? 'Closed'
                : test.attempts > 0
                  ? 'Try again'
                  : 'Start'}
        </Button>
      )}
    </Paper>
  );
}

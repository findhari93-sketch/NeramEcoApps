'use client';

/**
 * One test, as a student sees it.
 *
 * Shared by every surface that lists a paper: Class Tests, Exams, and the
 * papers a student built for themselves. Forking it would produce a second,
 * quietly worse card for the section students use most.
 *
 * ONE CARD, ONE ANSWER. The card shows a title, what kind of paper it is, one
 * sentence saying where the student stands, and one button that acts on that
 * sentence. It decides none of it: `test.card` arrives resolved from the server
 * (student-test-card-state.ts). This component used to derive the status four
 * separate ways and could contradict itself, which is how 26 students came to
 * be shown a disabled "Closed" button on a test their teacher had opened for
 * them.
 *
 * THERE IS NO DISABLED BUTTON HERE, and adding one would undo the redesign. A
 * greyed control carrying a refusal states a problem and offers no way out. Where
 * there is nothing to press, `card.action.kind` is 'none' and no button renders.
 *
 * The extras stay opt-in: without `onMenu` there is no kebab, without
 * `selectable` there is no checkbox.
 */

import { Box, Typography, Button, Paper, Chip, LinearProgress, Checkbox, IconButton } from '@neram/ui';
import MoreVertOutlinedIcon from '@mui/icons-material/MoreVertOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import ClassOutlinedIcon from '@mui/icons-material/ClassOutlined';
import FeedbackOutlinedIcon from '@mui/icons-material/FeedbackOutlined';
import { NEXUS_TEST_KIND_LABELS, type NexusTestKind } from '@neram/database';
import type { StudentTestCard as CardState } from '@/lib/student-test-card-state';
import TestStatusStrip from './TestStatusStrip';
import { TELL_WHY_LINK_LABEL } from '@/lib/test-message-templates';

export type TestStatus = 'open' | 'upcoming' | 'closed' | 'done' | 'missed';

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
  due_at?: string | null;
  required?: boolean | null;
  class_id?: string | null;
  class_title?: string | null;
  is_exam?: boolean;
  is_makeup?: boolean;
  /** This student is inside a window opened for them, not the shared one. */
  is_reopen?: boolean;
  access_state?: 'none' | 'pending' | 'granted';
  results_state?: 'unpublished' | 'provisional' | 'final';
  exam_result?: {
    rank: number | null;
    total_ranked: number;
    sitting?: 'main' | 'second';
    score: number | null;
    total_marks: number | null;
    percentage: number | null;
    is_provisional: boolean;
    absent: boolean;
  } | null;
  exam_id?: string | null;
  eligibility_bucket?: string | null;
  eligibility_auto_bucket?: string | null;
  catchup_gate?: {
    blocked: boolean;
    outstanding: Array<{ id: string; title: string | null; date: string }>;
  } | null;
  /** What the student already told their teacher about not sitting it. */
  skip_reason?: { reason_code: string; reason_note: string | null; updated_at: string | null } | null;
  /**
   * The resolved answer. Optional only so a caller mid-migration still renders;
   * every server response carries it.
   */
  card?: CardState | null;
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

/**
 * Where this student's exam result stands, once it is out. Rank is the one fact
 * the sentence cannot carry well, because it is a number a student wants to find
 * at a glance rather than read.
 */
export function examResultChip(
  t: StudentTest,
): { label: string; color: 'error' | 'warning' | 'default' | 'success' } | null {
  if (!t.is_exam) return null;
  const r = t.exam_result;
  if (r?.absent) return null; // the strip already says it, in a full sentence
  if (!r) return null;
  const label = `Rank ${r.rank ?? '-'} of ${r.total_ranked}`;
  return r.is_provisional ? { label: `${label} · Provisional`, color: 'warning' } : { label, color: 'success' };
}

const RAIL: Record<CardState['tone'], string> = {
  urgent: 'error.main',
  attention: 'warning.main',
  positive: 'success.main',
  neutral: 'divider',
};

export interface StudentTestCardProps {
  test: StudentTest;
  onStart: (t: StudentTest) => void;
  emphasis?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  onMenu?: (test: StudentTest, anchor: HTMLElement) => void;
  /** Opt-in: let a new joiner pick their own make-up date. */
  onReschedule?: (test: StudentTest) => void;
  /** Opt-in: let a student ask for a sitting on a door that has shut. */
  onAskTeacher?: (test: StudentTest) => void;
  /** Opt-in: open a finished attempt. Falls back to onStart when absent. */
  onReview?: (test: StudentTest) => void;
  /** Opt-in: where "Go to my catch-up" sends them. */
  onCatchUp?: (href: string) => void;
  /** Opt-in: "Tell your teacher why", on a test they owed and did not sit. */
  onExplain?: (test: StudentTest) => void;
}

export default function StudentTestCard({
  test,
  onStart,
  emphasis,
  selectable = false,
  selected = false,
  onToggleSelect,
  onMenu,
  onReschedule,
  onAskTeacher,
  onReview,
  onCatchUp,
  onExplain,
}: StudentTestCardProps) {
  const card = test.card ?? null;
  const resultChip = examResultChip(test);
  const toggle = () => onToggleSelect?.(test.id);

  // The class it came from, when that is not simply the title again. A student
  // who owes three papers needs to know which lesson each belongs to; printing
  // the title twice tells them nothing.
  const provenance =
    test.class_title && test.class_title !== test.title
      ? { icon: <ClassOutlinedIcon sx={{ fontSize: 13 }} />, label: test.class_title }
      : test.folder_label
        ? { icon: <FolderOutlinedIcon sx={{ fontSize: 13 }} />, label: test.folder_label }
        : null;

  const act = () => {
    if (!card) return onStart(test);
    switch (card.action.kind) {
      case 'catch_up':
        return onCatchUp?.(card.action.href);
      case 'reschedule':
        return onReschedule?.(test);
      case 'ask_teacher':
        return onAskTeacher?.(test);
      case 'review':
        return (onReview ?? onStart)(test);
      default:
        return onStart(test);
    }
  };

  // A button with nowhere to send them is worse than no button. If the caller
  // did not wire this action up, the card stays silent rather than lying.
  const wired =
    !card ||
    (card.action.kind === 'catch_up'
      ? Boolean(onCatchUp)
      : card.action.kind === 'reschedule'
        ? Boolean(onReschedule)
        : card.action.kind === 'ask_teacher'
          ? Boolean(onAskTeacher)
          : true);

  const showButton = !selectable && (!card || (card.action.kind !== 'none' && wired));
  const showWhy = !selectable && Boolean(onExplain);
  const label = card && 'label' in card.action ? card.action.label : 'Start';
  const primary = card ? card.action.kind === 'start' || card.action.kind === 'retry' : true;

  return (
    <Paper
      elevation={0}
      /*
       * In selection mode the whole card is the tap target, because asking a
       * thumb to find a 20px box once per card is the difference between
       * clearing ten papers and giving up after three.
       *
       * A pointer affordance ONLY. The card used to carry role="checkbox" and
       * aria-checked itself, which put a second, unlabelled checkbox around the
       * real one: assistive tech saw two controls for one choice and the outer
       * one had no name. The Checkbox below is the single accessible control,
       * and it is reachable by keyboard on its own.
       */
      onClick={selectable ? toggle : undefined}
      sx={{
        position: 'relative',
        overflow: 'hidden',
        p: 2,
        pl: 2.5,
        borderRadius: 2,
        border: 1,
        borderColor: selected ? 'primary.main' : 'divider',
        bgcolor: selected ? 'action.selected' : 'background.paper',
        cursor: selectable ? 'pointer' : undefined,
        // The rail carries the same tone as the strip, so the card's urgency is
        // legible while scrolling past without reading a word of it.
        '&::before': card
          ? {
              content: '""',
              position: 'absolute',
              insetInlineStart: 0,
              top: 0,
              bottom: 0,
              width: 3,
              bgcolor: RAIL[card.tone],
            }
          : undefined,
        '@media (prefers-reduced-motion: no-preference)': {
          transition: 'background-color 150ms, border-color 150ms, box-shadow 150ms',
        },
        '&:hover': selectable ? undefined : { boxShadow: 1 },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
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
          <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
            {test.title}
          </Typography>
          {provenance && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}
            >
              {provenance.icon}
              {provenance.label}
            </Typography>
          )}
        </Box>
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

      {/* What the paper IS. Facts only: nothing here changes with time or with
          how this student is doing, which is what the strip below is for. */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center', mt: 1 }}>
        {test.test_kind && test.test_kind !== 'classroom_assigned' && (
          <Chip
            size="small"
            color="primary"
            variant="outlined"
            label={NEXUS_TEST_KIND_LABELS[test.test_kind as NexusTestKind] || test.test_kind}
            sx={{ height: 22, fontSize: '0.7rem', fontWeight: 700 }}
          />
        )}
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
        {test.is_exam && test.is_makeup && (
          <Chip size="small" variant="outlined" color="warning" label="Make-up" sx={{ height: 22, fontSize: '0.7rem' }} />
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

      {card && (
        <Box sx={{ mt: 1.5 }}>
          <TestStatusStrip card={card} />
        </Box>
      )}

      {/* Their number, labelled for what it actually is. An exam is sat once, so
          it has a score; a paper they can retake has a best. */}
      {card?.score_percentage != null && (
        <Box sx={{ mt: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, mb: 0.5 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1 }}>
              {Math.round(card.score_percentage)}%
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {card.score_label}
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, card.score_percentage)}
            color={
              test.passing_pct != null && card.score_percentage >= test.passing_pct ? 'success' : 'primary'
            }
            sx={{ height: 6, borderRadius: 3 }}
          />
        </Box>
      )}

      {/*
        Practice on the SAME PAPER through another door.

        A footnote, never the headline, and never counted as an attempt on this
        run. Showing a Study Materials score as the exam's best is exactly the
        confusion this line exists to end.
      */}
      {card?.practice_elsewhere && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          {`You practised this paper ${card.practice_elsewhere.attempts} time${
            card.practice_elsewhere.attempts === 1 ? '' : 's'
          }`}
          {card.practice_elsewhere.best_percentage != null
            ? `, best ${Math.round(card.practice_elsewhere.best_percentage)}%`
            : ''}
          . Practice scores do not count as this test.
        </Typography>
      )}

      {showButton && (
        <Button
          fullWidth
          data-testid="test-card-cta"
          variant={primary && emphasis !== false ? 'contained' : 'outlined'}
          color={card?.action.kind === 'reschedule' ? 'info' : 'primary'}
          onClick={act}
          aria-label={`${label}: ${test.title}`}
          sx={{ textTransform: 'none', minHeight: 44, mt: 2 }}
        >
          {label}
        </Button>
      )}

      {/*
        "Tell your teacher why", BESIDE the one action and visibly quieter than
        it. Asking for another sitting and saying why you missed this one are two
        different things a student may want, and neither replaces the other.
        Rendered only when the page wired it, so it is never a button with
        nowhere to go.
      */}
      {showWhy && card?.why && (
        card.why.given ? (
          <Box
            data-testid="test-card-why-given"
            sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, flexWrap: 'wrap' }}
          >
            <FeedbackOutlinedIcon aria-hidden sx={{ fontSize: 18, color: 'text.secondary' }} />
            <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 160 }}>
              You told your teacher:{' '}
              <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>
                {card.why.given.short_label}
              </Box>
            </Typography>
            <Button
              onClick={() => onExplain?.(test)}
              aria-label={`Change what you told your teacher about ${test.title}`}
              sx={{ textTransform: 'none', minHeight: 44, minWidth: 64 }}
            >
              Change
            </Button>
          </Box>
        ) : (
          <Button
            fullWidth
            data-testid="test-card-why"
            startIcon={<FeedbackOutlinedIcon />}
            onClick={() => onExplain?.(test)}
            aria-label={`Tell your teacher why you did not sit ${test.title}`}
            sx={{ textTransform: 'none', minHeight: 44, mt: showButton ? 1 : 2 }}
          >
            {TELL_WHY_LINK_LABEL}
          </Button>
        )
      )}
    </Paper>
  );
}

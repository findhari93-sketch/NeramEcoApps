'use client';

/**
 * The one component that renders "how long until the exam".
 *
 * It takes the resolved target and calls describeExamCountdown itself, so no
 * caller can word the same fact differently. Three surfaces, four densities, one
 * vocabulary.
 *
 *   inline  student greeting row, while the exam is far out
 *   strip   student dashboard, once it is close enough to earn the space
 *   stat    teacher dashboard, inside the existing StatCard grid
 *   metric  parent dashboard, matching that page's label/value/caption shape
 *
 * Renders nothing when there is no target, or once the exam is more than a week
 * past. "No exam date" is expressed by absence, which is the most honest empty
 * state available and needs no copy. The teacher surface is the exception: they
 * are the only viewer who can fix it, so they get told (see emptyAction).
 */

import { Box, Typography, Paper, Chip, alpha, useTheme, type Theme } from '@neram/ui';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import { useNow } from '@/hooks/useNow';
import StatCard from '@/components/StatCard';
import {
  describeExamCountdown,
  istDayOf,
  type ExamCountdownTarget,
  type ExamCountdownTone,
  type ExamCountdownView,
} from '@/lib/exam-countdown';

/**
 * Re-render every 15 minutes so a dashboard left open overnight does not keep
 * yesterday's number. Always on, not gated on proximity: useNow only installs
 * its visibilitychange re-sync while active, so gating would leave a far-out
 * countdown stale on a restored tab. A timer with no network attached costs
 * nothing, which is why the parent portal's no-polling rule is untouched here.
 */
const TICK_MS = 15 * 60_000;

interface ExamCountdownProps {
  target: ExamCountdownTarget | null;
  variant: 'inline' | 'strip' | 'stat' | 'metric';
  /** Tapping through to the plan. Omit for a non-interactive render. */
  onClick?: () => void;
  /**
   * Teacher only: what to render when there is no target at all. Students and
   * parents get nothing, because they cannot act on it.
   */
  emptyAction?: { label: string; onClick: () => void };
}

/** Resolve a tone to a concrete colour, since StatCard takes a colour not a key. */
function toneColor(theme: Theme, tone: ExamCountdownTone): string {
  switch (tone) {
    case 'urgent':
      return theme.palette.error.main;
    case 'warning':
      return theme.palette.warning.main;
    case 'info':
      return theme.palette.info.main;
    default:
      return theme.palette.primary.main;
  }
}

export default function ExamCountdown({
  target,
  variant,
  onClick,
  emptyAction,
}: ExamCountdownProps) {
  const theme = useTheme();
  const now = useNow(TICK_MS, true);
  const view = describeExamCountdown(target, istDayOf(now));

  if (!view || !view.visible) {
    // Teachers are the only viewer who can link a plan to an exam date, so they
    // are the only one told that it is missing.
    if (variant === 'stat' && emptyAction) {
      return (
        <StatCard
          title="Exam"
          value="Not set"
          icon={<EventAvailableOutlinedIcon />}
          variant="surface"
          color={theme.palette.text.secondary}
          subtitle={emptyAction.label}
          delay={50}
          onClick={emptyAction.onClick}
        />
      );
    }
    return null;
  }

  const color = toneColor(theme, view.tone);

  if (variant === 'stat') {
    return (
      <StatCard
        title={view.short_label}
        // Short form only. StatCard renders the value at 1.4rem/800 and a full
        // sentence wraps to three lines at 375px.
        value={view.value}
        icon={<EventAvailableOutlinedIcon />}
        variant="surface"
        color={color}
        subtitle={view.detail}
        delay={50}
        onClick={onClick}
      />
    );
  }

  if (variant === 'metric') {
    return <ExamCountdownMetric view={view} />;
  }

  if (variant === 'inline') {
    return (
      <Box
        onClick={onClick}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          minHeight: 48,
          flexShrink: 0,
          maxWidth: { xs: '55%', sm: 'none' },
          cursor: onClick ? 'pointer' : 'default',
        }}
      >
        <Chip
          size="small"
          variant="outlined"
          icon={<EventAvailableOutlinedIcon sx={{ fontSize: '0.95rem !important' }} />}
          label={inlineLabel(view)}
          sx={{
            borderColor: alpha(color, 0.4),
            color,
            fontWeight: 600,
            maxWidth: '100%',
            '& .MuiChip-label': {
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            },
          }}
        />
      </Box>
    );
  }

  // strip
  return (
    <Paper
      elevation={0}
      onClick={onClick}
      sx={{
        p: { xs: 1.75, sm: 2 },
        mb: 2,
        borderRadius: 2,
        border: `1px solid ${alpha(color, 0.3)}`,
        bgcolor: alpha(color, 0.07),
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 1.5,
        }}
      >
        <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color }}>
          {view.headline}
        </Typography>
        <Typography
          sx={{ fontWeight: 800, fontSize: '1rem', color, flexShrink: 0, whiteSpace: 'nowrap' }}
        >
          {view.value}
        </Typography>
      </Box>
      <Box
        sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, flexWrap: 'wrap' }}
      >
        <Typography variant="caption" color="text.secondary">
          {view.detail}
        </Typography>
        {view.is_estimate && (
          <Chip
            label="Expected date"
            size="small"
            variant="outlined"
            color="warning"
            sx={{ height: 20, fontSize: '0.62rem' }}
          />
        )}
      </Box>
      {view.note && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mt: 0.5, fontStyle: 'italic' }}
        >
          {view.note}
        </Typography>
      )}
    </Paper>
  );
}

/**
 * Parent portal density. Obeys that page's two hard rules: a count and never a
 * percentage, and an estimate is visually demoted rather than presented as a
 * headline figure. The note rides along because a parent asking "why don't you
 * know?" deserves the answer in the same glance.
 */
function ExamCountdownMetric({ view }: { view: ExamCountdownView }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        Exam
      </Typography>
      <Typography
        sx={{
          fontSize: view.is_estimate ? 16 : 20,
          fontWeight: view.is_estimate ? 600 : 700,
          color: view.is_estimate ? 'text.secondary' : 'text.primary',
          lineHeight: 1.3,
        }}
      >
        {view.value}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {view.is_estimate ? 'expected date, not announced yet' : view.detail}
      </Typography>
      {view.note && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {view.note}
        </Typography>
      )}
    </Box>
  );
}

/**
 * The chip text. Bands whose value is a duration ("6 months") read naturally
 * after "in"; the rest are already complete phrases ("Tomorrow", "Not
 * confirmed") and would read as "in Tomorrow", so they get a colon instead.
 *
 * Decided from the band rather than from where the component is used, so the
 * chip cannot be made ungrammatical by mounting it at the wrong distance.
 */
function inlineLabel(view: ExamCountdownView): string {
  const isDuration =
    view.band === 'far' || view.band === 'weeks' || view.band === 'days' || view.band === 'final_week';
  if (!isDuration) return `${view.short_label}: ${view.value}`;
  const value = view.value.startsWith('About ')
    ? `about ${view.value.slice('About '.length)}`
    : view.value;
  return `${view.short_label} in ${value}`;
}

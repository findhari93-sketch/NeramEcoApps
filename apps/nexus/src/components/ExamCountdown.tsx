'use client';

/**
 * The one component that renders "how long until the exam".
 *
 * It takes the resolved target and calls the formatter itself, so no caller can
 * word the same fact differently. Three surfaces, three densities, one
 * vocabulary.
 *
 *   hero    student dashboard, the motivating timer
 *   stat    teacher dashboard, inside the existing StatCard grid
 *   metric  parent dashboard, matching that page's label/value/caption shape
 *
 * Renders nothing when there is no target, or once the exam is more than a week
 * past. "No exam date" is expressed by absence, which is the most honest empty
 * state available and needs no copy. The teacher surface is the exception: they
 * are the only viewer who can fix it, so they get told (see emptyAction).
 */

import {
  Box,
  Typography,
  Paper,
  Chip,
  LinearProgress,
  alpha,
  useTheme,
  type Theme,
} from '@neram/ui';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import { useNow } from '@/hooks/useNow';
import StatCard from '@/components/StatCard';
import {
  describeExamCountdown,
  describeExamHero,
  istDayOf,
  type ExamCountdownTarget,
  type ExamCountdownTone,
  type ExamCountdownView,
  type ExamHeroView,
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
  variant: 'hero' | 'stat' | 'metric';
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
  const today = istDayOf(now);
  const view = describeExamCountdown(target, today);

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

  const hero = describeExamHero(target, today);
  if (!hero) return null;
  return <ExamCountdownHero hero={hero} color={color} onClick={onClick} />;
}

/**
 * The student's timer. Deliberately NOT a filled gradient block: the "Next Up"
 * Join card below it is the page's single call to action, and two saturated
 * panels stacked would compete for the same eye. A tinted surface carrying one
 * large figure reads as emphasis without stealing the click.
 */
function ExamCountdownHero({
  hero,
  color,
  onClick,
}: {
  hero: ExamHeroView;
  color: string;
  onClick?: () => void;
}) {
  const { view } = hero;
  const interactive = Boolean(onClick);

  return (
    <Paper
      elevation={0}
      onClick={onClick}
      {...(interactive
        ? {
            role: 'button',
            tabIndex: 0,
            'aria-label': `${view.short_label}, ${hero.big} ${hero.unit}. ${view.detail}`,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.();
              }
            },
          }
        : {})}
      sx={{
        p: { xs: 2, sm: 2.5 },
        mb: 2,
        borderRadius: 3,
        border: `1px solid ${alpha(color, 0.28)}`,
        bgcolor: alpha(color, 0.06),
        cursor: interactive ? 'pointer' : 'default',
        transition: 'background-color 200ms ease-out, border-color 200ms ease-out',
        '&:hover': interactive
          ? { bgcolor: alpha(color, 0.1), borderColor: alpha(color, 0.45) }
          : undefined,
        '&:focus-visible': { outline: `2px solid ${color}`, outlineOffset: 2 },
        // Motion preference is an accessibility rule, not a nicety.
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
      }}
    >
      {/* Which exam, and how sure we are of the date */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          mb: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
          <EventAvailableOutlinedIcon sx={{ fontSize: '1rem', color, flexShrink: 0 }} />
          <Typography
            noWrap
            sx={{
              fontWeight: 700,
              fontSize: '0.75rem',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color,
            }}
          >
            {view.short_label}
          </Typography>
        </Box>
        {view.is_estimate && (
          <Chip
            label="Expected date"
            size="small"
            variant="outlined"
            color="warning"
            sx={{ height: 20, fontSize: '0.62rem', flexShrink: 0 }}
          />
        )}
      </Box>

      {/* The figure */}
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
        <Typography
          component="span"
          sx={{
            fontSize: hero.showNumber
              ? { xs: '2.75rem', sm: '3.25rem' }
              : { xs: '1.6rem', sm: '2rem' },
            fontWeight: 800,
            lineHeight: 1,
            color,
            // Stops the figure jittering sideways as it ticks down.
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {hero.big}
        </Typography>
        <Typography
          component="span"
          sx={{ fontWeight: 700, fontSize: '0.95rem', color: alpha(color, 0.85) }}
        >
          {hero.unit}
        </Typography>
      </Box>

      {/* Time draining is more visceral than time remaining */}
      {hero.elapsed_pct !== null && (
        <Box sx={{ mt: 1.75 }}>
          <LinearProgress
            variant="determinate"
            value={hero.elapsed_pct}
            aria-label="Preparation time used"
            sx={{
              height: 6,
              borderRadius: 3,
              bgcolor: alpha(color, 0.15),
              '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 3 },
              '@media (prefers-reduced-motion: reduce)': {
                '& .MuiLinearProgress-bar': { transition: 'none' },
              },
            }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            {hero.elapsed_pct}% of your preparation time is used
          </Typography>
        </Box>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        {view.detail}
      </Typography>

      {hero.motivation && (
        <Typography sx={{ mt: 0.75, fontWeight: 600, fontSize: '0.82rem', lineHeight: 1.5 }}>
          {hero.motivation}
        </Typography>
      )}

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

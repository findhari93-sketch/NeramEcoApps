/**
 * Shared visual language for the timetable views.
 *
 * The approved design was drawn in violet with its own token set. Per the
 * agreed direction we keep its STRUCTURE (radii, tag shapes, row grids, the
 * band geometry) and re-map every colour onto the existing Nexus theme, so
 * Nexus stays consistent with the other three apps and packages/ui is untouched.
 *
 * These helpers take the theme rather than importing it so they work inside
 * both light and dark palettes.
 */
import type { Theme } from '@neram/ui';
import { alpha } from '@neram/ui';

/** Card, button, tag and modal radii lifted from the design. */
export const RADIUS = {
  card: 2, // theme spacing units => 16px
  control: 1.4, // => ~11px
  modal: 2.25, // => 18px
} as const;

export const SHADOW = {
  card: '0 1px 2px rgba(16,32,64,.06)',
  lift: '0 10px 30px rgba(21,101,192,.14)',
} as const;

/** Layout constants from the design, kept exact. */
export const LAYOUT = {
  /** Left day column in the agenda ledger. */
  agendaDayCol: 92,
  /** Day stub beside each planner row. */
  dayStub: 44,
  /** Hour gutter in the grid. */
  gridGutter: 46,
  /** Right-hand editing panel. */
  editPanel: 340,
} as const;

/**
 * Motion that respects the OS reduced-motion setting.
 *
 * The live-class dot and the block pulse are status signals, not decoration,
 * so they stay by default, but anyone who has asked for less movement gets a
 * static indicator instead.
 */
export const REDUCED_MOTION_QUERY = '@media (prefers-reduced-motion: reduce)';

export function pulseAnimation(name: string, duration = '1.6s') {
  return {
    animation: `${name} ${duration} ease-in-out infinite`,
    [REDUCED_MOTION_QUERY]: { animation: 'none' },
  } as const;
}

/** Status to a colour role, one place so every view agrees. */
export function statusColor(theme: Theme, status: string): string {
  switch (status) {
    case 'live':
      return theme.palette.error.main;
    case 'completed':
      return theme.palette.success.main;
    case 'cancelled':
      return theme.palette.grey[400];
    case 'rescheduled':
      return theme.palette.warning.main;
    default:
      return theme.palette.primary.main;
  }
}

/** The design's tinted "lavender" surface, mapped to the Nexus primary. */
export function tintedSurface(theme: Theme, strength = 0.06): string {
  return alpha(theme.palette.primary.main, strength);
}

/** The design's gradient fill for the highlighted (today / live) block. */
export function accentGradient(theme: Theme): string {
  return `linear-gradient(120deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.main} 100%)`;
}

export type TagTone = 'success' | 'error' | 'primary' | 'neutral';

/**
 * Pill tag styling. The design used three tones (green, rose, outline); this
 * adds a primary tone for "Assignment"-style informational tags.
 */
export function tagSx(theme: Theme, tone: TagTone) {
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 0.5,
    px: 1.25,
    py: 0.5,
    borderRadius: 999,
    fontSize: '0.6875rem',
    fontWeight: 600,
    lineHeight: 1.4,
    whiteSpace: 'nowrap' as const,
  };

  switch (tone) {
    case 'success':
      return {
        ...base,
        bgcolor: alpha(theme.palette.success.main, 0.14),
        color: theme.palette.success.dark,
      };
    case 'error':
      return {
        ...base,
        bgcolor: alpha(theme.palette.error.main, 0.1),
        color: theme.palette.error.dark,
      };
    case 'primary':
      return {
        ...base,
        bgcolor: alpha(theme.palette.primary.main, 0.1),
        color: theme.palette.primary.dark,
      };
    default:
      return {
        ...base,
        bgcolor: theme.palette.background.paper,
        color: theme.palette.text.secondary,
        border: `1px solid ${theme.palette.divider}`,
      };
  }
}

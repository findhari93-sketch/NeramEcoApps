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
  /** Right-hand editing panel: floor and ceiling for its flexible share of the row. */
  editPanelMinWidth: 420,
  editPanelMaxWidth: 720,

  // ─── Calendar shell (the Teams-shaped layout) ──────────────────────────────

  /** Mini-calendar rail. Only drawn at lg and up, where the width exists. */
  rail: 248,
  /** The single toolbar row that replaced the old title row plus toolbar. */
  toolbarRow: 52,
  /**
   * App chrome above and below a page's content box, which the calendar has to
   * subtract from the viewport to fill the rest of the screen exactly.
   *
   * These are the FULL-BLEED numbers, i.e. what the teacher/student/parent
   * layouts leave once the timetable route drops its Container padding. Note
   * the two do not change at the same breakpoint: TopBar grows at sm
   * (52 to 56), BottomNav disappears at md, so sm needs its own value or the
   * page picks up a 4px scrollbar on a landscape phone.
   *   xs: TopBar 52 + BottomNav 64 = 116
   *   sm: TopBar 56 + BottomNav 64 = 120
   *   md: TopBar 56                =  56
   */
  shellChrome: { xs: 116, sm: 120, md: 56 },
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

/**
 * A colour for a subject, stable across every view and every session.
 *
 * Used by the cover tile on a class that has ended without any images: the tint
 * plus the subject's initial says "Mathematics, no picture yet" instead of
 * looking like a broken image. Because the same subject always hashes to the
 * same hue, a week reads as bands of subject rather than noise.
 *
 * A hash, not a lookup table, because the subject list is teacher-editable
 * (nexus_class_tags) and a table would silently fall back to grey for anything
 * new. Deterministic, so it cannot mismatch between server and client render.
 */
export function subjectTint(theme: Theme, key: string | null | undefined): { bg: string; fg: string } {
  const trimmed = (key || '').trim();
  if (!trimmed) {
    return {
      bg: alpha(theme.palette.text.primary, 0.05),
      fg: theme.palette.text.disabled,
    };
  }

  const hues = [
    theme.palette.primary,
    theme.palette.secondary,
    theme.palette.success,
    theme.palette.warning,
    theme.palette.info,
    theme.palette.error,
  ];

  let hash = 0;
  const lower = trimmed.toLowerCase();
  for (let i = 0; i < lower.length; i += 1) {
    hash = (hash * 31 + lower.charCodeAt(i)) % 100_000;
  }

  const hue = hues[hash % hues.length];
  return { bg: alpha(hue.main, 0.14), fg: hue.dark };
}

/**
 * The subject a class should be tinted by.
 *
 * course_topic wins over topic, matching the "preferred over topic" note on
 * ClassCardData, and topic.category is nullable so the title is the next best
 * thing. Falling back to the class title means two classes on the same topic
 * still agree even when neither is linked to a topic row.
 */
export function classSubjectKey(cls: {
  title?: string | null;
  topic?: { title?: string | null; category?: string | null } | null;
  course_topic?: { title?: string | null } | null;
}): string {
  return cls.course_topic?.title || cls.topic?.category || cls.topic?.title || cls.title || '';
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

/**
 * Icon-only circular variant of a tag, same tone palette but no label text.
 * For rows stacking several status badges (Draft / Teams / Assignment)
 * vertically in a tight column, where spelling each one out would crowd out
 * the title next to it.
 */
export function iconTagSx(theme: Theme, tone: TagTone) {
  const { px, py, gap, fontSize, whiteSpace, ...base } = tagSx(theme, tone);
  return {
    ...base,
    width: 22,
    height: 22,
    justifyContent: 'center',
    borderRadius: '50%',
  };
}

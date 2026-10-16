/**
 * Design-system tokens for the marketing site.
 *
 * The values live in @neram/ui (packages/ui/src/theme/site-tokens.ts), the one
 * source of truth. This file re-exports them and adds the small sx fragments
 * every component shares. Import from '@/design-system', never write a hex
 * literal in an sx prop (see apps/marketing/DESIGN_SYSTEM.md).
 *
 * Surface-aware colours: <Surface> sets these CSS variables, so a component
 * reads the right value on a dark or light band without a theme callback
 * (which keeps components usable from server components). Outside any
 * Surface the light values apply.
 */

import { siteTokens } from '@neram/ui/site-tokens';

export const tokens = siteTokens;
const t = siteTokens;

/** CSS variables a Surface sets for its children. */
export const surfaceVars = {
  light: {
    '--ds-fg': t.ink,
    '--ds-muted': t.inkMuted,
    '--ds-eyebrow': t.gold800,
    '--ds-line': t.line,
    '--ds-card': t.surface,
    '--ds-card-alt': t.ground,
    '--ds-outline': t.ink,
    '--ds-outline-hover-bg': t.navy900,
    '--ds-outline-hover-fg': t.paper,
    '--ds-outline-hover-border': t.navy900,
    '--ds-link-line': 'rgba(26,32,39,0.3)',
  },
  dark: {
    '--ds-fg': t.paper,
    '--ds-muted': t.paperMuted,
    '--ds-eyebrow': t.gold500,
    '--ds-line': t.lineDark,
    '--ds-card': t.navy800,
    '--ds-card-alt': t.navy800,
    '--ds-outline': t.outlineDark,
    '--ds-outline-hover-bg': 'transparent',
    '--ds-outline-hover-fg': t.gold500,
    '--ds-outline-hover-border': t.gold500,
    '--ds-link-line': 'rgba(245,240,232,0.3)',
  },
} as const;

/** `var(--ds-x, <light fallback>)` so components work outside a Surface too. */
export const v = {
  fg: `var(--ds-fg, ${t.ink})`,
  muted: `var(--ds-muted, ${t.inkMuted})`,
  eyebrow: `var(--ds-eyebrow, ${t.gold800})`,
  line: `var(--ds-line, ${t.line})`,
  card: `var(--ds-card, ${t.surface})`,
  cardAlt: `var(--ds-card-alt, ${t.ground})`,
  outline: `var(--ds-outline, ${t.ink})`,
  outlineHoverBg: `var(--ds-outline-hover-bg, ${t.navy900})`,
  outlineHoverFg: `var(--ds-outline-hover-fg, ${t.paper})`,
  outlineHoverBorder: `var(--ds-outline-hover-border, ${t.navy900})`,
  linkLine: `var(--ds-link-line, rgba(26,32,39,0.3))`,
} as const;

export const focusRing = {
  '&:focus-visible': { outline: t.focusOutline, outlineOffset: '2px' },
} as const;

/** Hover = the border turns gold500. No lift, no glow. */
export const hoverGoldBorder = {
  transition: 'border-color 150ms ease',
  '&:hover': { borderColor: t.gold500 },
} as const;

export const eyebrowSx = {
  fontFamily: t.fontMono,
  fontSize: '0.75rem',
  fontWeight: 700,
  letterSpacing: '0.2em',
  lineHeight: 1.4,
  textTransform: 'uppercase',
  color: v.eyebrow,
  m: 0,
} as const;

/** 48px navy tile with a gold glyph (FeatureCard, ToolCard, mega menu). */
export const iconTileSx = {
  width: 48,
  height: 48,
  flexShrink: 0,
  borderRadius: `${t.radius}px`,
  bgcolor: t.navy900,
  color: t.gold500,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  '& svg': { fontSize: 24 },
} as const;

export const sectionPaddingY = { xs: 7, md: 10 } as const; // 56px / 80px

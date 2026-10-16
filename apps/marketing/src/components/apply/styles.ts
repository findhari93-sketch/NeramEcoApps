import type { SxProps, Theme } from '@mui/material/styles';
import { siteTokens as t } from '@neram/ui/site-tokens';

/**
 * A choice card in the Apply Flow design: white, 2px line border, 8px radius,
 * left-aligned content, no tint. Selected = 2px navy border plus a 3px gold
 * inset along the top (pair it with a navy check_circle top right). Used by
 * the exam, learning-mode, centre and payment-plan cards so all of them
 * select the same way. `extra` carries a card's own layout (height, cursor).
 */
export function selectedCardSx(selected: boolean, extra: Record<string, string | number> = {}): SxProps<Theme> {
  return {
    borderRadius: `${t.radius}px`,
    border: `2px solid ${selected ? t.navy900 : t.line}`,
    boxShadow: selected ? `inset 0 3px 0 ${t.gold500}` : 'none',
    bgcolor: t.surface,
    color: t.ink,
    textAlign: 'left',
    transition: 'border-color 150ms',
    '&:hover': selected ? {} : { borderColor: t.lineStrong },
    '&:focus-visible, &.Mui-focusVisible': { outline: t.focusOutline, outlineOffset: '2px' },
    '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
    ...extra,
  } as SxProps<Theme>;
}

/** The 40px navy tile with a gold glyph used on exam, mode and YouTube cards. */
export const iconTile40Sx = {
  width: 40,
  height: 40,
  flexShrink: 0,
  borderRadius: `${t.radius}px`,
  bgcolor: t.navy900,
  color: t.gold500,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  '& svg': { fontSize: 22 },
} as const;

/** White card with a 3px coloured inset rail on the left (notices, deadlines, errors). */
export function railCardSx(color: string): Record<string, unknown> {
  return {
    bgcolor: t.surface,
    border: `1px solid ${t.line}`,
    boxShadow: `inset 3px 0 0 ${color}`,
    borderRadius: `${t.radius}px`,
    px: 2.5,
    py: 2,
  };
}

/** Outline button on white: 44px, 1px lineStrong, hover = navy fill with paper text. */
export const outlineButtonSx = {
  minHeight: 44,
  px: 1.75,
  borderRadius: `${t.radius}px`,
  border: `1px solid ${t.lineStrong}`,
  bgcolor: t.surface,
  color: t.ink,
  fontSize: 14,
  fontWeight: 600,
  textTransform: 'none',
  '&:hover': { bgcolor: t.navy900, color: t.paper, borderColor: t.navy900 },
  '&.Mui-focusVisible': { outline: t.focusOutline, outlineOffset: '2px' },
} as const;

/** Mono uppercase eyebrow on white ("YOUR FEE", "YOUR APPLICATIONS"). */
export const applyEyebrowSx = {
  m: 0,
  fontFamily: t.fontMono,
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.2em',
  textTransform: 'uppercase',
  color: t.gold800,
} as const;

/** A ruled section: 1px ink rule on top (summary groups, fee summary, enrolment row). */
export const inkRuleTopSx = { borderTop: `1px solid ${t.ink}` } as const;

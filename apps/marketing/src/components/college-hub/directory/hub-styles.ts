/**
 * Directory styles. The design canvas set the layout; colours come from the
 * marketing design-system tokens (navy, gold, ink, line). The main call to
 * action is the gold fill with navy text, COA is the success colour.
 */
import { siteTokens } from '@neram/ui/site-tokens';


/** The gold call-to-action fill (navy text on gold500 is about 8:1). */
export const ctaBg = siteTokens.gold500;

export const ctaButtonSx = {
  bgcolor: ctaBg,
  color: siteTokens.navy900,
  fontWeight: 700,
  boxShadow: 'none',
  textTransform: 'none' as const,
  '&:hover': { bgcolor: siteTokens.gold300, boxShadow: 'none' },
};

/** Dark surface of the compare tray. */
export const traySx = {
  bgcolor: siteTokens.navy900,
  color: siteTokens.paper,
};

export const chipBase = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 0.5,
  height: 24,
  px: 1.125,
  borderRadius: `${siteTokens.radiusPill}px`,
  fontSize: 12.5,
  fontWeight: 600,
  lineHeight: 1,
  whiteSpace: 'nowrap' as const,
};

export const coaChipSx = {
  ...chipBase,
  bgcolor: siteTokens.surface,
  color: siteTokens.success,
  boxShadow: `inset 0 0 0 1px ${siteTokens.success}`,
};

export const naacChipSx = {
  ...chipBase,
  border: '1px solid',
  borderColor: siteTokens.lineStrong,
  color: siteTokens.ink,
};

export const noNaacChipSx = {
  ...chipBase,
  border: '1px dashed',
  borderColor: siteTokens.lineStrong,
  color: siteTokens.inkMuted,
};

export const examChipSx = {
  ...chipBase,
  bgcolor: siteTokens.surfaceHover,
  color: siteTokens.navy900,
};

export const featuredChipSx = {
  ...chipBase,
  height: 22,
  px: 1,
  fontSize: '0.72rem',
  fontWeight: 700,
  bgcolor: siteTokens.goldTintBg,
  color: siteTokens.gold800,
};

/** Small uppercase label above a value (dt). */
export const statLabelSx = {
  fontSize: 11.5,
  fontWeight: 600,
  letterSpacing: '0.05em',
  textTransform: 'uppercase' as const,
  color: siteTokens.inkMuted,
};

/** Section legend in the filter rail. */
export const legendSx = {
  fontSize: 11.5,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase' as const,
  color: siteTokens.inkMuted,
};

/** Visible keyboard focus for custom controls. */
export const focusRingSx = {
  '&:focus-visible': {
    outline: siteTokens.focusOutline,
    outlineOffset: 2,
  },
};

/** Light page band behind the directory body. */
export const pageBg = siteTokens.ground;

/**
 * Type scale of the College Hub (px), matched to the design canvas so pages read
 * at the canvas density at 100% zoom. Inputs stay 16px (iOS zoom) and touch
 * targets stay 44px; only text and padding follow this scale.
 */
export const hubType = {
  pageTitle: 30,
  pageTitlePhone: 20,
  subtitle: 15,
  kpi: 20,
  label: 11.5,
  body: 14,
  meta: 13.5,
  cardTitle: 17,
  tileTitle: 16,
  stat: 15,
  option: 14,
  chip: 12.5,
  sectionTitle: 20,
} as const;

/**
 * Directory styles derived from the @neram/ui marketing theme. The design
 * canvas set the layout; colours come from the theme (primary blue, secondary
 * orange for the main call to action, success green for COA).
 */
import { alpha, darken, type Theme } from '@mui/material/styles';


/**
 * The orange call-to-action fill. Theme secondary.dark with white text is about
 * 3.6:1, under the 4.5:1 rule, so it is darkened a step for text on top.
 */
export const ctaBg = (t: Theme) => darken(t.palette.secondary.dark, 0.18);

export const ctaButtonSx = {
  bgcolor: ctaBg,
  color: '#fff',
  fontWeight: 700,
  boxShadow: 'none',
  textTransform: 'none' as const,
  '&:hover': { bgcolor: (t: Theme) => darken(ctaBg(t), 0.12), boxShadow: 'none' },
};

/** Dark surface of the compare tray. */
export const traySx = {
  bgcolor: 'grey.900',
  color: 'common.white',
};

export const chipBase = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 0.5,
  height: 24,
  px: 1.125,
  borderRadius: 1.5,
  fontSize: 12.5,
  fontWeight: 600,
  lineHeight: 1,
  whiteSpace: 'nowrap' as const,
};

export const coaChipSx = {
  ...chipBase,
  bgcolor: (t: Theme) => t.palette.success.light,
  color: (t: Theme) => darken(t.palette.success.dark, 0.25),
};

export const naacChipSx = {
  ...chipBase,
  border: '1px solid',
  borderColor: 'grey.400',
  color: 'text.primary',
};

export const noNaacChipSx = {
  ...chipBase,
  border: '1px dashed',
  borderColor: 'grey.400',
  color: 'text.secondary',
};

export const examChipSx = {
  ...chipBase,
  bgcolor: (t: Theme) => alpha(t.palette.primary.main, 0.1),
  color: 'primary.dark',
};

export const featuredChipSx = {
  ...chipBase,
  height: 22,
  px: 1,
  fontSize: '0.72rem',
  fontWeight: 700,
  bgcolor: (t: Theme) => alpha(t.palette.secondary.main, 0.14),
  color: (t: Theme) => darken(t.palette.secondary.dark, 0.35),
};

/** Small uppercase label above a value (dt). */
export const statLabelSx = {
  fontSize: 11.5,
  fontWeight: 600,
  letterSpacing: '0.05em',
  textTransform: 'uppercase' as const,
  color: 'text.secondary',
};

/** Section legend in the filter rail. */
export const legendSx = {
  fontSize: 11.5,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase' as const,
  color: 'text.secondary',
};

/** Visible keyboard focus for custom controls. */
export const focusRingSx = {
  '&:focus-visible': {
    outline: '2px solid',
    outlineColor: 'primary.main',
    outlineOffset: 2,
  },
};

/** Light page band behind the directory body. */
export const pageBg = (t: Theme) => (t.palette.mode === 'light' ? t.palette.grey[50] : t.palette.background.default);

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

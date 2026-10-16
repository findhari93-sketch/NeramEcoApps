'use client';

/**
 * Neram marketing site themes (neramclasses.com), 2026 design system.
 *
 * Two themes built from one token set (`siteTokens`) and one type scale:
 * - siteLightTheme: the page shell and the long-form light body.
 * - siteDarkTheme: scoped to dark bands (hero, CTA band) through the
 *   marketing app's <Surface tone="dark">, never a whole-page theme.
 *
 * Both are built from scratch, not on top of the base `lightTheme`, because the
 * base component overrides hard-code the old Material blue. Every component
 * here takes its colour from the palette, so nothing blue leaks through.
 *
 * Colour rules (from the handoff README):
 * - gold500 is a fill for primary actions only. Gold text on white is 2.3:1.
 *   On light, `primary.main` is navy900: legacy pages paint selected states,
 *   app bars and `bgcolor: 'primary.main'` blocks with it, and the handoff's
 *   selected state is a navy fill with paper text. Contained primary buttons
 *   are overridden to the gold500 action fill. `secondary.main` is gold800
 *   (5.9:1 on white), the text-safe gold for eyebrows and accents.
 * - Radius 8 for cards, buttons, inputs and panels; 100 for pills.
 * - No glass, no glow, no lift on hover. Focus is a 2px gold outline.
 */

import { createTheme, type ThemeOptions } from '@mui/material/styles';
import type { CSSProperties } from 'react';
import { siteTokens as t } from './site-tokens';

// ── Type scale (shared by both themes) ──

const balance = { textWrap: 'balance' } as CSSProperties;

const typography: ThemeOptions['typography'] = {
  fontFamily: t.fontSans,
  h1: {
    fontFamily: t.fontSans,
    fontWeight: 800,
    fontSize: 'clamp(2rem, 5vw, 3.5rem)',
    lineHeight: 1.05,
    letterSpacing: '-0.01em',
    ...balance,
  },
  h2: {
    fontFamily: t.fontSans,
    fontWeight: 800,
    fontSize: 'clamp(1.75rem, 3.5vw, 2.5rem)',
    lineHeight: 1.15,
    letterSpacing: '-0.005em',
    ...balance,
  },
  h3: {
    fontFamily: t.fontSans,
    fontWeight: 700,
    fontSize: 'clamp(1.25rem, 2vw, 1.375rem)',
    lineHeight: 1.25,
  },
  h4: { fontFamily: t.fontSans, fontWeight: 700, fontSize: '1.125rem', lineHeight: 1.3 },
  h5: { fontFamily: t.fontSans, fontWeight: 700, fontSize: '1.0625rem', lineHeight: 1.3 },
  h6: { fontFamily: t.fontSans, fontWeight: 700, fontSize: '1rem', lineHeight: 1.4 },
  subtitle1: { fontSize: '1.0625rem', lineHeight: 1.55, fontWeight: 400 },
  subtitle2: { fontSize: '0.9375rem', lineHeight: 1.5, fontWeight: 600 },
  body1: { fontSize: '1rem', lineHeight: 1.6 },
  body2: { fontSize: '0.9375rem', lineHeight: 1.55 },
  caption: { fontSize: '0.8125rem', lineHeight: 1.45 },
  overline: {
    fontFamily: t.fontMono,
    fontSize: '0.75rem',
    fontWeight: 700,
    letterSpacing: '0.2em',
    lineHeight: 1.4,
    textTransform: 'uppercase',
  },
  button: { fontFamily: t.fontSans, fontWeight: 700, textTransform: 'none', letterSpacing: 0 },
  // Custom variants (see the module augmentation at the end of this file)
  eyebrow: {
    fontFamily: t.fontMono,
    fontSize: '0.75rem',
    fontWeight: 700,
    letterSpacing: '0.2em',
    lineHeight: 1.4,
    textTransform: 'uppercase',
  },
  lede: { fontSize: 'clamp(1.0625rem, 1.6vw, 1.125rem)', lineHeight: 1.55, fontWeight: 400 },
  statValue: {
    fontFamily: t.fontMono,
    fontSize: 'clamp(1.375rem, 2.5vw, 1.625rem)',
    fontWeight: 700,
    lineHeight: 1,
  },
  statLabel: {
    fontSize: '0.75rem',
    letterSpacing: '0.05em',
    lineHeight: 1.4,
    textTransform: 'uppercase',
  },
};

const typographyDefaults = {
  defaultProps: {
    variantMapping: {
      eyebrow: 'p',
      lede: 'p',
      statValue: 'span',
      statLabel: 'span',
    },
  },
};

const focusVisible = { outline: t.focusOutline, outlineOffset: 2 };

const containerOverrides = {
  styleOverrides: {
    root: {
      paddingLeft: 16,
      paddingRight: 16,
      '@media (min-width: 600px)': { paddingLeft: 24, paddingRight: 24 },
    },
  },
};

const buttonRoot = {
  borderRadius: t.radius,
  boxShadow: 'none',
  minHeight: 44,
  padding: '10px 20px',
  fontSize: '0.9375rem',
  transition: 'background-color 150ms ease, border-color 150ms ease, color 150ms ease',
  '&:hover': { boxShadow: 'none' },
  '&.Mui-focusVisible': focusVisible,
};

const buttonLarge = { minHeight: 52, padding: '14px 22px', fontSize: '1rem' };

// ── Light theme ──

export const siteLightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: t.navy900, light: t.navy700, dark: t.navy900, contrastText: t.paper },
    secondary: { main: t.gold800, light: t.gold300, dark: t.gold800, contrastText: '#ffffff' },
    success: { main: t.success },
    background: { default: t.ground, paper: t.surface },
    text: { primary: t.ink, secondary: t.inkMuted },
    divider: t.line,
  },
  typography,
  shape: { borderRadius: t.radius },
  components: {
    MuiTypography: typographyDefaults,
    MuiContainer: containerOverrides,
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: buttonRoot,
        sizeLarge: buttonLarge,
        containedPrimary: {
          background: t.gold500,
          color: t.navy900,
          '&:hover': { background: t.gold300, color: t.navy900 },
        },
        containedSecondary: {
          background: t.navy900,
          color: t.paper,
          '&:hover': { background: t.navy700 },
        },
        outlined: {
          borderColor: t.lineStrong,
          color: t.ink,
          '&:hover': { background: t.navy900, borderColor: t.navy900, color: t.paper },
        },
        text: { color: t.ink, '&:hover': { background: t.surfaceHover } },
      },
    },
    MuiIconButton: { styleOverrides: { root: { '&.Mui-focusVisible': focusVisible } } },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { borderRadius: t.radius, border: `1px solid ${t.line}`, boxShadow: 'none' } },
    },
    MuiPaper: { styleOverrides: { rounded: { borderRadius: t.radius } } },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: t.radiusPill, fontWeight: 600 },
        outlined: { borderColor: t.line },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: t.radius,
          '& .MuiOutlinedInput-notchedOutline': { borderColor: t.lineStrong },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: t.ink },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: t.navy900, borderWidth: 2 },
        },
        // 16px stops iOS zooming into the field
        input: { fontSize: '1rem' },
      },
    },
    MuiInputLabel: { styleOverrides: { root: { '&.Mui-focused': { color: t.ink } } } },
    MuiLink: {
      defaultProps: { underline: 'hover' },
      styleOverrides: { root: { '&.Mui-focusVisible, &:focus-visible': focusVisible } },
    },
    MuiDialogTitle: { styleOverrides: { root: { fontFamily: t.fontSans, fontWeight: 800 } } },
    MuiAccordion: {
      defaultProps: { elevation: 0, disableGutters: true },
      styleOverrides: {
        root: { borderBottom: `1px solid ${t.line}`, background: 'transparent', '&::before': { display: 'none' } },
      },
    },
    MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600, minHeight: 48 } } },
    MuiTabs: { styleOverrides: { indicator: { backgroundColor: t.gold500, height: 2 } } },
    MuiAvatar: { styleOverrides: { colorDefault: { background: t.navy700, color: t.paper } } },
    MuiAlert: { styleOverrides: { root: { borderRadius: t.radius } } },
    // The light Site Header surface: white, 1px bottom line, ink text. The
    // marketing Header switches to navy on pages with a dark PageHero itself.
    MuiAppBar: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { boxShadow: 'none', backgroundImage: 'none' },
        colorPrimary: { background: t.surface, color: t.ink, borderBottom: `1px solid ${t.line}` },
      },
    },
  },
});

// ── Dark theme (for dark bands only) ──

export const siteDarkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: t.gold500, light: t.gold300, dark: t.gold500, contrastText: t.navy900 },
    // On dark, "secondary" is the paper outline action
    secondary: { main: t.paper, light: t.gold300, dark: t.navy700, contrastText: t.navy900 },
    success: { main: t.statusDone },
    background: { default: t.navy900, paper: t.navy800 },
    text: { primary: t.paper, secondary: t.paperMuted, disabled: 'rgba(245,240,232,0.38)' },
    divider: t.lineDark,
  },
  typography,
  shape: { borderRadius: t.radius },
  components: {
    MuiTypography: typographyDefaults,
    MuiContainer: containerOverrides,
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: buttonRoot,
        sizeLarge: buttonLarge,
        containedPrimary: {
          background: t.gold500,
          color: t.navy900,
          '&:hover': { background: t.gold300, color: t.navy900 },
        },
        outlined: {
          borderColor: t.outlineDark,
          color: t.paper,
          '&:hover': { borderColor: t.gold500, background: 'transparent', color: t.paper },
        },
        text: { color: t.paper, '&:hover': { background: 'rgba(255,255,255,0.08)' } },
      },
    },
    MuiIconButton: { styleOverrides: { root: { '&.Mui-focusVisible': focusVisible } } },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          borderRadius: t.radius,
          background: t.navy800,
          border: `1px solid ${t.lineDark}`,
          boxShadow: 'none',
        },
      },
    },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' }, rounded: { borderRadius: t.radius } } },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: t.radiusPill, fontWeight: 600 },
        colorPrimary: { background: t.goldTintBg, color: t.gold300, border: `1px solid ${t.goldTintBorder}` },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: t.radius,
          background: t.navy800,
          '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.16)' },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: t.outlineDark },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: t.gold500 },
        },
        input: { fontSize: '1rem' },
      },
    },
    MuiLink: { defaultProps: { underline: 'hover' } },
    MuiDivider: { styleOverrides: { root: { borderColor: t.lineDark } } },
    MuiAppBar: {
      styleOverrides: { root: { background: t.navy900, borderBottom: `1px solid ${t.lineDark}`, boxShadow: 'none' } },
    },
    MuiAvatar: { styleOverrides: { colorDefault: { background: t.navy700, color: t.paper } } },
  },
});

// ── Typography variant augmentation ──

declare module '@mui/material/styles' {
  interface TypographyVariants {
    eyebrow: CSSProperties;
    lede: CSSProperties;
    statValue: CSSProperties;
    statLabel: CSSProperties;
  }
  interface TypographyVariantsOptions {
    eyebrow?: CSSProperties;
    lede?: CSSProperties;
    statValue?: CSSProperties;
    statLabel?: CSSProperties;
  }
}

declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides {
    eyebrow: true;
    lede: true;
    statValue: true;
    statLabel: true;
  }
}

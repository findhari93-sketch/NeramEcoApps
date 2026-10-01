'use client';

import { alpha, createTheme, type Theme, type ThemeOptions } from '@mui/material/styles';
import { neramTokens as t } from '@neram/ui';

/**
 * aiArchitek app theme, built from the @neram/ui "aiArchitek Era" tokens
 * (navy, gold, AI blue). Every colour here comes from neramTokens or is a
 * contrast-checked shade of one, so the shared package stays the source of
 * truth and this file only decides how the tools app applies it.
 *
 * Contrast (WCAG AA, 4.5:1 for text):
 *   light  primary #0d6ecd on #FFFFFF 5.1:1, text.secondary #4A5872 on #F5F7FB 6.6:1
 *   dark   primary #3eb8ff on #060d1f 8.9:1, text.secondary #A9B6CC on #0b1629 8.6:1
 */

// next/font hashes family names, so the literal "DM Sans" never matches the
// downloaded file. The CSS variable is set on <html> by the root layout.
const FONT_STACK =
  'var(--font-dm-sans), "DM Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

type Mode = 'light' | 'dark';

const palettes = {
  light: {
    primary: { main: t.blue[600], light: t.blue[400], dark: t.blue[700], contrastText: '#FFFFFF' },
    secondary: { main: t.gold[500], light: t.gold[400], dark: t.gold[600], contrastText: t.navy[900] },
    background: { default: '#F5F7FB', paper: '#FFFFFF' },
    text: { primary: t.navy[800], secondary: '#4A5872', disabled: '#8A96AB' },
    divider: '#E3E8F0',
    error: { main: '#C62828' },
    warning: { main: '#B45309' },
    success: { main: '#15803D' },
    info: { main: t.blue[600] },
    brand: { navy: t.navy[900], gold: t.gold[700], goldSoft: '#FDF3E1', blueSoft: '#E7F2FD' },
  },
  dark: {
    primary: { main: t.blue[400], light: t.blue[300], dark: t.blue[500], contrastText: t.navy[900] },
    secondary: { main: t.gold[400], light: '#F8D48E', dark: t.gold[500], contrastText: t.navy[900] },
    background: { default: t.navy[900], paper: t.navy[800] },
    text: { primary: t.cream[100], secondary: '#A9B6CC', disabled: '#6B7A93' },
    divider: t.navy[600],
    error: { main: '#F87171' },
    warning: { main: '#FBBF24' },
    success: { main: '#4ADE80' },
    info: { main: t.blue[400] },
    brand: { navy: t.navy[950], gold: t.gold[400], goldSoft: 'rgba(232,160,32,0.14)', blueSoft: 'rgba(62,184,255,0.12)' },
  },
} as const;

function buildTheme(mode: Mode): Theme {
  const p = palettes[mode];
  const focusRing = `2px solid ${mode === 'light' ? t.blue[600] : t.gold[400]}`;

  const options: ThemeOptions = {
    palette: {
      mode,
      primary: { ...p.primary },
      secondary: { ...p.secondary },
      background: { ...p.background },
      text: { ...p.text },
      divider: p.divider,
      error: { ...p.error },
      warning: { ...p.warning },
      success: { ...p.success },
      info: { ...p.info },
      action: {
        hover: alpha(p.primary.main, mode === 'light' ? 0.06 : 0.1),
        selected: alpha(p.primary.main, mode === 'light' ? 0.1 : 0.16),
        focus: alpha(p.primary.main, 0.16),
      },
    },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily: FONT_STACK,
      h1: { fontSize: '2rem', fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.02em' },
      h2: { fontSize: '1.75rem', fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.02em' },
      h3: { fontSize: '1.625rem', fontWeight: 700, lineHeight: 1.25, letterSpacing: '-0.015em' },
      h4: { fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.25, letterSpacing: '-0.015em' },
      h5: { fontSize: '1.25rem', fontWeight: 700, lineHeight: 1.3, letterSpacing: '-0.01em' },
      h6: { fontSize: '1.0625rem', fontWeight: 600, lineHeight: 1.35 },
      subtitle1: { fontSize: '1rem', fontWeight: 600, lineHeight: 1.45 },
      subtitle2: { fontSize: '0.875rem', fontWeight: 600, lineHeight: 1.45 },
      body1: { fontSize: '1rem', lineHeight: 1.6 },
      body2: { fontSize: '0.875rem', lineHeight: 1.55 },
      caption: { fontSize: '0.75rem', lineHeight: 1.5 },
      overline: { fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', lineHeight: 1.6 },
      button: { fontSize: '0.9375rem', fontWeight: 600, textTransform: 'none', letterSpacing: 0 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          html: { '--focus-ring-color': mode === 'light' ? t.blue[600] : t.gold[400] },
          body: { backgroundColor: p.background.default },
          '@media (prefers-reduced-motion: reduce)': {
            '*, *::before, *::after': {
              animationDuration: '0.01ms !important',
              animationIterationCount: '1 !important',
              transitionDuration: '0.01ms !important',
              scrollBehavior: 'auto !important',
            },
          },
        },
      },
      MuiButtonBase: {
        styleOverrides: {
          root: { '&.Mui-focusVisible': { outline: focusRing, outlineOffset: 2 } },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { minHeight: 44, borderRadius: 10, paddingInline: 18 },
          sizeSmall: { minHeight: 36, paddingInline: 12, fontSize: '0.875rem' },
          sizeLarge: { minHeight: 52, paddingInline: 24, fontSize: '1rem' },
          outlined: { borderColor: p.divider, '&:hover': { borderColor: p.primary.main } },
        },
      },
      MuiIconButton: {
        styleOverrides: { root: { borderRadius: 10 } },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: { backgroundImage: 'none' },
          outlined: { borderColor: p.divider },
          rounded: { borderRadius: 12 },
        },
        variants: [
          // Flat surfaces with a hairline border read as "enterprise" without
          // shadows competing for attention. Elevated Paper (menus, popovers)
          // keeps its shadow and drops the border.
          { props: { elevation: 0 }, style: { border: `1px solid ${p.divider}` } },
        ],
      },
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: { root: { borderRadius: 14 } },
      },
      MuiCardContent: {
        styleOverrides: { root: { padding: 20, '&:last-child': { paddingBottom: 20 } } },
      },
      MuiAppBar: {
        defaultProps: { elevation: 0 },
        styleOverrides: { root: { border: 'none' } },
      },
      MuiDrawer: {
        styleOverrides: { paper: { backgroundImage: 'none', border: 'none' } },
      },
      MuiDialog: {
        styleOverrides: { paper: { borderRadius: 16, border: 'none' } },
      },
      MuiMenu: {
        styleOverrides: { paper: { border: `1px solid ${p.divider}` } },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 10,
            backgroundColor: p.background.paper,
            '& .MuiOutlinedInput-notchedOutline': { borderColor: mode === 'light' ? '#CBD3DF' : t.navy[600] },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: p.text.secondary },
          },
        },
      },
      MuiInputLabel: {
        styleOverrides: { root: { fontWeight: 500 } },
      },
      MuiChip: {
        styleOverrides: { root: { fontWeight: 600, borderRadius: 8 } },
      },
      MuiTabs: {
        styleOverrides: { indicator: { height: 3, borderRadius: '3px 3px 0 0' } },
      },
      MuiTab: {
        styleOverrides: {
          root: { textTransform: 'none', fontWeight: 600, fontSize: '0.9375rem', minHeight: 48 },
        },
      },
      MuiToggleButton: {
        styleOverrides: { root: { textTransform: 'none', fontWeight: 600, minHeight: 44 } },
      },
      MuiListItemButton: {
        styleOverrides: { root: { borderRadius: 10 } },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: t.navy[700],
            color: t.cream[100],
            fontSize: '0.8125rem',
            fontWeight: 500,
            borderRadius: 8,
            padding: '6px 10px',
          },
          arrow: { color: t.navy[700] },
        },
      },
      MuiAlert: {
        styleOverrides: { root: { borderRadius: 12, alignItems: 'flex-start' } },
      },
      MuiSkeleton: {
        defaultProps: { animation: 'wave' },
        styleOverrides: { rounded: { borderRadius: 10 } },
      },
      MuiLinearProgress: {
        styleOverrides: { root: { borderRadius: 4 }, bar: { borderRadius: 4 } },
      },
      MuiTableCell: {
        styleOverrides: {
          head: { fontWeight: 600, color: p.text.secondary, fontSize: '0.8125rem' },
          root: { borderColor: p.divider },
        },
      },
      MuiAccordion: {
        defaultProps: { disableGutters: true, elevation: 0 },
        styleOverrides: { root: { '&::before': { display: 'none' } } },
      },
    },
  };

  return createTheme(options);
}

export const enterpriseLightTheme = buildTheme('light');
export const enterpriseDarkTheme = buildTheme('dark');

/** Brand accents that are not part of the MUI palette (hero bands, badges). */
export const brandAccents = palettes;

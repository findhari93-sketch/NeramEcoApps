'use client';

/**
 * Neram Classes - aiArchitek Era 2026 Theme Variants
 *
 * New dark/light themes for the "aiArchitek Era" redesign.
 * Built from scratch using neramTokens — does NOT depend on existing
 * base themes, tokens.ts, or brand-2025.ts.
 *
 * Usage:
 *   <ThemeProvider theme={neramaiArchitekDarkTheme}>
 *     <HeroSection />
 *   </ThemeProvider>
 */

import { createTheme, alpha } from '@mui/material/styles';
import { neramTokens as t, neramFontFamilies as fonts, neramShadows } from './neram-2026';

// ============================================
// aiArchitek DARK THEME (Hero, Homepage, Premium)
// ============================================

export const neramaiArchitekDarkTheme = createTheme({
  palette: {
    mode: 'dark',

    primary: {
      main: t.gold[500],       // #e8a020
      light: t.gold[400],      // #f4bf5a
      dark: t.gold[600],       // #c47d10
      contrastText: t.navy[900], // dark text on gold buttons
    },

    secondary: {
      main: t.blue[500],       // #1a8fff
      light: t.blue[400],      // #3eb8ff
      dark: t.blue[700],       // #0a4f99
      contrastText: '#ffffff',
    },

    background: {
      default: t.navy[900],    // #060d1f — page bg
      paper: t.navy[800],      // #0b1629 — cards, modals
    },

    text: {
      primary: t.cream[100],   // #f5f0e8 — main text
      secondary: 'rgba(245,240,232,0.55)', // muted
      disabled: 'rgba(245,240,232,0.25)',
    },

    divider: 'rgba(255,255,255,0.07)',

    success: { main: t.success },
    error: { main: t.error },
    warning: { main: t.warning },
    info: { main: t.info },
  },

  typography: {
    fontFamily: fonts.body,

    // Display / hero headings — serif
    h1: {
      fontFamily: fonts.serif,
      fontWeight: 600,
      fontSize: 'clamp(44px, 5vw, 70px)',
      lineHeight: 1.05,
      letterSpacing: '-0.01em',
      color: t.cream[100],
    },
    h2: {
      fontFamily: fonts.serif,
      fontWeight: 600,
      fontSize: 'clamp(32px, 4vw, 52px)',
      lineHeight: 1.1,
      color: t.cream[100],
    },

    // UI headings — sans
    h3: {
      fontFamily: fonts.body,
      fontWeight: 700,
      fontSize: 'clamp(22px, 2.5vw, 32px)',
      lineHeight: 1.2,
    },
    h4: { fontWeight: 700, fontSize: '22px' },
    h5: { fontWeight: 600, fontSize: '18px' },
    h6: { fontWeight: 600, fontSize: '15px' },

    // Body
    subtitle1: { fontSize: '16px', lineHeight: 1.7, fontWeight: 300 },
    subtitle2: { fontSize: '14px', fontWeight: 500, letterSpacing: '0.04em' },
    body1: { fontSize: '16px', lineHeight: 1.75 },
    body2: { fontSize: '14px', lineHeight: 1.65 },

    // Monospace
    caption: {
      fontFamily: fonts.mono,
      fontSize: '11px',
      letterSpacing: '0.1em',
      textTransform: 'uppercase' as const,
    },
    overline: {
      fontFamily: fonts.mono,
      fontSize: '10px',
      letterSpacing: '0.12em',
      textTransform: 'uppercase' as const,
      fontWeight: 700,
    },

    button: {
      fontFamily: fonts.body,
      fontWeight: 600,
      textTransform: 'none' as const,
      letterSpacing: '0.02em',
    },
  },

  shape: { borderRadius: 6 },

  components: {
    // ── BUTTON ──
    MuiButton: {
      styleOverrides: {
        root: {
          fontFamily: fonts.body,
          fontWeight: 600,
          textTransform: 'none',
          letterSpacing: '0.02em',
          borderRadius: 6,
          transition: 'all 0.25s ease',
        },
        containedPrimary: {
          background: t.gold[500],
          color: t.navy[900],
          '&:hover': {
            background: t.gold[400],
            transform: 'translateY(-2px)',
            boxShadow: neramShadows.goldGlow,
          },
        },
        outlinedSecondary: {
          borderColor: alpha(t.cream[100], 0.2),
          color: t.cream[100],
          '&:hover': {
            borderColor: t.gold[500],
            color: t.gold[500],
            background: 'transparent',
          },
        },
      },
    },

    // ── CARD ──
    MuiCard: {
      styleOverrides: {
        root: {
          background: t.navy[800],
          border: '1px solid rgba(255,255,255,0.06)',
          backdropFilter: 'blur(12px)',
          transition: 'transform 0.25s ease, box-shadow 0.25s ease',
          '&:hover': {
            transform: 'translateY(-4px)',
            boxShadow: neramShadows.cardHover,
          },
        },
      },
    },

    // ── CHIP ──
    MuiChip: {
      styleOverrides: {
        root: {
          fontFamily: fonts.body,
          fontWeight: 500,
          fontSize: '12px',
          letterSpacing: '0.03em',
        },
        colorPrimary: {
          background: alpha(t.gold[500], 0.12),
          color: t.gold[400],
          border: `1px solid ${alpha(t.gold[500], 0.3)}`,
        },
        colorSecondary: {
          background: alpha(t.blue[500], 0.12),
          color: t.blue[400],
          border: `1px solid ${alpha(t.blue[500], 0.3)}`,
        },
      },
    },

    // ── APP BAR ──
    MuiAppBar: {
      styleOverrides: {
        root: {
          background: alpha(t.navy[900], 0.85),
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          boxShadow: 'none',
        },
      },
    },

    // ── TEXT FIELD ──
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 6,
            '& fieldset': { borderColor: 'rgba(255,255,255,0.12)' },
            '&:hover fieldset': { borderColor: alpha(t.gold[500], 0.5) },
            '&.Mui-focused fieldset': { borderColor: t.gold[500] },
          },
        },
      },
    },

    // ── DIVIDER ──
    MuiDivider: {
      styleOverrides: {
        root: { borderColor: 'rgba(255,255,255,0.06)' },
      },
    },

    // ── CSS BASELINE ──
    MuiCssBaseline: {
      styleOverrides: {
        ':root': {
          '--neram-gold': t.gold[500],
          '--neram-gold-light': t.gold[400],
          '--neram-blue': t.blue[500],
          '--neram-blue-bright': t.blue[400],
          '--neram-navy': t.navy[900],
          '--neram-navy-card': t.navy[800],
          '--neram-cream': t.cream[100],
        },
      },
    },
  },
});

// ============================================
// aiArchitek LIGHT THEME (City SEO, Blog, FAQ)
// ============================================

export const neramaiArchitekLightTheme = createTheme({
  palette: {
    mode: 'light',

    primary: {
      main: t.gold[500],
      light: t.gold[400],
      dark: t.gold[600],
      contrastText: '#ffffff',
    },

    secondary: {
      main: t.blue[500],
      light: t.blue[400],
      dark: t.blue[700],
      contrastText: '#ffffff',
    },

    background: {
      default: t.cream[50],   // #fdfcf9 — warm white
      paper: '#ffffff',
    },

    text: {
      primary: '#1a1a2e',     // near-black, not pure black
      secondary: '#4a5068',
      disabled: '#a0a8c0',
    },

    divider: 'rgba(0,0,0,0.07)',

    success: { main: t.success },
    error: { main: t.error },
    warning: { main: t.warning },
    info: { main: t.info },
  },

  typography: {
    fontFamily: fonts.body,
    h1: {
      fontFamily: fonts.serif,
      fontWeight: 600,
      color: '#1a1a2e',
    },
    h2: {
      fontFamily: fonts.serif,
      fontWeight: 600,
      color: '#1a1a2e',
    },
    caption: {
      fontFamily: fonts.mono,
      fontSize: '11px',
      letterSpacing: '0.1em',
      textTransform: 'uppercase' as const,
    },
    overline: {
      fontFamily: fonts.mono,
      fontSize: '10px',
      letterSpacing: '0.12em',
      textTransform: 'uppercase' as const,
      fontWeight: 700,
    },
    button: {
      fontFamily: fonts.body,
      fontWeight: 600,
      textTransform: 'none' as const,
      letterSpacing: '0.02em',
    },
  },

  shape: { borderRadius: 6 },

  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 2px 20px rgba(0,0,0,0.06)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          letterSpacing: '0.02em',
          borderRadius: 6,
        },
        containedPrimary: {
          background: t.gold[500],
          color: '#ffffff',
          '&:hover': {
            background: t.gold[600],
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          background: alpha('#fdfcf9', 0.9),
          backdropFilter: 'blur(20px)',
          boxShadow: '0 1px 0 rgba(0,0,0,0.08)',
          color: '#1a1a2e',
        },
      },
    },
  },
});

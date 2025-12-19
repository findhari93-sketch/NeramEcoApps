'use client';

/**
 * Neram Classes - Material UI Theme
 *
 * This theme is shared across all applications in the ecosystem.
 * Each app can extend this base theme with app-specific customizations.
 */

import { createTheme, ThemeOptions, alpha } from '@mui/material/styles';
import type { PaletteMode } from '@mui/material';
import {
  primaryColors,
  secondaryColors,
  accentColors,
  neutralColors,
  semanticColors,
  fontFamilies,
  fontWeights,
  borderRadius,
  shadows,
  transitions,
  breakpoints,
} from './tokens';

// ============================================
// BASE THEME OPTIONS
// ============================================

const getBaseThemeOptions = (mode: PaletteMode): ThemeOptions => ({
  // Palette
  palette: {
    mode,
    primary: {
      light: primaryColors[300],
      main: primaryColors[500],
      dark: primaryColors[700],
      contrastText: '#FFFFFF',
    },
    secondary: {
      light: secondaryColors[300],
      main: secondaryColors[500],
      dark: secondaryColors[700],
      contrastText: '#000000',
    },
    error: semanticColors.error,
    warning: semanticColors.warning,
    info: semanticColors.info,
    success: semanticColors.success,
    grey: {
      50: '#FAFBFC',
      100: '#F5F7FA',
      200: '#E8EAED',
      300: '#D1D5DB',
      400: '#9CA3AF',
      500: '#6B7280',
      600: '#4B5563',
      700: '#374151',
      800: '#1F2937',
      900: '#111827',
    },
    background: {
      default: mode === 'light' ? neutralColors.background : '#0A0A0A',
      paper: mode === 'light' ? neutralColors.surface : '#141414',
    },
    text: {
      primary: mode === 'light' ? neutralColors.textPrimary : '#FFFFFF',
      secondary: mode === 'light' ? neutralColors.textSecondary : '#A0A0A0',
      disabled: mode === 'light' ? neutralColors.textDisabled : '#606060',
    },
    divider: mode === 'light' ? neutralColors.divider : '#2A2A2A',
    action: {
      active: mode === 'light' ? primaryColors[500] : primaryColors[400],
      hover: mode === 'light' ? alpha(primaryColors[500], 0.08) : alpha(primaryColors[400], 0.12),
      selected: mode === 'light' ? alpha(primaryColors[500], 0.12) : alpha(primaryColors[400], 0.16),
      disabled: mode === 'light' ? neutralColors.textDisabled : '#404040',
      disabledBackground: mode === 'light' ? neutralColors.borderLight : '#1A1A1A',
    },
  },

  // Typography
  typography: {
    fontFamily: fontFamilies.body,
    h1: {
      fontFamily: fontFamilies.display,
      fontWeight: fontWeights.bold,
      fontSize: '3rem',
      lineHeight: 1.2,
      letterSpacing: '-0.02em',
      '@media (min-width:600px)': {
        fontSize: '3.75rem',
      },
      '@media (min-width:900px)': {
        fontSize: '4.5rem',
      },
    },
    h2: {
      fontFamily: fontFamilies.display,
      fontWeight: fontWeights.bold,
      fontSize: '2.25rem',
      lineHeight: 1.25,
      letterSpacing: '-0.02em',
      '@media (min-width:600px)': {
        fontSize: '2.75rem',
      },
      '@media (min-width:900px)': {
        fontSize: '3rem',
      },
    },
    h3: {
      fontFamily: fontFamilies.display,
      fontWeight: fontWeights.semiBold,
      fontSize: '1.75rem',
      lineHeight: 1.3,
      letterSpacing: '-0.01em',
      '@media (min-width:600px)': {
        fontSize: '2rem',
      },
    },
    h4: {
      fontFamily: fontFamilies.display,
      fontWeight: fontWeights.semiBold,
      fontSize: '1.5rem',
      lineHeight: 1.35,
      letterSpacing: '-0.01em',
    },
    h5: {
      fontFamily: fontFamilies.display,
      fontWeight: fontWeights.semiBold,
      fontSize: '1.25rem',
      lineHeight: 1.4,
    },
    h6: {
      fontFamily: fontFamilies.display,
      fontWeight: fontWeights.semiBold,
      fontSize: '1.125rem',
      lineHeight: 1.4,
    },
    subtitle1: {
      fontFamily: fontFamilies.body,
      fontWeight: fontWeights.medium,
      fontSize: '1rem',
      lineHeight: 1.5,
    },
    subtitle2: {
      fontFamily: fontFamilies.body,
      fontWeight: fontWeights.medium,
      fontSize: '0.875rem',
      lineHeight: 1.5,
    },
    body1: {
      fontFamily: fontFamilies.body,
      fontWeight: fontWeights.regular,
      fontSize: '1rem',
      lineHeight: 1.6,
    },
    body2: {
      fontFamily: fontFamilies.body,
      fontWeight: fontWeights.regular,
      fontSize: '0.875rem',
      lineHeight: 1.6,
    },
    button: {
      fontFamily: fontFamilies.body,
      fontWeight: fontWeights.semiBold,
      fontSize: '0.875rem',
      lineHeight: 1.5,
      textTransform: 'none',
      letterSpacing: '0.01em',
    },
    caption: {
      fontFamily: fontFamilies.body,
      fontWeight: fontWeights.regular,
      fontSize: '0.75rem',
      lineHeight: 1.5,
    },
    overline: {
      fontFamily: fontFamilies.body,
      fontWeight: fontWeights.semiBold,
      fontSize: '0.75rem',
      lineHeight: 1.5,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
    },
  },

  // Shape
  shape: {
    borderRadius: 12,
  },

  // Breakpoints
  breakpoints: {
    values: breakpoints,
  },

  // Shadows
  shadows: [
    'none',
    shadows.xs,
    shadows.sm,
    shadows.sm,
    shadows.base,
    shadows.base,
    shadows.base,
    shadows.md,
    shadows.md,
    shadows.md,
    shadows.md,
    shadows.lg,
    shadows.lg,
    shadows.lg,
    shadows.lg,
    shadows.lg,
    shadows.xl,
    shadows.xl,
    shadows.xl,
    shadows.xl,
    shadows.xl,
    shadows.xl,
    shadows.xl,
    shadows.xl,
    shadows.xl,
  ],

  // Transitions
  transitions: {
    duration: transitions.duration,
    easing: transitions.easing,
  },

  // Component Overrides
  components: {
    // MUI CSS Baseline
    MuiCssBaseline: {
      styleOverrides: {
        html: {
          scrollBehavior: 'smooth',
        },
        body: {
          scrollbarWidth: 'thin',
          '&::-webkit-scrollbar': {
            width: '8px',
            height: '8px',
          },
          '&::-webkit-scrollbar-track': {
            background: 'transparent',
          },
          '&::-webkit-scrollbar-thumb': {
            background: neutralColors.border,
            borderRadius: '4px',
          },
          '&::-webkit-scrollbar-thumb:hover': {
            background: neutralColors.textTertiary,
          },
        },
        '::selection': {
          backgroundColor: alpha(primaryColors[500], 0.2),
          color: primaryColors[700],
        },
      },
    },

    // Button
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: borderRadius.base,
          padding: '10px 24px',
          fontSize: '0.9375rem',
          fontWeight: fontWeights.semiBold,
          boxShadow: 'none',
          transition: `all ${transitions.duration.short}ms ${transitions.easing.easeInOut}`,
          '&:hover': {
            boxShadow: 'none',
            transform: 'translateY(-1px)',
          },
          '&:active': {
            transform: 'translateY(0)',
          },
        },
        contained: {
          '&:hover': {
            boxShadow: shadows.md,
          },
        },
        containedPrimary: {
          background: `linear-gradient(135deg, ${primaryColors[500]} 0%, ${primaryColors[600]} 100%)`,
          '&:hover': {
            background: `linear-gradient(135deg, ${primaryColors[600]} 0%, ${primaryColors[700]} 100%)`,
          },
        },
        containedSecondary: {
          background: `linear-gradient(135deg, ${secondaryColors[500]} 0%, ${secondaryColors[600]} 100%)`,
          color: '#000000',
          '&:hover': {
            background: `linear-gradient(135deg, ${secondaryColors[600]} 0%, ${secondaryColors[700]} 100%)`,
          },
        },
        outlined: {
          borderWidth: '1.5px',
          '&:hover': {
            borderWidth: '1.5px',
            backgroundColor: alpha(primaryColors[500], 0.04),
          },
        },
        outlinedPrimary: {
          borderColor: primaryColors[500],
          '&:hover': {
            borderColor: primaryColors[600],
          },
        },
        text: {
          '&:hover': {
            backgroundColor: alpha(primaryColors[500], 0.08),
          },
        },
        sizeSmall: {
          padding: '6px 16px',
          fontSize: '0.8125rem',
        },
        sizeLarge: {
          padding: '14px 32px',
          fontSize: '1rem',
        },
      },
      defaultProps: {
        disableElevation: true,
      },
    },

    // Card
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: borderRadius.lg,
          boxShadow: shadows.sm,
          border: `1px solid ${neutralColors.border}`,
          transition: `all ${transitions.duration.short}ms ${transitions.easing.easeInOut}`,
          '&:hover': {
            boxShadow: shadows.md,
            borderColor: primaryColors[200],
          },
        },
      },
      defaultProps: {
        elevation: 0,
      },
    },

    // Card Content
    MuiCardContent: {
      styleOverrides: {
        root: {
          padding: '24px',
          '&:last-child': {
            paddingBottom: '24px',
          },
        },
      },
    },

    // Paper
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: borderRadius.md,
        },
        elevation1: {
          boxShadow: shadows.sm,
        },
        elevation2: {
          boxShadow: shadows.base,
        },
        elevation3: {
          boxShadow: shadows.md,
        },
      },
    },

    // TextField
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: borderRadius.base,
            transition: `all ${transitions.duration.short}ms ${transitions.easing.easeInOut}`,
            '& fieldset': {
              borderColor: neutralColors.border,
              borderWidth: '1.5px',
            },
            '&:hover fieldset': {
              borderColor: primaryColors[300],
            },
            '&.Mui-focused fieldset': {
              borderColor: primaryColors[500],
              borderWidth: '2px',
            },
          },
        },
      },
      defaultProps: {
        variant: 'outlined',
        fullWidth: true,
      },
    },

    // Input Base
    MuiInputBase: {
      styleOverrides: {
        root: {
          fontSize: '1rem',
        },
        input: {
          padding: '14px 16px',
        },
      },
    },

    // Input Label
    MuiInputLabel: {
      styleOverrides: {
        root: {
          fontSize: '0.9375rem',
          fontWeight: fontWeights.medium,
          '&.Mui-focused': {
            color: primaryColors[500],
          },
        },
      },
    },

    // Chip
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: borderRadius.base,
          fontWeight: fontWeights.medium,
        },
        filled: {
          backgroundColor: neutralColors.surfaceVariant,
        },
        colorPrimary: {
          backgroundColor: alpha(primaryColors[500], 0.1),
          color: primaryColors[700],
        },
        colorSecondary: {
          backgroundColor: alpha(secondaryColors[500], 0.15),
          color: secondaryColors[800],
        },
      },
    },

    // Alert
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: borderRadius.md,
          padding: '12px 16px',
        },
        standardSuccess: {
          backgroundColor: semanticColors.success.light,
          color: semanticColors.success.dark,
        },
        standardError: {
          backgroundColor: semanticColors.error.light,
          color: semanticColors.error.dark,
        },
        standardWarning: {
          backgroundColor: semanticColors.warning.light,
          color: semanticColors.warning.dark,
        },
        standardInfo: {
          backgroundColor: semanticColors.info.light,
          color: semanticColors.info.dark,
        },
      },
    },

    // Dialog
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: borderRadius.xl,
          boxShadow: shadows.xl,
        },
      },
    },

    // Dialog Title
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          fontFamily: fontFamilies.display,
          fontWeight: fontWeights.semiBold,
          fontSize: '1.25rem',
          padding: '24px 24px 16px',
        },
      },
    },

    // Dialog Content
    MuiDialogContent: {
      styleOverrides: {
        root: {
          padding: '16px 24px',
        },
      },
    },

    // Dialog Actions
    MuiDialogActions: {
      styleOverrides: {
        root: {
          padding: '16px 24px 24px',
          gap: '12px',
        },
      },
    },

    // Tab
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: fontWeights.medium,
          fontSize: '0.9375rem',
          minHeight: '48px',
          padding: '12px 24px',
        },
      },
    },

    // Tabs
    MuiTabs: {
      styleOverrides: {
        indicator: {
          height: '3px',
          borderRadius: '3px 3px 0 0',
        },
      },
    },

    // Table
    MuiTableHead: {
      styleOverrides: {
        root: {
          '& .MuiTableCell-head': {
            fontWeight: fontWeights.semiBold,
            backgroundColor: neutralColors.surfaceVariant,
            color: neutralColors.textSecondary,
            fontSize: '0.8125rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          },
        },
      },
    },

    MuiTableCell: {
      styleOverrides: {
        root: {
          padding: '16px',
          borderColor: neutralColors.border,
        },
      },
    },

    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:hover': {
            backgroundColor: neutralColors.surfaceVariant,
          },
        },
      },
    },

    // Tooltip
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: neutralColors.textPrimary,
          color: neutralColors.white,
          fontSize: '0.8125rem',
          padding: '8px 12px',
          borderRadius: borderRadius.base,
        },
        arrow: {
          color: neutralColors.textPrimary,
        },
      },
    },

    // Avatar
    MuiAvatar: {
      styleOverrides: {
        root: {
          fontWeight: fontWeights.semiBold,
        },
        colorDefault: {
          backgroundColor: primaryColors[100],
          color: primaryColors[700],
        },
      },
    },

    // Badge
    MuiBadge: {
      styleOverrides: {
        badge: {
          fontWeight: fontWeights.semiBold,
          fontSize: '0.6875rem',
        },
      },
    },

    // Linear Progress
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: borderRadius.full,
          height: '8px',
          backgroundColor: neutralColors.border,
        },
        bar: {
          borderRadius: borderRadius.full,
        },
      },
    },

    // Drawer
    MuiDrawer: {
      styleOverrides: {
        paper: {
          borderRight: `1px solid ${neutralColors.border}`,
        },
      },
    },

    // App Bar
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: shadows.sm,
        },
      },
      defaultProps: {
        color: 'inherit',
        elevation: 0,
      },
    },

    // Divider
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: neutralColors.border,
        },
      },
    },

    // Skeleton
    MuiSkeleton: {
      styleOverrides: {
        root: {
          borderRadius: borderRadius.base,
        },
      },
    },

    // Breadcrumbs
    MuiBreadcrumbs: {
      styleOverrides: {
        separator: {
          color: neutralColors.textTertiary,
        },
      },
    },

    // Link
    MuiLink: {
      styleOverrides: {
        root: {
          textDecorationColor: 'inherit',
          '&:hover': {
            textDecorationThickness: '2px',
          },
        },
      },
      defaultProps: {
        underline: 'hover',
      },
    },

    // Accordion
    MuiAccordion: {
      styleOverrides: {
        root: {
          borderRadius: borderRadius.md,
          border: `1px solid ${neutralColors.border}`,
          '&:before': {
            display: 'none',
          },
          '&.Mui-expanded': {
            margin: 0,
          },
        },
      },
      defaultProps: {
        elevation: 0,
        disableGutters: true,
      },
    },

    MuiAccordionSummary: {
      styleOverrides: {
        root: {
          padding: '0 20px',
          minHeight: '56px',
          '&.Mui-expanded': {
            minHeight: '56px',
          },
        },
        content: {
          '&.Mui-expanded': {
            margin: '12px 0',
          },
        },
      },
    },

    MuiAccordionDetails: {
      styleOverrides: {
        root: {
          padding: '0 20px 20px',
        },
      },
    },

    // Switch
    MuiSwitch: {
      styleOverrides: {
        root: {
          width: 46,
          height: 26,
          padding: 0,
        },
        switchBase: {
          padding: 2,
          '&.Mui-checked': {
            transform: 'translateX(20px)',
            '& + .MuiSwitch-track': {
              backgroundColor: primaryColors[500],
              opacity: 1,
            },
          },
        },
        thumb: {
          width: 22,
          height: 22,
          boxShadow: shadows.sm,
        },
        track: {
          borderRadius: 26 / 2,
          backgroundColor: neutralColors.border,
          opacity: 1,
        },
      },
    },

    // Checkbox
    MuiCheckbox: {
      styleOverrides: {
        root: {
          color: neutralColors.border,
          '&.Mui-checked': {
            color: primaryColors[500],
          },
        },
      },
    },

    // Radio
    MuiRadio: {
      styleOverrides: {
        root: {
          color: neutralColors.border,
          '&.Mui-checked': {
            color: primaryColors[500],
          },
        },
      },
    },

    // Select
    MuiSelect: {
      styleOverrides: {
        select: {
          padding: '14px 16px',
        },
      },
    },

    // Menu
    MuiMenu: {
      styleOverrides: {
        paper: {
          borderRadius: borderRadius.md,
          boxShadow: shadows.lg,
          border: `1px solid ${neutralColors.border}`,
        },
      },
    },

    MuiMenuItem: {
      styleOverrides: {
        root: {
          padding: '10px 16px',
          fontSize: '0.9375rem',
          '&:hover': {
            backgroundColor: neutralColors.surfaceVariant,
          },
          '&.Mui-selected': {
            backgroundColor: alpha(primaryColors[500], 0.08),
            '&:hover': {
              backgroundColor: alpha(primaryColors[500], 0.12),
            },
          },
        },
      },
    },

    // Fab
    MuiFab: {
      styleOverrides: {
        root: {
          boxShadow: shadows.md,
          '&:hover': {
            boxShadow: shadows.lg,
          },
        },
      },
    },

    // Speed Dial
    MuiSpeedDialAction: {
      styleOverrides: {
        staticTooltipLabel: {
          whiteSpace: 'nowrap',
        },
      },
    },

    // Snackbar
    MuiSnackbar: {
      styleOverrides: {
        root: {
          '& .MuiPaper-root': {
            borderRadius: borderRadius.md,
          },
        },
      },
    },

    // Step
    MuiStepLabel: {
      styleOverrides: {
        label: {
          fontWeight: fontWeights.medium,
          '&.Mui-active': {
            fontWeight: fontWeights.semiBold,
          },
          '&.Mui-completed': {
            fontWeight: fontWeights.semiBold,
          },
        },
      },
    },
  },
});

// ============================================
// THEME CREATION FUNCTIONS
// ============================================

/**
 * Create the base Neram theme
 */
export const createNeramTheme = (mode: PaletteMode = 'light') => {
  return createTheme(getBaseThemeOptions(mode));
};

/**
 * Light theme (default)
 */
export const lightTheme = createNeramTheme('light');

/**
 * Dark theme
 */
export const darkTheme = createNeramTheme('dark');

/**
 * Default export
 */
export default lightTheme;

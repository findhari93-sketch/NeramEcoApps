'use client';

/**
 * Neram Classes - App-Specific Theme Variants
 *
 * Each application can use these specialized themes that extend
 * the base theme with app-specific customizations.
 */

import { createTheme, Theme, alpha } from '@mui/material/styles';
import { lightTheme, darkTheme } from './theme';
import {
  primaryColors,
  secondaryColors,
  accentColors,
  neutralColors,
  fontFamilies,
  borderRadius,
  shadows,
  marketingTokens,
  appTokens,
  nexusTokens,
  adminTokens,
} from './tokens';
// Material 3 tokens for enhanced theming
import {
  m3LightScheme,
  m3DarkScheme,
  m3Elevation,
  m3Motion,
  m3MarketingAccent,
  m3AppAccent,
  m3NexusPrimary,
  m3AdminAccent,
  m3StateLayer,
} from './brand-2025';

// ============================================
// MARKETING SITE THEME (neramclasses.com)
// ============================================

/**
 * Marketing site theme - Warm, inviting, professional
 * Optimized for conversion and SEO landing pages
 * Material 3 compliant with mobile-first responsive design
 */
export const createMarketingTheme = (mode: 'light' | 'dark' = 'light'): Theme => {
  const baseTheme = mode === 'light' ? lightTheme : darkTheme;
  const scheme = mode === 'light' ? m3LightScheme : m3DarkScheme;

  return createTheme(baseTheme, {
    palette: {
      primary: {
        main: scheme.primary,
        light: scheme.primaryContainer,
        dark: mode === 'light' ? '#0D47A1' : '#1565C0',
        contrastText: scheme.onPrimary,
      },
      secondary: {
        main: m3MarketingAccent.base,
        light: m3MarketingAccent.light,
        dark: m3MarketingAccent.dark,
        contrastText: '#FFFFFF',
      },
      background: {
        default: scheme.background,
        paper: scheme.surface,
      },
    },
    components: {
      // Hero sections with M3 gradient backgrounds
      MuiBox: {
        variants: [
          {
            props: { className: 'hero-gradient' },
            style: {
              background: `linear-gradient(135deg, ${scheme.primary} 0%, ${scheme.tertiary} 100%)`,
              color: scheme.onPrimary,
            },
          },
          {
            props: { className: 'cta-gradient' },
            style: {
              background: `linear-gradient(135deg, ${m3MarketingAccent.base} 0%, ${m3MarketingAccent.dark} 100%)`,
            },
          },
          {
            props: { className: 'm3-surface' },
            style: {
              backgroundColor: scheme.surfaceContainerLow,
              borderRadius: 16,
            },
          },
        ],
      },
      // Mobile-first buttons with M3 styling
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: 12,
            minHeight: 48, // Touch-friendly
            transition: `all ${m3Motion.duration.medium2}ms ${m3Motion.easing.emphasized}`,
          },
          sizeLarge: {
            padding: '16px 32px',
            fontSize: '1rem',
            '@media (min-width: 600px)': {
              padding: '16px 40px',
              fontSize: '1.0625rem',
            },
          },
        },
        variants: [
          {
            props: { variant: 'contained', color: 'secondary' },
            style: {
              background: `linear-gradient(135deg, ${m3MarketingAccent.base} 0%, ${m3MarketingAccent.dark} 100%)`,
              color: '#FFFFFF',
              fontWeight: 700,
              boxShadow: m3Elevation.level2,
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: m3Elevation.level4,
              },
              '&:active': {
                transform: 'translateY(0)',
              },
            },
          },
          {
            props: { variant: 'contained', color: 'primary' },
            style: {
              backgroundColor: scheme.primary,
              '&:hover': {
                backgroundColor: scheme.primary,
                boxShadow: m3Elevation.level3,
              },
            },
          },
        ],
      },
      // M3 Feature cards with hover effects
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 16,
            boxShadow: m3Elevation.level1,
            transition: `all ${m3Motion.duration.medium2}ms ${m3Motion.easing.standard}`,
          },
        },
        variants: [
          {
            props: { className: 'feature-card' },
            style: {
              backgroundColor: scheme.surfaceContainerLow,
              border: `1px solid ${scheme.outlineVariant}`,
              '&:hover': {
                transform: 'translateY(-8px)',
                boxShadow: m3Elevation.level4,
                backgroundColor: scheme.surfaceContainerHigh,
              },
              // Mobile: reduce hover effect
              '@media (max-width: 600px)': {
                '&:hover': {
                  transform: 'translateY(-4px)',
                },
              },
            },
          },
          {
            props: { className: 'testimonial-card' },
            style: {
              backgroundColor: scheme.surfaceContainerLowest,
              border: `1px solid ${scheme.outlineVariant}`,
            },
          },
          {
            props: { className: 'm3-elevated' },
            style: {
              backgroundColor: scheme.surfaceContainerLow,
              boxShadow: m3Elevation.level2,
            },
          },
        ],
      },
      // M3 Typography
      MuiTypography: {
        variants: [
          {
            props: { className: 'gradient-text' },
            style: {
              background: `linear-gradient(135deg, ${scheme.primary} 0%, ${scheme.tertiary} 100%)`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            },
          },
          {
            props: { className: 'm3-display' },
            style: {
              fontWeight: 400,
              letterSpacing: '-0.025em',
              lineHeight: 1.1,
            },
          },
        ],
      },
      // Mobile-first container
      MuiContainer: {
        styleOverrides: {
          root: {
            paddingLeft: 16,
            paddingRight: 16,
            '@media (min-width: 600px)': {
              paddingLeft: 24,
              paddingRight: 24,
            },
          },
        },
      },
    },
    // Custom properties for marketing
    custom: {
      hero: marketingTokens,
      m3: { scheme, accent: m3MarketingAccent },
    },
  });
};

// ============================================
// TOOLS APP THEME (app.neramclasses.com)
// ============================================

/**
 * Tools app theme - Clean, functional, tool-focused
 * Optimized for interactive tools and data visualization
 * Material 3 compliant with mobile-first responsive design
 */
export const createToolsAppTheme = (mode: 'light' | 'dark' = 'light'): Theme => {
  const baseTheme = mode === 'light' ? lightTheme : darkTheme;
  const scheme = mode === 'light' ? m3LightScheme : m3DarkScheme;

  return createTheme(baseTheme, {
    palette: {
      primary: {
        main: scheme.primary,
        light: scheme.primaryContainer,
        contrastText: scheme.onPrimary,
      },
      secondary: {
        main: m3AppAccent.base,
        light: m3AppAccent.light,
        dark: m3AppAccent.dark,
        contrastText: '#FFFFFF',
      },
      background: {
        default: scheme.background,
        paper: scheme.surface,
      },
    },
    components: {
      // M3 Tool cards with mobile-friendly styling
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 16,
            transition: `all ${m3Motion.duration.medium2}ms ${m3Motion.easing.standard}`,
          },
        },
        variants: [
          {
            props: { className: 'tool-card' },
            style: {
              backgroundColor: scheme.surfaceContainerLow,
              border: `2px solid ${scheme.outlineVariant}`,
              cursor: 'pointer',
              minHeight: 120, // Touch-friendly
              '&:hover': {
                borderColor: scheme.primary,
                boxShadow: m3Elevation.level3,
                transform: 'translateY(-4px)',
              },
              '&:active': {
                transform: 'translateY(-2px)',
                backgroundColor: alpha(scheme.primary, m3StateLayer.pressed),
              },
              '@media (max-width: 600px)': {
                minHeight: 100,
                '&:hover': {
                  transform: 'translateY(-2px)',
                },
              },
            },
          },
          {
            props: { className: 'result-card' },
            style: {
              backgroundColor: scheme.secondaryContainer,
              border: `1px solid ${scheme.outlineVariant}`,
              padding: 16,
            },
          },
        ],
      },
      // Mobile-first form inputs
      MuiTextField: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              backgroundColor: scheme.surfaceContainerLowest,
              borderRadius: 12,
              minHeight: 56, // Touch-friendly
              transition: `all ${m3Motion.duration.short4}ms ${m3Motion.easing.standard}`,
              '&.Mui-focused': {
                boxShadow: `0 0 0 3px ${alpha(scheme.primary, 0.15)}`,
              },
            },
            '& .MuiInputLabel-root': {
              fontSize: '1rem', // Prevent iOS zoom
            },
          },
        },
      },
      // M3 Result highlight boxes
      MuiPaper: {
        variants: [
          {
            props: { className: 'result-highlight' },
            style: {
              backgroundColor: scheme.primaryContainer,
              border: `1px solid ${scheme.outlineVariant}`,
              borderRadius: 12,
              padding: '16px 20px',
            },
          },
          {
            props: { className: 'm3-surface' },
            style: {
              backgroundColor: scheme.surfaceContainerLow,
              borderRadius: 16,
            },
          },
        ],
      },
      // Mobile-friendly stepper
      MuiStepper: {
        styleOverrides: {
          root: {
            backgroundColor: 'transparent',
            '@media (max-width: 600px)': {
              '& .MuiStepLabel-label': {
                fontSize: '0.75rem',
              },
            },
          },
        },
      },
      MuiStepIcon: {
        styleOverrides: {
          root: {
            color: scheme.outline,
            width: 32,
            height: 32,
            '&.Mui-active': {
              color: scheme.primary,
            },
            '&.Mui-completed': {
              color: scheme.tertiary,
            },
          },
        },
      },
      // Mobile-first buttons
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: 12,
            minHeight: 48,
            transition: `all ${m3Motion.duration.short4}ms ${m3Motion.easing.standard}`,
          },
        },
      },
      // Bottom navigation for mobile
      MuiBottomNavigation: {
        styleOverrides: {
          root: {
            backgroundColor: scheme.surfaceContainer,
            borderTop: `1px solid ${scheme.outlineVariant}`,
          },
        },
      },
      // FAB for primary actions
      MuiFab: {
        styleOverrides: {
          root: {
            backgroundColor: scheme.primaryContainer,
            color: scheme.onPrimaryContainer,
            boxShadow: m3Elevation.level3,
            '&:hover': {
              backgroundColor: scheme.primaryContainer,
              boxShadow: m3Elevation.level4,
            },
          },
        },
      },
    },
    custom: {
      tools: appTokens,
      m3: { scheme, accent: m3AppAccent },
    },
  });
};

// ============================================
// NEXUS CLASSROOM THEME (nexus.neramclasses.com)
// ============================================

/**
 * Nexus classroom theme - Premium, focused, learning-oriented
 * Optimized for content consumption and learning experience
 * Material 3 compliant with mobile-first responsive design
 */
export const createNexusTheme = (mode: 'light' | 'dark' = 'light'): Theme => {
  const baseTheme = mode === 'light' ? lightTheme : darkTheme;
  const scheme = mode === 'light' ? m3LightScheme : m3DarkScheme;

  return createTheme(baseTheme, {
    palette: {
      primary: {
        main: m3NexusPrimary.base,
        light: m3NexusPrimary.light,
        dark: m3NexusPrimary.dark,
        contrastText: '#FFFFFF',
      },
      secondary: {
        main: scheme.tertiary,
        light: scheme.tertiaryContainer,
        contrastText: scheme.onTertiary,
      },
      background: {
        default: scheme.background,
        paper: scheme.surface,
      },
    },
    components: {
      // M3 Sidebar styling with mobile drawer support
      MuiDrawer: {
        styleOverrides: {
          paper: {
            borderRight: 'none',
            transition: `all ${m3Motion.duration.medium2}ms ${m3Motion.easing.emphasized}`,
          },
        },
        variants: [
          {
            props: { className: 'nexus-sidebar' },
            style: {
              '& .MuiDrawer-paper': {
                backgroundColor: scheme.surfaceContainer,
                color: scheme.onSurface,
                width: 280,
                '@media (max-width: 600px)': {
                  width: '85vw',
                  maxWidth: 320,
                },
              },
            },
          },
        ],
      },
      // M3 Lesson cards with mobile optimization
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 16,
            transition: `all ${m3Motion.duration.medium2}ms ${m3Motion.easing.standard}`,
          },
        },
        variants: [
          {
            props: { className: 'lesson-card' },
            style: {
              backgroundColor: scheme.surfaceContainerLow,
              border: `1px solid ${scheme.outlineVariant}`,
              minHeight: 80, // Touch-friendly
              '&:hover': {
                boxShadow: m3Elevation.level2,
                backgroundColor: scheme.surfaceContainerHigh,
              },
              '&:active': {
                backgroundColor: alpha(m3NexusPrimary.base, m3StateLayer.pressed),
              },
            },
          },
          {
            props: { className: 'lesson-card-completed' },
            style: {
              borderLeft: `4px solid ${scheme.tertiary}`,
              backgroundColor: alpha(scheme.tertiaryContainer, 0.3),
            },
          },
          {
            props: { className: 'lesson-card-active' },
            style: {
              borderLeft: `4px solid ${m3NexusPrimary.base}`,
              backgroundColor: alpha(m3NexusPrimary.light, 0.1),
            },
          },
        ],
      },
      // M3 Progress indicators
      MuiLinearProgress: {
        styleOverrides: {
          root: {
            height: 8,
            borderRadius: 4,
            backgroundColor: scheme.surfaceContainerHighest,
          },
          bar: {
            borderRadius: 4,
          },
          barColorPrimary: {
            backgroundColor: m3NexusPrimary.base,
          },
        },
      },
      // Video player container - mobile optimized
      MuiPaper: {
        variants: [
          {
            props: { className: 'video-container' },
            style: {
              backgroundColor: '#000000',
              borderRadius: 16,
              overflow: 'hidden',
              aspectRatio: '16/9',
              '@media (max-width: 600px)': {
                borderRadius: 0,
                marginLeft: -16,
                marginRight: -16,
                width: 'calc(100% + 32px)',
              },
            },
          },
          {
            props: { className: 'm3-surface' },
            style: {
              backgroundColor: scheme.surfaceContainerLow,
              borderRadius: 16,
            },
          },
        ],
      },
      // Assignment accordions
      MuiAccordion: {
        styleOverrides: {
          root: {
            borderRadius: '12px !important',
            marginBottom: 8,
            backgroundColor: scheme.surfaceContainerLow,
            border: `1px solid ${scheme.outlineVariant}`,
            '&:before': {
              display: 'none',
            },
            '&.Mui-expanded': {
              margin: '0 0 8px 0',
            },
          },
        },
      },
      // M3 Status chips
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            fontWeight: 500,
            height: 32,
          },
        },
        variants: [
          {
            props: { className: 'status-completed' },
            style: {
              backgroundColor: scheme.tertiaryContainer,
              color: scheme.onTertiaryContainer,
            },
          },
          {
            props: { className: 'status-in-progress' },
            style: {
              backgroundColor: alpha(m3NexusPrimary.base, 0.12),
              color: m3NexusPrimary.base,
            },
          },
        ],
      },
      // Mobile-friendly buttons
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: 12,
            minHeight: 48,
          },
        },
      },
      // Mobile navigation rail / bottom nav
      MuiBottomNavigation: {
        styleOverrides: {
          root: {
            backgroundColor: scheme.surfaceContainer,
            borderTop: `1px solid ${scheme.outlineVariant}`,
            height: 80,
          },
        },
      },
      MuiBottomNavigationAction: {
        styleOverrides: {
          root: {
            color: scheme.onSurfaceVariant,
            '&.Mui-selected': {
              color: m3NexusPrimary.base,
            },
          },
        },
      },
    },
    custom: {
      nexus: nexusTokens,
      m3: { scheme, accent: m3NexusPrimary },
    },
  });
};

// ============================================
// ADMIN PANEL THEME (admin.neramclasses.com)
// ============================================

/**
 * Admin panel theme - Professional, data-focused, efficient
 * Optimized for data management and admin workflows
 * Material 3 compliant with mobile-first responsive design
 * Note: 40% desktop users, but quick reviews on mobile
 */
export const createAdminTheme = (mode: 'light' | 'dark' = 'light'): Theme => {
  const baseTheme = mode === 'light' ? lightTheme : darkTheme;
  const scheme = mode === 'light' ? m3LightScheme : m3DarkScheme;

  return createTheme(baseTheme, {
    palette: {
      primary: {
        main: scheme.primary,
        light: scheme.primaryContainer,
        contrastText: scheme.onPrimary,
      },
      secondary: {
        main: m3AdminAccent.base,
        light: m3AdminAccent.light,
        dark: m3AdminAccent.dark,
        contrastText: '#FFFFFF',
      },
      error: {
        main: scheme.error,
        light: scheme.errorContainer,
        contrastText: scheme.onError,
      },
      background: {
        default: scheme.background,
        paper: scheme.surface,
      },
    },
    components: {
      // M3 Admin sidebar with mobile drawer
      MuiDrawer: {
        styleOverrides: {
          paper: {
            borderRight: 'none',
            transition: `all ${m3Motion.duration.medium2}ms ${m3Motion.easing.emphasized}`,
          },
        },
        variants: [
          {
            props: { className: 'admin-sidebar' },
            style: {
              '& .MuiDrawer-paper': {
                backgroundColor: scheme.surfaceContainer,
                color: scheme.onSurface,
                width: 260,
                '@media (max-width: 900px)': {
                  width: 240,
                },
                '@media (max-width: 600px)': {
                  width: '85vw',
                  maxWidth: 300,
                },
              },
            },
          },
        ],
      },
      // M3 Admin header
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: scheme.surface,
            color: scheme.onSurface,
            boxShadow: 'none',
          },
        },
        variants: [
          {
            props: { className: 'admin-header' },
            style: {
              backgroundColor: scheme.surface,
              borderBottom: `1px solid ${scheme.outlineVariant}`,
            },
          },
        ],
      },
      // M3 Data tables - responsive
      MuiTableContainer: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            border: `1px solid ${scheme.outlineVariant}`,
            backgroundColor: scheme.surface,
            '@media (max-width: 600px)': {
              borderRadius: 8,
              overflowX: 'auto',
            },
          },
        },
      },
      MuiTableHead: {
        styleOverrides: {
          root: {
            backgroundColor: scheme.surfaceContainerLow,
            '& .MuiTableCell-root': {
              fontWeight: 600,
              color: scheme.onSurface,
            },
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            transition: `background-color ${m3Motion.duration.short4}ms`,
            '&:hover': {
              backgroundColor: alpha(scheme.primary, m3StateLayer.hover),
            },
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderColor: scheme.outlineVariant,
            padding: '16px',
            '@media (max-width: 600px)': {
              padding: '12px 8px',
              fontSize: '0.875rem',
            },
          },
        },
      },
      // M3 Status chips
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            fontWeight: 500,
            height: 28,
          },
        },
        variants: [
          {
            props: { className: 'status-pending' },
            style: {
              backgroundColor: alpha('#F59E0B', 0.12),
              color: '#B45309',
            },
          },
          {
            props: { className: 'status-approved' },
            style: {
              backgroundColor: scheme.tertiaryContainer,
              color: scheme.onTertiaryContainer,
            },
          },
          {
            props: { className: 'status-rejected' },
            style: {
              backgroundColor: scheme.errorContainer,
              color: scheme.onErrorContainer,
            },
          },
        ],
      },
      // M3 Stat cards - responsive
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 16,
            boxShadow: m3Elevation.level1,
            transition: `all ${m3Motion.duration.medium2}ms ${m3Motion.easing.standard}`,
          },
        },
        variants: [
          {
            props: { className: 'stat-card' },
            style: {
              padding: '20px',
              '@media (min-width: 600px)': {
                padding: '24px',
              },
            },
          },
          {
            props: { className: 'stat-card-primary' },
            style: {
              background: `linear-gradient(135deg, ${scheme.primary} 0%, ${scheme.primary}dd 100%)`,
              color: scheme.onPrimary,
            },
          },
          {
            props: { className: 'stat-card-secondary' },
            style: {
              backgroundColor: scheme.secondaryContainer,
              color: scheme.onSecondaryContainer,
            },
          },
          {
            props: { className: 'stat-card-accent' },
            style: {
              background: `linear-gradient(135deg, ${m3AdminAccent.base} 0%, ${m3AdminAccent.dark} 100%)`,
              color: '#FFFFFF',
            },
          },
        ],
      },
      // M3 Action buttons - touch-friendly
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: 12,
            minHeight: 44,
            transition: `all ${m3Motion.duration.short4}ms ${m3Motion.easing.standard}`,
            '@media (max-width: 600px)': {
              minHeight: 48,
              fontSize: '1rem',
            },
          },
        },
        variants: [
          {
            props: { className: 'action-approve' },
            style: {
              backgroundColor: scheme.tertiary,
              color: scheme.onTertiary,
              '&:hover': {
                backgroundColor: alpha(scheme.tertiary, 0.9),
                boxShadow: m3Elevation.level2,
              },
            },
          },
          {
            props: { className: 'action-reject' },
            style: {
              backgroundColor: scheme.error,
              color: scheme.onError,
              '&:hover': {
                backgroundColor: alpha(scheme.error, 0.9),
                boxShadow: m3Elevation.level2,
              },
            },
          },
        ],
      },
      // M3 Sidebar navigation
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            margin: '2px 8px',
            minHeight: 48, // Touch-friendly
            transition: `all ${m3Motion.duration.short4}ms`,
            '&.Mui-selected': {
              backgroundColor: scheme.secondaryContainer,
              color: scheme.onSecondaryContainer,
              '&:hover': {
                backgroundColor: alpha(scheme.secondaryContainer, 0.9),
              },
            },
            '&:hover': {
              backgroundColor: alpha(scheme.onSurface, m3StateLayer.hover),
            },
          },
        },
      },
      // Mobile FAB for quick actions
      MuiFab: {
        styleOverrides: {
          root: {
            backgroundColor: scheme.primaryContainer,
            color: scheme.onPrimaryContainer,
            boxShadow: m3Elevation.level3,
            '&:hover': {
              backgroundColor: scheme.primaryContainer,
              boxShadow: m3Elevation.level4,
            },
          },
        },
      },
      // Responsive dialogs
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 28,
            '@media (max-width: 600px)': {
              borderRadius: '28px 28px 0 0',
              margin: 0,
              maxHeight: '90vh',
              position: 'fixed',
              bottom: 0,
              width: '100%',
              maxWidth: '100%',
            },
          },
        },
      },
    },
    custom: {
      admin: adminTokens,
      m3: { scheme, accent: m3AdminAccent },
    },
  });
};

// ============================================
// THEME EXPORTS
// ============================================

export const marketingLightTheme = createMarketingTheme('light');
export const marketingDarkTheme = createMarketingTheme('dark');

export const toolsAppLightTheme = createToolsAppTheme('light');
export const toolsAppDarkTheme = createToolsAppTheme('dark');

export const nexusLightTheme = createNexusTheme('light');
export const nexusDarkTheme = createNexusTheme('dark');

export const adminLightTheme = createAdminTheme('light');
export const adminDarkTheme = createAdminTheme('dark');

// M3 accent types for type augmentation
type M3AccentType = typeof m3MarketingAccent | typeof m3AppAccent | typeof m3NexusPrimary | typeof m3AdminAccent;
type M3SchemeType = typeof m3LightScheme | typeof m3DarkScheme;

// Type augmentation for custom theme properties
declare module '@mui/material/styles' {
  interface Theme {
    custom?: {
      hero?: typeof marketingTokens;
      tools?: typeof appTokens;
      nexus?: typeof nexusTokens;
      admin?: typeof adminTokens;
      m3?: {
        scheme: M3SchemeType;
        accent: M3AccentType;
      };
    };
  }
  interface ThemeOptions {
    custom?: {
      hero?: typeof marketingTokens;
      tools?: typeof appTokens;
      nexus?: typeof nexusTokens;
      admin?: typeof adminTokens;
      m3?: {
        scheme: M3SchemeType;
        accent: M3AccentType;
      };
    };
  }
}

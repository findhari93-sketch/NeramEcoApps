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

// ============================================
// MARKETING SITE THEME (neramclasses.com)
// ============================================

/**
 * Marketing site theme - Warm, inviting, professional
 * Optimized for conversion and SEO landing pages
 */
export const createMarketingTheme = (mode: 'light' | 'dark' = 'light'): Theme => {
  const baseTheme = mode === 'light' ? lightTheme : darkTheme;
  
  return createTheme(baseTheme, {
    components: {
      // Hero sections with gradient backgrounds
      MuiBox: {
        variants: [
          {
            props: { className: 'hero-gradient' },
            style: {
              background: marketingTokens.heroGradient,
              color: '#FFFFFF',
            },
          },
          {
            props: { className: 'cta-gradient' },
            style: {
              background: marketingTokens.ctaGradient,
            },
          },
        ],
      },
      // Larger, more prominent buttons for CTAs
      MuiButton: {
        styleOverrides: {
          sizeLarge: {
            padding: '16px 40px',
            fontSize: '1.0625rem',
            borderRadius: borderRadius.lg,
          },
        },
        variants: [
          {
            props: { variant: 'contained', color: 'secondary' },
            style: {
              background: marketingTokens.ctaGradient,
              color: '#000000',
              fontWeight: 700,
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: shadows.lg,
              },
            },
          },
        ],
      },
      // Feature cards with hover effects
      MuiCard: {
        variants: [
          {
            props: { className: 'feature-card' },
            style: {
              borderRadius: borderRadius.xl,
              transition: 'all 0.3s ease',
              '&:hover': {
                transform: 'translateY(-8px)',
                boxShadow: marketingTokens.cardHoverShadow,
              },
            },
          },
          {
            props: { className: 'testimonial-card' },
            style: {
              borderRadius: borderRadius.xl,
              background: mode === 'light' 
                ? `linear-gradient(135deg, ${neutralColors.surface} 0%, ${neutralColors.surfaceVariant} 100%)`
                : 'linear-gradient(135deg, #1A1A1A 0%, #242424 100%)',
            },
          },
        ],
      },
      // Typography adjustments for marketing
      MuiTypography: {
        variants: [
          {
            props: { className: 'gradient-text' },
            style: {
              background: marketingTokens.heroGradient,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            },
          },
        ],
      },
    },
    // Custom properties for marketing
    custom: {
      hero: marketingTokens,
    },
  });
};

// ============================================
// TOOLS APP THEME (app.neramclasses.com)
// ============================================

/**
 * Tools app theme - Clean, functional, tool-focused
 * Optimized for interactive tools and data visualization
 */
export const createToolsAppTheme = (mode: 'light' | 'dark' = 'light'): Theme => {
  const baseTheme = mode === 'light' ? lightTheme : darkTheme;
  
  return createTheme(baseTheme, {
    components: {
      // Tool cards with distinct styling
      MuiCard: {
        variants: [
          {
            props: { className: 'tool-card' },
            style: {
              backgroundColor: appTokens.toolCardBg,
              border: `2px solid ${appTokens.toolCardBorder}`,
              borderRadius: borderRadius.xl,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              '&:hover': {
                borderColor: appTokens.toolCardHoverBorder,
                boxShadow: shadows.primary,
                transform: 'translateY(-4px)',
              },
            },
          },
          {
            props: { className: 'result-card' },
            style: {
              backgroundColor: alpha(secondaryColors[500], 0.05),
              border: `2px solid ${secondaryColors[200]}`,
              borderRadius: borderRadius.lg,
            },
          },
        ],
      },
      // Enhanced form inputs for tools
      MuiTextField: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              backgroundColor: mode === 'light' ? '#FFFFFF' : '#1A1A1A',
              '&.Mui-focused': {
                boxShadow: `0 0 0 3px ${alpha(primaryColors[500], 0.15)}`,
              },
            },
          },
        },
      },
      // Result highlight boxes
      MuiPaper: {
        variants: [
          {
            props: { className: 'result-highlight' },
            style: {
              backgroundColor: appTokens.resultHighlight,
              border: `1px solid ${secondaryColors[300]}`,
              borderRadius: borderRadius.md,
              padding: '16px 20px',
            },
          },
        ],
      },
      // Stepper for multi-step tools
      MuiStepper: {
        styleOverrides: {
          root: {
            backgroundColor: 'transparent',
          },
        },
      },
      MuiStepIcon: {
        styleOverrides: {
          root: {
            color: neutralColors.border,
            '&.Mui-active': {
              color: primaryColors[500],
            },
            '&.Mui-completed': {
              color: accentColors[500],
            },
          },
        },
      },
    },
    custom: {
      tools: appTokens,
    },
  });
};

// ============================================
// NEXUS CLASSROOM THEME (nexus.neramclasses.com)
// ============================================

/**
 * Nexus classroom theme - Premium, focused, learning-oriented
 * Optimized for content consumption and learning experience
 */
export const createNexusTheme = (mode: 'light' | 'dark' = 'light'): Theme => {
  const baseTheme = mode === 'light' ? lightTheme : darkTheme;
  
  return createTheme(baseTheme, {
    components: {
      // Sidebar styling
      MuiDrawer: {
        variants: [
          {
            props: { className: 'nexus-sidebar' },
            style: {
              '& .MuiDrawer-paper': {
                backgroundColor: nexusTokens.sidebarBg,
                color: nexusTokens.sidebarText,
                borderRight: 'none',
              },
            },
          },
        ],
      },
      // Lesson cards
      MuiCard: {
        variants: [
          {
            props: { className: 'lesson-card' },
            style: {
              backgroundColor: nexusTokens.lessonCardBg,
              borderRadius: borderRadius.lg,
              transition: 'all 0.2s ease',
              '&:hover': {
                boxShadow: shadows.md,
              },
            },
          },
          {
            props: { className: 'lesson-card-completed' },
            style: {
              borderLeft: `4px solid ${nexusTokens.completedBadge}`,
            },
          },
          {
            props: { className: 'lesson-card-active' },
            style: {
              borderLeft: `4px solid ${nexusTokens.progressBar}`,
            },
          },
        ],
      },
      // Progress indicators
      MuiLinearProgress: {
        styleOverrides: {
          root: {
            height: '6px',
            borderRadius: '3px',
          },
          barColorPrimary: {
            backgroundColor: nexusTokens.progressBar,
          },
        },
      },
      // Video player container
      MuiPaper: {
        variants: [
          {
            props: { className: 'video-container' },
            style: {
              backgroundColor: '#000000',
              borderRadius: borderRadius.lg,
              overflow: 'hidden',
              aspectRatio: '16/9',
            },
          },
        ],
      },
      // Assignment cards
      MuiAccordion: {
        variants: [
          {
            props: { className: 'assignment-accordion' },
            style: {
              borderRadius: borderRadius.md,
              marginBottom: '8px',
              '&:before': {
                display: 'none',
              },
            },
          },
        ],
      },
      // Chip for status
      MuiChip: {
        variants: [
          {
            props: { className: 'status-completed' },
            style: {
              backgroundColor: alpha(nexusTokens.completedBadge, 0.1),
              color: nexusTokens.completedBadge,
              fontWeight: 600,
            },
          },
          {
            props: { className: 'status-in-progress' },
            style: {
              backgroundColor: alpha(nexusTokens.progressBar, 0.1),
              color: nexusTokens.progressBar,
              fontWeight: 600,
            },
          },
        ],
      },
    },
    custom: {
      nexus: nexusTokens,
    },
  });
};

// ============================================
// ADMIN PANEL THEME (admin.neramclasses.com)
// ============================================

/**
 * Admin panel theme - Professional, data-focused, efficient
 * Optimized for data management and admin workflows
 */
export const createAdminTheme = (mode: 'light' | 'dark' = 'light'): Theme => {
  const baseTheme = mode === 'light' ? lightTheme : darkTheme;
  
  return createTheme(baseTheme, {
    components: {
      // Admin sidebar
      MuiDrawer: {
        variants: [
          {
            props: { className: 'admin-sidebar' },
            style: {
              '& .MuiDrawer-paper': {
                backgroundColor: adminTokens.sidebarBg,
                color: adminTokens.sidebarText,
                borderRight: 'none',
                width: 260,
              },
            },
          },
        ],
      },
      // Admin header
      MuiAppBar: {
        variants: [
          {
            props: { className: 'admin-header' },
            style: {
              backgroundColor: adminTokens.headerBg,
              borderBottom: `1px solid ${adminTokens.tableBorder}`,
            },
          },
        ],
      },
      // Data tables
      MuiTableContainer: {
        styleOverrides: {
          root: {
            borderRadius: borderRadius.md,
            border: `1px solid ${adminTokens.tableBorder}`,
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            '&:hover': {
              backgroundColor: adminTokens.tableRowHover,
            },
          },
        },
      },
      // Status chips for admin
      MuiChip: {
        variants: [
          {
            props: { className: 'status-pending' },
            style: {
              backgroundColor: alpha(adminTokens.statusPending, 0.15),
              color: adminTokens.statusPending,
              fontWeight: 600,
            },
          },
          {
            props: { className: 'status-approved' },
            style: {
              backgroundColor: alpha(adminTokens.statusApproved, 0.15),
              color: adminTokens.statusApproved,
              fontWeight: 600,
            },
          },
          {
            props: { className: 'status-rejected' },
            style: {
              backgroundColor: alpha(adminTokens.statusRejected, 0.15),
              color: adminTokens.statusRejected,
              fontWeight: 600,
            },
          },
        ],
      },
      // Stat cards for dashboard
      MuiCard: {
        variants: [
          {
            props: { className: 'stat-card' },
            style: {
              borderRadius: borderRadius.lg,
              padding: '24px',
            },
          },
          {
            props: { className: 'stat-card-primary' },
            style: {
              background: `linear-gradient(135deg, ${primaryColors[500]} 0%, ${primaryColors[700]} 100%)`,
              color: '#FFFFFF',
            },
          },
          {
            props: { className: 'stat-card-secondary' },
            style: {
              background: `linear-gradient(135deg, ${secondaryColors[500]} 0%, ${secondaryColors[600]} 100%)`,
              color: '#000000',
            },
          },
          {
            props: { className: 'stat-card-accent' },
            style: {
              background: `linear-gradient(135deg, ${accentColors[500]} 0%, ${accentColors[700]} 100%)`,
              color: '#FFFFFF',
            },
          },
        ],
      },
      // Quick action buttons
      MuiButton: {
        variants: [
          {
            props: { className: 'action-approve' },
            style: {
              backgroundColor: adminTokens.statusApproved,
              color: '#FFFFFF',
              '&:hover': {
                backgroundColor: alpha(adminTokens.statusApproved, 0.9),
              },
            },
          },
          {
            props: { className: 'action-reject' },
            style: {
              backgroundColor: adminTokens.statusRejected,
              color: '#FFFFFF',
              '&:hover': {
                backgroundColor: alpha(adminTokens.statusRejected, 0.9),
              },
            },
          },
        ],
      },
      // List items for sidebar navigation
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: borderRadius.base,
            margin: '2px 8px',
            '&.Mui-selected': {
              backgroundColor: alpha('#FFFFFF', 0.12),
              '&:hover': {
                backgroundColor: alpha('#FFFFFF', 0.16),
              },
            },
            '&:hover': {
              backgroundColor: alpha('#FFFFFF', 0.08),
            },
          },
        },
      },
    },
    custom: {
      admin: adminTokens,
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

// Type augmentation for custom theme properties
declare module '@mui/material/styles' {
  interface Theme {
    custom?: {
      hero?: typeof marketingTokens;
      tools?: typeof appTokens;
      nexus?: typeof nexusTokens;
      admin?: typeof adminTokens;
    };
  }
  interface ThemeOptions {
    custom?: {
      hero?: typeof marketingTokens;
      tools?: typeof appTokens;
      nexus?: typeof nexusTokens;
      admin?: typeof adminTokens;
    };
  }
}

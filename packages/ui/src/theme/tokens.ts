/**
 * Neram Classes - Design Tokens
 * 
 * This file contains all design tokens for the Neram Classes ecosystem.
 * These tokens ensure visual consistency across all applications:
 * - neramclasses.com (Marketing/SEO)
 * - app.neramclasses.com (Tools App)
 * - nexus.neramclasses.com (Classroom)
 * - admin.neramclasses.com (Admin Panel)
 */

// ============================================
// COLOR PALETTE
// ============================================

/**
 * Primary Color: Deep Azure Blue
 * Represents trust, professionalism, and knowledge
 * Used for primary actions, headers, and brand elements
 */
export const primaryColors = {
  50: '#E3F2FD',
  100: '#BBDEFB',
  200: '#90CAF9',
  300: '#64B5F6',
  400: '#42A5F5',
  500: '#1565C0', // Primary - Deep Azure
  600: '#1258A8',
  700: '#0D47A1',
  800: '#0A3A84',
  900: '#062C67',
  A100: '#82B1FF',
  A200: '#448AFF',
  A400: '#2979FF',
  A700: '#2962FF',
} as const;

/**
 * Secondary Color: Warm Amber/Gold
 * Represents excellence, achievement, and warmth
 * Used for highlights, CTAs, and success states
 */
export const secondaryColors = {
  50: '#FFF8E1',
  100: '#FFECB3',
  200: '#FFE082',
  300: '#FFD54F',
  400: '#FFCA28',
  500: '#F9A825', // Secondary - Warm Amber
  600: '#F57F17',
  700: '#EF6C00',
  800: '#E65100',
  900: '#BF360C',
  A100: '#FFE57F',
  A200: '#FFD740',
  A400: '#FFC400',
  A700: '#FFAB00',
} as const;

/**
 * Accent Color: Vibrant Teal
 * Represents creativity and freshness
 * Used for special highlights and creative elements
 */
export const accentColors = {
  50: '#E0F2F1',
  100: '#B2DFDB',
  200: '#80CBC4',
  300: '#4DB6AC',
  400: '#26A69A',
  500: '#00897B', // Accent - Teal
  600: '#00796B',
  700: '#00695C',
  800: '#004D40',
  900: '#003D33',
} as const;

/**
 * Neutral Colors
 * Used for backgrounds, text, and borders
 */
export const neutralColors = {
  white: '#FFFFFF',
  background: '#FAFBFC',
  surface: '#FFFFFF',
  surfaceVariant: '#F5F7FA',
  border: '#E1E5EB',
  borderLight: '#F0F2F5',
  divider: '#E8EAED',
  textPrimary: '#1A2027',
  textSecondary: '#5A6672',
  textTertiary: '#8B95A1',
  textDisabled: '#B8C0CC',
  black: '#000000',
} as const;

/**
 * Semantic Colors
 * Used for feedback states
 */
export const semanticColors = {
  success: {
    light: '#E8F5E9',
    main: '#2E7D32',
    dark: '#1B5E20',
    contrastText: '#FFFFFF',
  },
  error: {
    light: '#FFEBEE',
    main: '#C62828',
    dark: '#B71C1C',
    contrastText: '#FFFFFF',
  },
  warning: {
    light: '#FFF3E0',
    main: '#EF6C00',
    dark: '#E65100',
    contrastText: '#FFFFFF',
  },
  info: {
    light: '#E3F2FD',
    main: '#1565C0',
    dark: '#0D47A1',
    contrastText: '#FFFFFF',
  },
} as const;

// ============================================
// TYPOGRAPHY
// ============================================

/**
 * Font Families
 * - Display: Poppins - Modern, geometric, excellent for headings
 * - Body: Inter - Highly readable, designed for screens
 * - Tamil: Noto Sans Tamil - For Tamil language support
 */
export const fontFamilies = {
  display: '"Poppins", "Noto Sans Tamil", sans-serif',
  body: '"Inter", "Noto Sans Tamil", sans-serif',
  mono: '"JetBrains Mono", "Fira Code", monospace',
  tamil: '"Noto Sans Tamil", "Poppins", sans-serif',
} as const;

/**
 * Font Weights
 */
export const fontWeights = {
  light: 300,
  regular: 400,
  medium: 500,
  semiBold: 600,
  bold: 700,
  extraBold: 800,
} as const;

/**
 * Font Sizes (in rem)
 */
export const fontSizes = {
  xs: '0.75rem',    // 12px
  sm: '0.875rem',   // 14px
  base: '1rem',     // 16px
  lg: '1.125rem',   // 18px
  xl: '1.25rem',    // 20px
  '2xl': '1.5rem',  // 24px
  '3xl': '1.875rem', // 30px
  '4xl': '2.25rem', // 36px
  '5xl': '3rem',    // 48px
  '6xl': '3.75rem', // 60px
  '7xl': '4.5rem',  // 72px
} as const;

/**
 * Line Heights
 */
export const lineHeights = {
  tight: 1.2,
  snug: 1.375,
  normal: 1.5,
  relaxed: 1.625,
  loose: 2,
} as const;

/**
 * Letter Spacing
 */
export const letterSpacing = {
  tighter: '-0.05em',
  tight: '-0.025em',
  normal: '0',
  wide: '0.025em',
  wider: '0.05em',
  widest: '0.1em',
} as const;

// ============================================
// SPACING
// ============================================

export const spacing = {
  0: '0',
  1: '0.25rem',   // 4px
  2: '0.5rem',    // 8px
  3: '0.75rem',   // 12px
  4: '1rem',      // 16px
  5: '1.25rem',   // 20px
  6: '1.5rem',    // 24px
  8: '2rem',      // 32px
  10: '2.5rem',   // 40px
  12: '3rem',     // 48px
  16: '4rem',     // 64px
  20: '5rem',     // 80px
  24: '6rem',     // 96px
  32: '8rem',     // 128px
} as const;

// ============================================
// BORDER RADIUS
// ============================================

export const borderRadius = {
  none: '0',
  sm: '0.25rem',    // 4px
  base: '0.5rem',   // 8px
  md: '0.75rem',    // 12px
  lg: '1rem',       // 16px
  xl: '1.5rem',     // 24px
  '2xl': '2rem',    // 32px
  full: '9999px',
} as const;

// ============================================
// SHADOWS
// ============================================

export const shadows = {
  none: 'none',
  xs: '0 1px 2px rgba(0, 0, 0, 0.05)',
  sm: '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06)',
  base: '0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -1px rgba(0, 0, 0, 0.04)',
  md: '0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.04)',
  lg: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
  xl: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  inner: 'inset 0 2px 4px rgba(0, 0, 0, 0.06)',
  // Colored shadows for cards
  primary: '0 10px 40px -10px rgba(21, 101, 192, 0.3)',
  secondary: '0 10px 40px -10px rgba(249, 168, 37, 0.3)',
  accent: '0 10px 40px -10px rgba(0, 137, 123, 0.3)',
} as const;

// ============================================
// Z-INDEX
// ============================================

export const zIndex = {
  hide: -1,
  base: 0,
  dropdown: 1000,
  sticky: 1100,
  fixed: 1200,
  modalBackdrop: 1300,
  modal: 1400,
  popover: 1500,
  tooltip: 1600,
  toast: 1700,
} as const;

// ============================================
// BREAKPOINTS
// ============================================

export const breakpoints = {
  xs: 0,
  sm: 600,
  md: 900,
  lg: 1200,
  xl: 1536,
} as const;

// ============================================
// TRANSITIONS
// ============================================

export const transitions = {
  duration: {
    shortest: 150,
    shorter: 200,
    short: 250,
    standard: 300,
    complex: 375,
    enteringScreen: 225,
    leavingScreen: 195,
  },
  easing: {
    easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    easeOut: 'cubic-bezier(0.0, 0, 0.2, 1)',
    easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
    sharp: 'cubic-bezier(0.4, 0, 0.6, 1)',
    bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  },
} as const;

// ============================================
// APP-SPECIFIC TOKENS
// ============================================

/**
 * Marketing Site (neramclasses.com)
 * Warm, inviting, professional
 */
export const marketingTokens = {
  heroGradient: `linear-gradient(135deg, ${primaryColors[700]} 0%, ${primaryColors[500]} 50%, ${accentColors[600]} 100%)`,
  ctaGradient: `linear-gradient(135deg, ${secondaryColors[500]} 0%, ${secondaryColors[600]} 100%)`,
  cardHoverShadow: shadows.primary,
  sectionPadding: {
    mobile: spacing[8],
    tablet: spacing[12],
    desktop: spacing[16],
  },
} as const;

/**
 * Tools App (app.neramclasses.com)
 * Clean, functional, tool-focused
 */
export const appTokens = {
  toolCardBg: neutralColors.surface,
  toolCardBorder: neutralColors.border,
  toolCardHoverBorder: primaryColors[300],
  resultHighlight: secondaryColors[100],
  inputFocusRing: primaryColors[500],
} as const;

/**
 * Nexus Classroom (nexus.neramclasses.com)
 * Premium, focused, learning-oriented
 */
export const nexusTokens = {
  sidebarBg: primaryColors[900],
  sidebarText: neutralColors.white,
  lessonCardBg: neutralColors.surface,
  progressBar: secondaryColors[500],
  completedBadge: semanticColors.success.main,
} as const;

/**
 * Admin Panel (admin.neramclasses.com)
 * Professional, data-focused, efficient
 */
export const adminTokens = {
  sidebarBg: '#1A2027',
  sidebarText: neutralColors.white,
  headerBg: neutralColors.surface,
  tableBorder: neutralColors.border,
  tableRowHover: neutralColors.surfaceVariant,
  statusPending: secondaryColors[500],
  statusApproved: semanticColors.success.main,
  statusRejected: semanticColors.error.main,
} as const;

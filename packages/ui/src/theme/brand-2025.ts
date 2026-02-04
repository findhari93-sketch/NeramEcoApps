/**
 * Neram Classes - Material 3 Brand Tokens 2025
 *
 * Material You / Material 3 Design System
 * Generated from seed color: #1A73E8 (Google Blue)
 *
 * Features:
 * - Tonal color palettes (0-100 scale)
 * - Dynamic color support
 * - Dark mode optimized
 * - WCAG AA+ accessible
 */

// ============================================
// MATERIAL 3 TONAL PALETTES
// ============================================

/**
 * Primary Color: Education Blue
 * Seed: #1A73E8
 * Represents trust, knowledge, and professionalism
 */
export const m3Primary = {
  0: '#000000',
  10: '#001D36',
  20: '#003258',
  25: '#003D6B',
  30: '#00497D',
  35: '#005590',
  40: '#1A73E8', // Primary (seed)
  50: '#4285F4',
  60: '#669DF6',
  70: '#8AB4F8',
  80: '#A8C7FA',
  90: '#D3E3FD',
  95: '#ECF3FE',
  98: '#F6F9FF',
  99: '#FDFBFF',
  100: '#FFFFFF',
} as const;

/**
 * Secondary Color: Teal
 * Complementary to primary
 * Represents growth and creativity
 */
export const m3Secondary = {
  0: '#000000',
  10: '#00201C',
  20: '#003731',
  25: '#00433C',
  30: '#004F47',
  35: '#005B52',
  40: '#00897B', // Secondary
  50: '#00A896',
  60: '#00C4AE',
  70: '#4DE0CE',
  80: '#80CBC4',
  90: '#B2DFDB',
  95: '#D0F5F0',
  99: '#F2FFFE',
  100: '#FFFFFF',
} as const;

/**
 * Tertiary Color: Warm Amber
 * Accent color for highlights
 * Represents achievement and excellence
 */
export const m3Tertiary = {
  0: '#000000',
  10: '#261A00',
  20: '#412D00',
  25: '#4F3700',
  30: '#5E4200',
  35: '#6D4D00',
  40: '#F9A825', // Tertiary
  50: '#FFB938',
  60: '#FFCA4B',
  70: '#FFDB6E',
  80: '#FFE082',
  90: '#FFF0C4',
  95: '#FFF8E1',
  99: '#FFFDF8',
  100: '#FFFFFF',
} as const;

/**
 * Error Color
 */
export const m3Error = {
  0: '#000000',
  10: '#410002',
  20: '#690005',
  25: '#7E0007',
  30: '#93000A',
  35: '#A80710',
  40: '#BA1A1A', // Error
  50: '#DE3730',
  60: '#FF5449',
  70: '#FF897D',
  80: '#FFB4AB',
  90: '#FFDAD6',
  95: '#FFEDEA',
  99: '#FFFBFF',
  100: '#FFFFFF',
} as const;

/**
 * Neutral Color (for surfaces and text)
 */
export const m3Neutral = {
  0: '#000000',
  4: '#0D0E11',
  6: '#121316',
  10: '#1C1B1F', // Surface Dark
  12: '#201F23',
  17: '#2B2A2E',
  20: '#313033',
  22: '#363538',
  24: '#3B3A3D',
  25: '#3D3C40',
  30: '#48474B',
  35: '#545356',
  40: '#605F62',
  50: '#79767A',
  60: '#938F94',
  70: '#AEA9AE',
  80: '#CAC5CA',
  87: '#DDD8DD',
  90: '#E6E1E5',
  92: '#ECE7EB',
  94: '#F2EDF1',
  95: '#F4EFF4',
  96: '#F7F2F6',
  98: '#FDF8FC',
  99: '#FFFBFE', // Surface Light
  100: '#FFFFFF',
} as const;

/**
 * Neutral Variant (for containers and outlines)
 */
export const m3NeutralVariant = {
  0: '#000000',
  10: '#1D1A22',
  20: '#322F37',
  25: '#3D3A42',
  30: '#49454F',
  35: '#55515A',
  40: '#615D66',
  50: '#7A757F',
  60: '#948F99',
  70: '#AFA9B3',
  80: '#CAC4CF',
  90: '#E7E0EB',
  95: '#F5EEF9',
  99: '#FFFBFE',
  100: '#FFFFFF',
} as const;

// ============================================
// APP-SPECIFIC ACCENT COLORS
// ============================================

/**
 * Marketing App Accent: Warm Orange
 */
export const m3MarketingAccent = {
  40: '#F97316', // Orange
  80: '#FFCC80',
  90: '#FFE0B2',
  // Aliases for variants.ts compatibility
  base: '#F97316',
  light: '#FFCC80',
  dark: '#EA580C',
} as const;

/**
 * Student App Accent: Purple
 */
export const m3AppAccent = {
  40: '#8B5CF6', // Purple
  80: '#C4B5FD',
  90: '#EDE9FE',
  // Aliases for variants.ts compatibility
  base: '#8B5CF6',
  light: '#C4B5FD',
  dark: '#7C3AED',
} as const;

/**
 * Nexus LMS Primary: Purple (different from student app)
 */
export const m3NexusPrimary = {
  10: '#21005D',
  20: '#381E72',
  30: '#4F378B',
  40: '#7C3AED', // Nexus Primary
  50: '#9A5AFF',
  60: '#B17CFF',
  80: '#CFBCFF',
  90: '#EADDFF',
  95: '#F6EDFF',
  // Aliases for variants.ts compatibility
  base: '#7C3AED',
  light: '#CFBCFF',
  dark: '#4F378B',
} as const;

/**
 * Nexus LMS Accent: Green
 */
export const m3NexusAccent = {
  40: '#059669', // Green
  80: '#6EE7B7',
  90: '#D1FAE5',
} as const;

/**
 * Admin Accent: Red (for alerts/actions)
 */
export const m3AdminAccent = {
  40: '#DC2626', // Red
  80: '#FCA5A5',
  90: '#FEE2E2',
  // Aliases for variants.ts compatibility
  base: '#DC2626',
  light: '#FCA5A5',
  dark: '#B91C1C',
} as const;

// ============================================
// MATERIAL 3 SURFACE COLORS
// ============================================

export const m3Surfaces = {
  light: {
    surface: m3Neutral[99],
    surfaceContainerLowest: m3Neutral[100],
    surfaceContainerLow: m3Neutral[96],
    surfaceContainer: m3Neutral[94],
    surfaceContainerHigh: m3Neutral[92],
    surfaceContainerHighest: m3Neutral[90],
    surfaceDim: m3Neutral[87],
    surfaceBright: m3Neutral[98],
    onSurface: m3Neutral[10],
    onSurfaceVariant: m3NeutralVariant[30],
    outline: m3NeutralVariant[50],
    outlineVariant: m3NeutralVariant[80],
  },
  dark: {
    surface: m3Neutral[6],
    surfaceContainerLowest: m3Neutral[4],
    surfaceContainerLow: m3Neutral[10],
    surfaceContainer: m3Neutral[12],
    surfaceContainerHigh: m3Neutral[17],
    surfaceContainerHighest: m3Neutral[22],
    surfaceDim: m3Neutral[6],
    surfaceBright: m3Neutral[24],
    onSurface: m3Neutral[90],
    onSurfaceVariant: m3NeutralVariant[80],
    outline: m3NeutralVariant[60],
    outlineVariant: m3NeutralVariant[30],
  },
} as const;

// ============================================
// MATERIAL 3 COLOR ROLES
// ============================================

export const m3LightScheme = {
  primary: m3Primary[40],
  onPrimary: m3Primary[100],
  primaryContainer: m3Primary[90],
  onPrimaryContainer: m3Primary[10],

  secondary: m3Secondary[40],
  onSecondary: m3Secondary[100],
  secondaryContainer: m3Secondary[90],
  onSecondaryContainer: m3Secondary[10],

  tertiary: m3Tertiary[40],
  onTertiary: m3Tertiary[100],
  tertiaryContainer: m3Tertiary[90],
  onTertiaryContainer: m3Tertiary[10],

  error: m3Error[40],
  onError: m3Error[100],
  errorContainer: m3Error[90],
  onErrorContainer: m3Error[10],

  background: m3Neutral[99],
  onBackground: m3Neutral[10],

  ...m3Surfaces.light,

  inverseSurface: m3Neutral[20],
  inverseOnSurface: m3Neutral[95],
  inversePrimary: m3Primary[80],

  shadow: m3Neutral[0],
  scrim: m3Neutral[0],
} as const;

export const m3DarkScheme = {
  primary: m3Primary[80],
  onPrimary: m3Primary[20],
  primaryContainer: m3Primary[30],
  onPrimaryContainer: m3Primary[90],

  secondary: m3Secondary[80],
  onSecondary: m3Secondary[20],
  secondaryContainer: m3Secondary[30],
  onSecondaryContainer: m3Secondary[90],

  tertiary: m3Tertiary[80],
  onTertiary: m3Tertiary[20],
  tertiaryContainer: m3Tertiary[30],
  onTertiaryContainer: m3Tertiary[90],

  error: m3Error[80],
  onError: m3Error[20],
  errorContainer: m3Error[30],
  onErrorContainer: m3Error[90],

  background: m3Neutral[10],
  onBackground: m3Neutral[90],

  ...m3Surfaces.dark,

  inverseSurface: m3Neutral[90],
  inverseOnSurface: m3Neutral[20],
  inversePrimary: m3Primary[40],

  shadow: m3Neutral[0],
  scrim: m3Neutral[0],
} as const;

// ============================================
// MATERIAL 3 ELEVATION (Surface Tint)
// ============================================

export const m3Elevation = {
  level0: 'transparent',
  level1: 'rgba(26, 115, 232, 0.05)', // Primary at 5%
  level2: 'rgba(26, 115, 232, 0.08)', // Primary at 8%
  level3: 'rgba(26, 115, 232, 0.11)', // Primary at 11%
  level4: 'rgba(26, 115, 232, 0.12)', // Primary at 12%
  level5: 'rgba(26, 115, 232, 0.14)', // Primary at 14%
} as const;

// ============================================
// MATERIAL 3 TYPOGRAPHY
// ============================================

export const m3Typography = {
  fontFamily: {
    brand: '"Plus Jakarta Sans", "Inter", sans-serif',
    plain: '"Inter", "Noto Sans Tamil", system-ui, sans-serif',
    weightRegular: 400,
    weightMedium: 500,
    weightBold: 700,
  },
  displayLarge: {
    fontFamily: '"Plus Jakarta Sans", sans-serif',
    fontSize: '3.5625rem', // 57px
    fontWeight: 400,
    lineHeight: 1.12,
    letterSpacing: '-0.25px',
  },
  displayMedium: {
    fontFamily: '"Plus Jakarta Sans", sans-serif',
    fontSize: '2.8125rem', // 45px
    fontWeight: 400,
    lineHeight: 1.16,
    letterSpacing: '0px',
  },
  displaySmall: {
    fontFamily: '"Plus Jakarta Sans", sans-serif',
    fontSize: '2.25rem', // 36px
    fontWeight: 400,
    lineHeight: 1.22,
    letterSpacing: '0px',
  },
  headlineLarge: {
    fontFamily: '"Plus Jakarta Sans", sans-serif',
    fontSize: '2rem', // 32px
    fontWeight: 500,
    lineHeight: 1.25,
    letterSpacing: '0px',
  },
  headlineMedium: {
    fontFamily: '"Plus Jakarta Sans", sans-serif',
    fontSize: '1.75rem', // 28px
    fontWeight: 500,
    lineHeight: 1.29,
    letterSpacing: '0px',
  },
  headlineSmall: {
    fontFamily: '"Plus Jakarta Sans", sans-serif',
    fontSize: '1.5rem', // 24px
    fontWeight: 500,
    lineHeight: 1.33,
    letterSpacing: '0px',
  },
  titleLarge: {
    fontFamily: '"Inter", sans-serif',
    fontSize: '1.375rem', // 22px
    fontWeight: 500,
    lineHeight: 1.27,
    letterSpacing: '0px',
  },
  titleMedium: {
    fontFamily: '"Inter", sans-serif',
    fontSize: '1rem', // 16px
    fontWeight: 500,
    lineHeight: 1.5,
    letterSpacing: '0.15px',
  },
  titleSmall: {
    fontFamily: '"Inter", sans-serif',
    fontSize: '0.875rem', // 14px
    fontWeight: 500,
    lineHeight: 1.43,
    letterSpacing: '0.1px',
  },
  bodyLarge: {
    fontFamily: '"Inter", sans-serif',
    fontSize: '1rem', // 16px
    fontWeight: 400,
    lineHeight: 1.5,
    letterSpacing: '0.5px',
  },
  bodyMedium: {
    fontFamily: '"Inter", sans-serif',
    fontSize: '0.875rem', // 14px
    fontWeight: 400,
    lineHeight: 1.43,
    letterSpacing: '0.25px',
  },
  bodySmall: {
    fontFamily: '"Inter", sans-serif',
    fontSize: '0.75rem', // 12px
    fontWeight: 400,
    lineHeight: 1.33,
    letterSpacing: '0.4px',
  },
  labelLarge: {
    fontFamily: '"Inter", sans-serif',
    fontSize: '0.875rem', // 14px
    fontWeight: 500,
    lineHeight: 1.43,
    letterSpacing: '0.1px',
  },
  labelMedium: {
    fontFamily: '"Inter", sans-serif',
    fontSize: '0.75rem', // 12px
    fontWeight: 500,
    lineHeight: 1.33,
    letterSpacing: '0.5px',
  },
  labelSmall: {
    fontFamily: '"Inter", sans-serif',
    fontSize: '0.6875rem', // 11px
    fontWeight: 500,
    lineHeight: 1.45,
    letterSpacing: '0.5px',
  },
} as const;

// ============================================
// MATERIAL 3 MOTION
// ============================================

export const m3Motion = {
  easing: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    standardDecelerate: 'cubic-bezier(0, 0, 0, 1)',
    standardAccelerate: 'cubic-bezier(0.3, 0, 1, 1)',
    emphasized: 'cubic-bezier(0.2, 0, 0, 1)',
    emphasizedDecelerate: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
    emphasizedAccelerate: 'cubic-bezier(0.3, 0, 0.8, 0.15)',
    legacy: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
  duration: {
    short1: 50,
    short2: 100,
    short3: 150,
    short4: 200,
    medium1: 250,
    medium2: 300,
    medium3: 350,
    medium4: 400,
    long1: 450,
    long2: 500,
    long3: 550,
    long4: 600,
    extraLong1: 700,
    extraLong2: 800,
    extraLong3: 900,
    extraLong4: 1000,
  },
} as const;

// ============================================
// MATERIAL 3 STATE LAYERS
// ============================================

export const m3StateLayer = {
  hover: 0.08,
  focus: 0.12,
  pressed: 0.12,
  dragged: 0.16,
} as const;

// ============================================
// GRADIENTS (M3-Compatible)
// ============================================

export const m3Gradients = {
  primaryHero: `linear-gradient(135deg, ${m3Primary[30]} 0%, ${m3Primary[40]} 50%, ${m3Primary[50]} 100%)`,
  secondaryHero: `linear-gradient(135deg, ${m3Secondary[30]} 0%, ${m3Secondary[40]} 100%)`,
  tertiaryAccent: `linear-gradient(135deg, ${m3Tertiary[40]} 0%, ${m3Tertiary[50]} 100%)`,
  surfaceGradient: `linear-gradient(180deg, ${m3Neutral[99]} 0%, ${m3Neutral[95]} 100%)`,
  darkSurfaceGradient: `linear-gradient(180deg, ${m3Neutral[10]} 0%, ${m3Neutral[6]} 100%)`,
} as const;

// ============================================
// EXPORT TYPE HELPERS
// ============================================

export type M3ColorScheme = typeof m3LightScheme;
export type M3Typography = typeof m3Typography;
export type M3Motion = typeof m3Motion;

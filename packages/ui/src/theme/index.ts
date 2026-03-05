'use client';

/**
 * Neram Classes - Theme Module
 *
 * Exports all theme-related utilities, tokens, and components
 */

// Design Tokens
export * from './tokens';

// Base Theme
export {
  createNeramTheme,
  lightTheme,
  darkTheme,
  default as theme,
} from './theme';

// App-Specific Themes
export {
  createMarketingTheme,
  createToolsAppTheme,
  createNexusTheme,
  createAdminTheme,
  marketingLightTheme,
  marketingDarkTheme,
  toolsAppLightTheme,
  toolsAppDarkTheme,
  nexusLightTheme,
  nexusDarkTheme,
  adminLightTheme,
  adminDarkTheme,
} from './variants';

// Theme Provider
export {
  NeramThemeProvider,
  useThemeMode,
  ThemeModeToggle,
  createEmotionCache,
} from './provider';
export type { ThemeMode, ThemeContextType, ThemeProviderProps } from './provider';

// aiArchitek Era 2026 Tokens & Themes
export { neramTokens, neramFontFamilies, neramShadows } from './neram-2026';
export type { NeramTokens, NeramFontFamilies, NeramShadows } from './neram-2026';
export { neramaiArchitekDarkTheme, neramaiArchitekLightTheme } from './variants-2026';

// Theme Registry (SSR-compatible for Next.js App Router)
export { ThemeRegistry } from './ThemeRegistry';

// Re-export useful MUI utilities
export {
  useTheme,
  styled,
  alpha,
  darken,
  lighten,
} from '@mui/material/styles';
export { useMediaQuery } from '@mui/material';
export type { Theme, ThemeOptions, SxProps } from '@mui/material/styles';

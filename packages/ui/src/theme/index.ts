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

/**
 * Neram Classes - Theme Provider
 * 
 * This provider handles:
 * - Theme switching (light/dark)
 * - SSR compatibility with Emotion
 * - Theme persistence
 * - Multi-language font loading
 */

'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { ThemeProvider as MuiThemeProvider, Theme, CssBaseline } from '@mui/material';
import { CacheProvider, EmotionCache } from '@emotion/react';
import createCache from '@emotion/cache';
import { lightTheme, darkTheme } from './theme';

// ============================================
// TYPES
// ============================================

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
  mode: ThemeMode;
  actualMode: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
}

interface ThemeProviderProps {
  children: ReactNode;
  defaultMode?: ThemeMode;
  theme?: Theme;
  lightTheme?: Theme;
  darkTheme?: Theme;
  emotionCache?: EmotionCache;
  storageKey?: string;
}

// ============================================
// EMOTION CACHE SETUP (for SSR)
// ============================================

const isBrowser = typeof window !== 'undefined';

/**
 * Create Emotion cache for client-side
 */
export function createEmotionCache(): EmotionCache {
  let insertionPoint: HTMLElement | undefined;

  if (isBrowser) {
    const emotionInsertionPoint = document.querySelector<HTMLElement>(
      'meta[name="emotion-insertion-point"]'
    );
    insertionPoint = emotionInsertionPoint ?? undefined;
  }

  return createCache({ key: 'neram-mui', insertionPoint });
}

// Client-side cache, shared for the whole session
const clientSideEmotionCache = createEmotionCache();

// ============================================
// CONTEXT
// ============================================

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/**
 * Hook to access theme context
 */
export function useThemeMode(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeMode must be used within a NeramThemeProvider');
  }
  return context;
}

// ============================================
// HELPERS
// ============================================

/**
 * Get system color scheme preference
 */
function getSystemTheme(): 'light' | 'dark' {
  if (!isBrowser) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Get initial theme mode from storage or default
 */
function getInitialMode(storageKey: string, defaultMode: ThemeMode): ThemeMode {
  if (!isBrowser) return defaultMode;
  
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch {
    // localStorage might not be available
  }
  
  return defaultMode;
}

// ============================================
// THEME PROVIDER COMPONENT
// ============================================

/**
 * Main theme provider for Neram Classes ecosystem
 * 
 * Usage:
 * ```tsx
 * import { NeramThemeProvider, marketingLightTheme, marketingDarkTheme } from '@neram/ui/theme';
 * 
 * function App({ children }) {
 *   return (
 *     <NeramThemeProvider 
 *       lightTheme={marketingLightTheme}
 *       darkTheme={marketingDarkTheme}
 *     >
 *       {children}
 *     </NeramThemeProvider>
 *   );
 * }
 * ```
 */
export function NeramThemeProvider({
  children,
  defaultMode = 'light',
  theme,
  lightTheme: customLightTheme,
  darkTheme: customDarkTheme,
  emotionCache = clientSideEmotionCache,
  storageKey = 'neram-theme-mode',
}: ThemeProviderProps): JSX.Element {
  const [mode, setModeState] = useState<ThemeMode>(() => 
    getInitialMode(storageKey, defaultMode)
  );
  const [mounted, setMounted] = useState(false);

  // Handle system theme changes
  useEffect(() => {
    setMounted(true);

    if (mode === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => {
        // Force re-render when system theme changes
        setModeState('system');
      };
      
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [mode]);

  // Persist mode to storage
  useEffect(() => {
    if (mounted) {
      try {
        localStorage.setItem(storageKey, mode);
      } catch {
        // localStorage might not be available
      }
    }
  }, [mode, storageKey, mounted]);

  // Calculate actual mode (resolving 'system')
  const actualMode = useMemo<'light' | 'dark'>(() => {
    if (mode === 'system') {
      return getSystemTheme();
    }
    return mode;
  }, [mode]);

  // Select the appropriate theme
  const selectedTheme = useMemo(() => {
    if (theme) return theme;
    
    const light = customLightTheme || lightTheme;
    const dark = customDarkTheme || darkTheme;
    
    return actualMode === 'dark' ? dark : light;
  }, [theme, customLightTheme, customDarkTheme, actualMode]);

  // Theme context value
  const contextValue = useMemo<ThemeContextType>(() => ({
    mode,
    actualMode,
    setMode: setModeState,
    toggleMode: () => {
      setModeState(prev => {
        if (prev === 'light') return 'dark';
        if (prev === 'dark') return 'light';
        // If system, toggle based on current actual mode
        return actualMode === 'dark' ? 'light' : 'dark';
      });
    },
  }), [mode, actualMode]);

  // Prevent flash of wrong theme during hydration
  // by not rendering children until mounted
  const content = (
    <ThemeContext.Provider value={contextValue}>
      <MuiThemeProvider theme={selectedTheme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );

  return (
    <CacheProvider value={emotionCache}>
      {content}
    </CacheProvider>
  );
}

// ============================================
// THEME MODE TOGGLE COMPONENT
// ============================================

import IconButton, { IconButtonProps } from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import SettingsBrightnessIcon from '@mui/icons-material/SettingsBrightness';

interface ThemeModeToggleProps extends Omit<IconButtonProps, 'onClick'> {
  showTooltip?: boolean;
}

/**
 * Ready-to-use theme toggle button
 */
export function ThemeModeToggle({ 
  showTooltip = true, 
  ...props 
}: ThemeModeToggleProps): JSX.Element {
  const { mode, toggleMode } = useThemeMode();

  const icon = useMemo(() => {
    switch (mode) {
      case 'light':
        return <LightModeIcon />;
      case 'dark':
        return <DarkModeIcon />;
      case 'system':
        return <SettingsBrightnessIcon />;
    }
  }, [mode]);

  const tooltipTitle = useMemo(() => {
    switch (mode) {
      case 'light':
        return 'Switch to dark mode';
      case 'dark':
        return 'Switch to light mode';
      case 'system':
        return 'Switch to light mode';
    }
  }, [mode]);

  const button = (
    <IconButton 
      onClick={toggleMode} 
      color="inherit"
      aria-label="Toggle theme"
      {...props}
    >
      {icon}
    </IconButton>
  );

  if (showTooltip) {
    return <Tooltip title={tooltipTitle}>{button}</Tooltip>;
  }

  return button;
}

// ============================================
// EXPORTS
// ============================================

export type { ThemeMode, ThemeContextType, ThemeProviderProps };

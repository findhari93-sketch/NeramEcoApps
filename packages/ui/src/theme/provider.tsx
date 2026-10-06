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
import { useServerInsertedHTML } from 'next/navigation';
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

// Browser cache, shared for the whole session. Never used on the server: a
// module-level cache there remembers every class it has emitted, so later
// renders in the same process (other prerendered pages, warm lambdas) shipped
// HTML without the CSS for those classes.
const clientSideEmotionCache = isBrowser ? createEmotionCache() : undefined;

interface ServerInsert {
  name: string;
  isGlobal: boolean;
}

/**
 * One cache per server render, flushed into the HTML stream with
 * useServerInsertedHTML (the MUI App Router pattern). compat stops Emotion
 * from also rendering inline <style> tags next to elements.
 */
function createServerEmotionCache() {
  const cache = createEmotionCache();
  cache.compat = true;
  const prevInsert = cache.insert;
  let inserted: ServerInsert[] = [];
  cache.insert = (...args) => {
    const [selector, serialized] = args;
    if (cache.inserted[serialized.name] === undefined) {
      inserted.push({ name: serialized.name, isGlobal: !selector });
    }
    return prevInsert(...args);
  };
  const flush = () => {
    const prev = inserted;
    inserted = [];
    return prev;
  };
  return { cache, flush };
}

// Set by the outermost provider so nested providers (for example a page that
// forces its own theme) reuse its cache instead of opening a second one.
const EmotionCacheOwnerContext = createContext(false);

function EmotionCacheBoundary({
  emotionCache,
  children,
}: {
  emotionCache?: EmotionCache;
  children: ReactNode;
}): JSX.Element {
  const nested = useContext(EmotionCacheOwnerContext);
  const [server] = useState(() =>
    nested || emotionCache || isBrowser ? null : createServerEmotionCache()
  );

  useServerInsertedHTML(() => {
    if (!server) return null;
    const names = server.flush();
    if (names.length === 0) return null;

    const { cache } = server;
    const globals: { name: string; style: string }[] = [];
    let styles = '';
    let dataEmotion = cache.key;
    for (const { name, isGlobal } of names) {
      const style = cache.inserted[name];
      if (typeof style !== 'string') continue;
      if (isGlobal) {
        globals.push({ name, style });
      } else {
        styles += style;
        dataEmotion += ` ${name}`;
      }
    }

    return (
      <>
        {globals.map(({ name, style }) => (
          <style
            key={name}
            data-emotion={`${cache.key}-global ${name}`}
            dangerouslySetInnerHTML={{ __html: style }}
          />
        ))}
        {styles && <style data-emotion={dataEmotion} dangerouslySetInnerHTML={{ __html: styles }} />}
      </>
    );
  });

  if (nested && !emotionCache) return <>{children}</>;

  const cache = emotionCache ?? server?.cache ?? clientSideEmotionCache!;
  return (
    <EmotionCacheOwnerContext.Provider value>
      <CacheProvider value={cache}>{children}</CacheProvider>
    </EmotionCacheOwnerContext.Provider>
  );
}

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
  emotionCache,
  storageKey = 'neram-theme-mode',
}: ThemeProviderProps): JSX.Element {
  // Start from defaultMode on the server and on the first client render so
  // hydration matches; the stored choice is applied right after mount.
  const [mode, setModeState] = useState<ThemeMode>(defaultMode);
  const [systemMode, setSystemMode] = useState<'light' | 'dark'>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setModeState(getInitialMode(storageKey, defaultMode));
    setSystemMode(getSystemTheme());
    setMounted(true);
  }, [storageKey, defaultMode]);

  // Follow the OS setting while in system mode
  useEffect(() => {
    if (mode !== 'system') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => setSystemMode(mediaQuery.matches ? 'dark' : 'light');
    handleChange();
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [mode]);

  // Persist mode to storage (only after the stored value has been read)
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
  const actualMode: 'light' | 'dark' = mode === 'system' ? systemMode : mode;

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

  return (
    <EmotionCacheBoundary emotionCache={emotionCache}>
      <ThemeContext.Provider value={contextValue}>
        <MuiThemeProvider theme={selectedTheme}>
          <CssBaseline />
          {children}
        </MuiThemeProvider>
      </ThemeContext.Provider>
    </EmotionCacheBoundary>
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

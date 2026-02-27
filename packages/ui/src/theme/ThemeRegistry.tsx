'use client';

/**
 * ThemeRegistry - MUI + Emotion SSR for Next.js App Router
 *
 * This component extracts Emotion-generated CSS during server rendering
 * and injects it into the <head>, eliminating the Flash of Unstyled Content (FOUC).
 *
 * Note: CssBaseline is NOT included here to avoid hydration mismatches.
 * Baseline styles should be applied via globals.css instead.
 *
 * Usage:
 * ```tsx
 * <ThemeRegistry options={{ key: 'neram-mui' }} lightTheme={...} darkTheme={...}>
 *   {children}
 * </ThemeRegistry>
 * ```
 */

import React, { useState } from 'react';
import { useServerInsertedHTML } from 'next/navigation';
import createCache, { Options as EmotionCacheOptions } from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import { ThemeProvider as MuiThemeProvider, Theme } from '@mui/material';
import { lightTheme as defaultLightTheme, darkTheme as defaultDarkTheme } from './theme';

type ThemeMode = 'light' | 'dark';

interface ThemeRegistryProps {
  children: React.ReactNode;
  options: EmotionCacheOptions;
  lightTheme?: Theme;
  darkTheme?: Theme;
  defaultMode?: ThemeMode;
}

export function ThemeRegistry({
  children,
  options,
  lightTheme: customLightTheme,
  darkTheme: customDarkTheme,
  defaultMode = 'light',
}: ThemeRegistryProps) {
  const [{ cache, flush }] = useState(() => {
    const cache = createCache(options);

    const prevInsert = cache.insert;
    let inserted: string[] = [];

    cache.insert = (...args) => {
      const serialized = args[1];
      if (cache.inserted[serialized.name] === undefined) {
        inserted.push(serialized.name);
      }
      return prevInsert(...args);
    };

    const flush = () => {
      const prevInserted = inserted;
      inserted = [];
      return prevInserted;
    };

    return { cache, flush };
  });

  useServerInsertedHTML(() => {
    const names = flush();
    if (names.length === 0) {
      return null;
    }

    let styles = '';
    for (const name of names) {
      if (cache.inserted[name] !== undefined && typeof cache.inserted[name] === 'string') {
        styles += cache.inserted[name];
      }
    }

    if (!styles) {
      return null;
    }

    return (
      <style
        key={cache.key}
        data-emotion={`${cache.key} ${names.join(' ')}`}
        dangerouslySetInnerHTML={{ __html: styles }}
      />
    );
  });

  const selectedTheme = defaultMode === 'dark'
    ? (customDarkTheme || defaultDarkTheme)
    : (customLightTheme || defaultLightTheme);

  return (
    <CacheProvider value={cache}>
      <MuiThemeProvider theme={selectedTheme}>
        {children}
      </MuiThemeProvider>
    </CacheProvider>
  );
}

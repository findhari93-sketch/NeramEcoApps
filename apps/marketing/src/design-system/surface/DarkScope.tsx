'use client';

import type { ReactNode } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { siteDarkTheme } from '@neram/ui';

/**
 * Scopes the dark theme to one band (hero, CTA band) so MUI components inside
 * it (Typography colours, outlined inputs, chips) read the dark palette. The
 * rest of the page stays on the light site theme.
 */
export default function DarkScope({ children }: { children: ReactNode }) {
  return <ThemeProvider theme={siteDarkTheme}>{children}</ThemeProvider>;
}

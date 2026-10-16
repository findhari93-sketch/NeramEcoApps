'use client';

/**
 * Neram Classes - aiArchitek Era 2026 Theme Variants
 *
 * Both themes now come from the marketing design system (site-2026.ts), so
 * there is one token set and one type scale. The old serif / DM Sans / Space
 * Mono stacks are gone (marketing never loaded those fonts).
 *
 * - neramaiArchitekDarkTheme: alias of siteDarkTheme. Prefer the marketing
 *   app's <Surface tone="dark"> over wrapping a whole page in it.
 * - neramaiArchitekLightTheme: siteLightTheme with a gold500 primary, used by
 *   the Apply ApplicationShell (which overrides text/outlined buttons to ink).
 */

import { createTheme } from '@mui/material/styles';
import { siteDarkTheme, siteLightTheme } from './site-2026';
import { siteTokens as t } from './site-tokens';

export const neramaiArchitekDarkTheme = siteDarkTheme;

export const neramaiArchitekLightTheme = createTheme(siteLightTheme, {
  palette: {
    primary: { main: t.gold500, light: t.gold300, dark: '#c47d10', contrastText: t.navy900 },
  },
});

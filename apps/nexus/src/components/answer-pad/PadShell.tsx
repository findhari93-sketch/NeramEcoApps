'use client';

/**
 * The Answer Pad's frame: the Nexus theme in whatever mode Teams is in (light,
 * dark or high contrast), one narrow column, and nothing else.
 *
 * Teams' theme is applied with a nested provider rather than useThemeMode,
 * which would also change and save the theme for the rest of Nexus.
 */

import type { ReactNode } from 'react';
import { Box, NeramThemeProvider, nexusDarkTheme, nexusLightTheme } from '@neram/ui';
import type { PadTheme } from '@/lib/pad/client/pad-host';

/** Teams' high contrast theme marks focus in yellow; the pad does the same. */
const CONTRAST_FOCUS = '#ffff00';

export default function PadShell({
  theme,
  dense = false,
  wide = false,
  children,
}: {
  theme: PadTheme;
  /** Less padding, for the question pop-up. */
  dense?: boolean;
  /** The full width of the frame, for the meeting screen. */
  wide?: boolean;
  children: ReactNode;
}) {
  const contrast = theme === 'contrast';

  return (
    <NeramThemeProvider theme={theme === 'light' ? nexusLightTheme : nexusDarkTheme} storageKey="pad-theme-mode">
      <Box
        component="main"
        data-pad-theme={theme}
        sx={{
          minHeight: '100vh',
          '@supports (min-height: 100dvh)': { minHeight: '100dvh' },
          bgcolor: contrast ? 'common.black' : 'background.default',
          color: contrast ? 'common.white' : 'text.primary',
          px: 2,
          py: dense ? 1.5 : 2,
          '@media (prefers-reduced-motion: reduce)': {
            '& *, & *::before, & *::after': {
              animationDuration: '0.01ms !important',
              transitionDuration: '0.01ms !important',
            },
          },
          ...(contrast && {
            '& .MuiButton-outlined, & .MuiToggleButton-root, & .MuiChip-outlined, & .MuiPaper-outlined, & .MuiOutlinedInput-notchedOutline': {
              borderColor: 'common.white',
            },
            '& :focus-visible': { outline: `3px solid ${CONTRAST_FOCUS}`, outlineOffset: '2px' },
          }),
        }}
      >
        <Box sx={{ width: '100%', maxWidth: wide ? 'none' : 560, mx: 'auto' }}>{children}</Box>
      </Box>
    </NeramThemeProvider>
  );
}

'use client';

/**
 * The Answer Pad's frame: the Nexus theme in whatever mode Teams is in (light,
 * dark or high contrast), one narrow column, and nothing else.
 *
 * Teams' theme is applied with a nested provider rather than useThemeMode,
 * which would also change and save the theme for the rest of Nexus.
 */

import { useEffect, type ReactNode } from 'react';
import { Box, NeramThemeProvider, nexusDarkTheme, nexusLightTheme } from '@neram/ui';
import type { PadTheme } from '@/lib/pad/client/pad-host';
import { useTextScale } from '@/lib/pad/client/text-scale';

/** Teams' high contrast theme marks focus in yellow; the pad does the same. */
const CONTRAST_FOCUS = '#ffff00';

export default function PadShell({
  theme,
  dense = false,
  wide = false,
  roomy = false,
  children,
}: {
  theme: PadTheme;
  /** Less padding, for the question pop-up. */
  dense?: boolean;
  /** The full width of the frame, for the meeting screen. */
  wide?: boolean;
  /** Up to a laptop's width, for the teacher's console in its own window: two columns from 900px. */
  roomy?: boolean;
  children: ReactNode;
}) {
  const contrast = theme === 'contrast';
  const scale = useTextScale();

  // The pad owns its frame, so its root font size is the pad's text size.
  // The meeting screen keeps its own fluid sizes for the people watching.
  useEffect(() => {
    if (wide) return;
    const root = document.documentElement;
    const before = root.style.fontSize;
    root.style.fontSize = scale === 1 ? '' : `${scale * 100}%`;
    return () => {
      root.style.fontSize = before;
    };
  }, [scale, wide]);

  return (
    <NeramThemeProvider theme={theme === 'light' ? nexusLightTheme : nexusDarkTheme} storageKey="pad-theme-mode">
      <Box
        component="main"
        data-pad-theme={theme}
        sx={{
          minHeight: '100vh',
          '@supports (min-height: 100dvh)': { minHeight: '100dvh' },
          bgcolor: contrast ? 'common.black' : 'background.default',
          // The pad's own background, for the parts that stay in place while the rest scrolls.
          '--pad-bg': (t: { palette: { common: { black: string }; background: { default: string } } }) =>
            contrast ? t.palette.common.black : t.palette.background.default,
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
        <Box sx={{ width: '100%', maxWidth: wide ? 'none' : roomy ? { xs: 560, md: 1040 } : 560, mx: 'auto' }}>{children}</Box>
      </Box>
    </NeramThemeProvider>
  );
}

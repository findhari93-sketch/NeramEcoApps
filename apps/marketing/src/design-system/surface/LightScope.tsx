'use client';

import type { ReactNode } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { Box, siteLightTheme, type SxProps, type Theme } from '@neram/ui';
import { surfaceVars, tokens as t } from '../tokens';

export interface LightScopeProps {
  children: ReactNode;
  /**
   * card: a white hero-aside card (8px radius, 24px padding, the hero card
   * shadow), e.g. the demo booking card or the tool quick check.
   */
  variant?: 'plain' | 'card';
  id?: string;
  sx?: SxProps<Theme>;
}

/**
 * The opposite of a dark Surface: puts a light island (white card) inside a
 * dark band, with the light MUI theme and the light surface variables, so MUI
 * inputs and design-system components inside it render for a white ground.
 */
export default function LightScope({ children, variant = 'plain', id, sx }: LightScopeProps) {
  return (
    <ThemeProvider theme={siteLightTheme}>
      <Box
        id={id}
        sx={[
          {
            ...surfaceVars.light,
            color: t.ink,
            ...(variant === 'card' && {
              bgcolor: t.surface,
              borderRadius: `${t.radius}px`,
              p: { xs: 2.5, sm: 3 },
              boxShadow: t.shadowHeroCard,
              minWidth: 0,
            }),
          },
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
      >
        {children}
      </Box>
    </ThemeProvider>
  );
}

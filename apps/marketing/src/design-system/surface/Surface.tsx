import type { ElementType, ReactNode } from 'react';
import { Box, type SxProps, type Theme } from '@neram/ui';
import { tokens as t, surfaceVars } from '../tokens';
import DarkScope from './DarkScope';

export type SurfaceTone = 'dark' | 'light' | 'white';

export interface SurfaceProps {
  /** dark = navy900, light = ground (#FAFBFC), white = surface (#fff). */
  tone?: SurfaceTone;
  /** Blueprint grid (dark hero only). */
  blueprint?: boolean;
  /** 1px top rule between stacked bands (gold-tinted on dark). */
  rule?: boolean;
  component?: ElementType;
  id?: string;
  'aria-labelledby'?: string;
  sx?: SxProps<Theme>;
  children: ReactNode;
}

const background: Record<SurfaceTone, string> = {
  dark: t.navy900,
  light: t.ground,
  white: t.surface,
};

/**
 * A full-width band. Every page is a stack of these: a dark PageHero (or a
 * light DocHeader), light body bands alternating ground / white with 1px top
 * rules, then a dark CtaBand. A dark Surface also scopes the dark MUI theme.
 */
export default function Surface({
  tone = 'light',
  blueprint = false,
  rule = false,
  component = 'section',
  id,
  sx,
  children,
  ...rest
}: SurfaceProps) {
  const dark = tone === 'dark';
  return (
    <Box
      component={component}
      id={id}
      aria-labelledby={rest['aria-labelledby']}
      data-surface={tone}
      sx={[
        {
          position: 'relative',
          bgcolor: background[tone],
          color: dark ? t.paper : t.ink,
          ...(dark ? surfaceVars.dark : surfaceVars.light),
          ...(rule && { borderTop: `1px solid ${dark ? t.goldRule : t.line}` }),
          ...(blueprint && dark && t.blueprint),
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {dark ? <DarkScope>{children}</DarkScope> : children}
    </Box>
  );
}

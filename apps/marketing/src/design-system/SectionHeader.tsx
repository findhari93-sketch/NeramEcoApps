import type { ReactNode } from 'react';
import { Box, Typography } from '@neram/ui';
import { eyebrowSx, v } from './tokens';

export interface SectionHeaderProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  /** center on marketing pages, start on content and flow pages. */
  align?: 'center' | 'start';
  /** Heading level. h2 for sections; h1 only when the section is the page title. */
  as?: 'h1' | 'h2' | 'h3';
  /** id for the heading, so a Surface can point aria-labelledby at it. */
  id?: string;
  /** Max width of the lede in px (default 560). */
  ledeWidth?: number;
  /** section: the 2.5rem section h2. article: the smaller in-article h2 (2rem), tighter gap. */
  size?: 'section' | 'article';
}

/**
 * The homepage section pattern, now shared: mono eyebrow, h2, then a lede
 * capped at ~560px. Eyebrow is gold800 on light and gold500 on dark (from the
 * Surface's CSS variables).
 */
export default function SectionHeader({
  eyebrow,
  title,
  lede,
  align = 'center',
  as = 'h2',
  id,
  ledeWidth = 560,
  size = 'section',
}: SectionHeaderProps) {
  const centered = align === 'center';
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: centered ? 'center' : 'flex-start',
        textAlign: centered ? 'center' : 'left',
        gap: size === 'article' ? 1 : 1.5,
      }}
    >
      {eyebrow && (
        <Typography component="p" sx={eyebrowSx}>
          {eyebrow}
        </Typography>
      )}
      <Typography
        id={id}
        variant={as === 'h1' ? 'h1' : 'h2'}
        component={as}
        sx={{
          m: 0,
          color: v.fg,
          ...(size === 'article' && { fontSize: 'clamp(1.5rem, 3vw, 2rem)', lineHeight: 1.2 }),
        }}
      >
        {title}
      </Typography>
      {lede && (
        <Typography variant="lede" sx={{ m: 0, maxWidth: ledeWidth, color: v.muted, textWrap: 'pretty' }}>
          {lede}
        </Typography>
      )}
    </Box>
  );
}

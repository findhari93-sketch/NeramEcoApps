import type { ReactNode } from 'react';
import { Box, Typography } from '@neram/ui';
import { eyebrowSx, tokens as t } from './tokens';

export interface ArticleSectionProps {
  /** Becomes the h2 id; the section is labelled by it. */
  id: string;
  title: ReactNode;
  eyebrow?: ReactNode;
  /** A first paragraph under the heading (17px, 1.7). */
  intro?: ReactNode;
  /** Heading level (default h2; h3 for a sub-part). */
  as?: 'h2' | 'h3';
  children?: ReactNode;
}

/**
 * One block of a long-form article (T2, T5, legal): article-size heading,
 * optional intro paragraph, then the content, 16px apart. Article columns
 * stack these with a 40 to 56px gap.
 */
export default function ArticleSection({ id, title, eyebrow, intro, as = 'h2', children }: ArticleSectionProps) {
  return (
    <Box component="section" aria-labelledby={id} sx={{ display: 'flex', flexDirection: 'column', gap: 2, scrollMarginTop: 96 }}>
      {eyebrow && (
        <Typography component="p" sx={eyebrowSx}>
          {eyebrow}
        </Typography>
      )}
      <Typography
        id={id}
        component={as}
        sx={{
          m: 0,
          fontWeight: 800,
          color: t.ink,
          ...(as === 'h2'
            ? { fontSize: 'clamp(1.5rem, 3vw, 2rem)', lineHeight: 1.2 }
            : { fontSize: '1.25rem', lineHeight: 1.3, fontWeight: 700 }),
        }}
      >
        {title}
      </Typography>
      {intro && (
        <Typography component="p" sx={{ m: 0, fontSize: '1.0625rem', lineHeight: 1.7, color: t.ink }}>
          {intro}
        </Typography>
      )}
      {children}
    </Box>
  );
}

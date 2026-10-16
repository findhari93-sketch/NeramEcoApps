import type { ReactNode } from 'react';
import { Box } from '@neram/ui';
import { tokens as t } from '../tokens';

export interface DocLayoutProps {
  /** The article column, capped at 780px (sections stacked with a 40px gap). */
  children: ReactNode;
  /** The side rail. Sticky on wide screens, in flow on phones. */
  aside?: ReactNode;
  /**
   * start: a guide nav on the left (T2, 240px). end: related links and tools
   * on the right (T5, 280 to 340px). On phones the start rail comes first,
   * the end rail after the article.
   */
  asideAt?: 'start' | 'end';
  /** Article measure: article (780, default) or legal (700). */
  articleWidth?: 'article' | 'legal';
}

/**
 * Body of the light long-form templates (T2 exam guide, T5 counselling, T9
 * legal): one article column of at most 780px beside an optional rail, in a
 * wrapping flex row inside the 1200px container.
 */
export default function DocLayout({ children, aside, asideAt = 'end', articleWidth = 'article' }: DocLayoutProps) {
  const start = asideAt === 'start';
  const rail = aside ? (
    <Box
      component="aside"
      sx={{
        // Full width when the row wraps on phones; fixed rail widths from md.
        flex: { xs: '1 1 100%', md: start ? '0 1 240px' : '1 1 280px' },
        maxWidth: start ? { md: 260 } : { md: 340 },
        minWidth: 0,
        position: { md: 'sticky' },
        top: { md: 88 },
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        // On phones a start rail sits above the article, an end rail below it.
        order: start ? 0 : 2,
      }}
    >
      {aside}
    </Box>
  ) : null;

  return (
    <Box
      sx={{
        maxWidth: t.container.page,
        mx: 'auto',
        px: { xs: 2, sm: 3 },
        pt: { xs: 4, md: 4 },
        pb: { xs: 8, md: 10 },
        display: 'flex',
        flexWrap: 'wrap',
        gap: { xs: 4, md: 5 },
        alignItems: 'flex-start',
        boxSizing: 'content-box',
      }}
    >
      {rail}
      <Box
        component="article"
        sx={{ order: 1, flex: '999 1 620px', minWidth: 0, maxWidth: t.container[articleWidth], display: 'flex', flexDirection: 'column', gap: 5 }}
      >
        {children}
      </Box>
    </Box>
  );
}

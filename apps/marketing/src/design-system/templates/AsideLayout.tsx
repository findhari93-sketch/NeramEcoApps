import type { ReactNode } from 'react';
import { Box } from '@neram/ui';
import { tokens as t } from '../tokens';

export interface AsideLayoutProps {
  /** The main column (sections stacked with a 56px gap). */
  children: ReactNode;
  /** The sticky aside (FeeCard, lead form). In flow on phones. */
  aside: ReactNode;
  /** Put the aside first on phones (e.g. a lead form that should come early). Default: after. */
  asideFirstOnMobile?: boolean;
}

/**
 * T1 / T6 body: main `1 1 560px` and an aside `1 1 300px` capped at 400px,
 * in a wrapping flex row. The aside sticks below the header on wide screens
 * and becomes an ordinary block when the row wraps on phones.
 */
export default function AsideLayout({ children, aside, asideFirstOnMobile = false }: AsideLayoutProps) {
  return (
    <Box
      sx={{
        maxWidth: t.container.page,
        mx: 'auto',
        px: { xs: 2, sm: 3 },
        pt: { xs: 6, md: 8 },
        pb: { xs: 8, md: 10 },
        display: 'flex',
        flexWrap: 'wrap',
        gap: { xs: 5, md: 6 },
        alignItems: 'flex-start',
        boxSizing: 'content-box',
      }}
    >
      <Box sx={{ flex: '1 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>{children}</Box>
      <Box
        sx={{
          flex: '1 1 300px',
          maxWidth: { md: 400 },
          minWidth: 0,
          width: '100%',
          alignSelf: { md: 'stretch' },
          order: asideFirstOnMobile ? { xs: -1, md: 0 } : 0,
        }}
      >
        {aside}
      </Box>
    </Box>
  );
}

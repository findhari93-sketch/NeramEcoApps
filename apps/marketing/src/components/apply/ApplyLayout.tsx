'use client';

import { Box } from '@neram/ui';
import { tokens as t } from '@/design-system';
import NexusShowcase from './showcase/NexusShowcase';
import { SHELL_HEADER_HEIGHT } from './shell/constants';
import { DESK } from './shell/density';

/**
 * The apply page body: the Nexus showcase on a navy blueprint panel and the
 * white form column. Below 900px the showcase wraps above the form in its
 * compact phone form. From 900px the form is the main column and the showcase
 * is a fixed-width column that sticks under the header at exactly the window
 * height, its content sized (NexusShowcase) to fit without scrolling.
 */
export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ flex: 1, display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', [DESK]: { flexWrap: 'nowrap' } }}>
      <Box
        component="aside"
        sx={{
          flex: '1 1 420px',
          maxWidth: '100%',
          minWidth: 0,
          bgcolor: t.navy900,
          ...t.blueprint,
          color: t.paper,
          overflowX: 'hidden',
          // Wide enough (at least 480px inside from 1280px) that the showcase keeps its wide layout on a laptop.
          [DESK]: { flex: '0 0 clamp(400px, 42vw, 600px)' },
        }}
      >
        <Box
          sx={{
            boxSizing: 'border-box',
            px: { xs: 2, sm: 3 },
            pt: { xs: 3 },
            pb: { xs: 3 },
            [DESK]: {
              position: 'sticky',
              top: `${SHELL_HEADER_HEIGHT.md}px`,
              height: `calc(100dvh - ${SHELL_HEADER_HEIGHT.md}px)`,
              display: 'flex',
              flexDirection: 'column',
              // Auto margins centre the showcase but, unlike justify-content, never push its top out of reach.
              '& > *': { my: 'auto' },
              overflowY: 'auto',
              scrollbarWidth: 'none',
              '&::-webkit-scrollbar': { display: 'none' },
              px: 'clamp(20px, 2vw, 32px)',
              py: 'clamp(16px, 3vh, 36px)',
            },
          }}
        >
          <NexusShowcase />
        </Box>
      </Box>
      <Box
        component="section"
        sx={{ flex: '1 1 560px', minWidth: 0, bgcolor: t.surface, display: 'flex', justifyContent: 'center' }}
      >
        {children}
      </Box>
    </Box>
  );
}

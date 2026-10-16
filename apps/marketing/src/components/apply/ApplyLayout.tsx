'use client';

import { Box } from '@neram/ui';
import { tokens as t } from '@/design-system';
import NexusShowcase from './showcase/NexusShowcase';
import { SHELL_HEADER_HEIGHT } from './shell/constants';

/**
 * The apply page body: the Nexus showcase on a navy blueprint panel and the
 * white form column, as a wrapping flex row. From about 1000px they sit side
 * by side and the showcase sticks under the header while the form scrolls;
 * below that the showcase wraps above the form in its compact phone form.
 */
export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ flex: 1, display: 'flex', flexWrap: 'wrap', alignItems: 'stretch' }}>
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
        }}
      >
        <Box
          sx={{
            // Sticky only when the whole panel fits under the header; on a short
            // laptop it scrolls with the page so its controls are never cut off.
            '@media (min-width: 900px) and (min-height: 900px)': {
              position: 'sticky',
              top: `${SHELL_HEADER_HEIGHT.md}px`,
            },
            boxSizing: 'border-box',
            px: { xs: 2, sm: 3, md: 'clamp(24px, 4vw, 56px)' },
            pt: { xs: 3, md: 6 },
            pb: { xs: 3, md: 5 },
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

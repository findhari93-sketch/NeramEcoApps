'use client';

import { Box } from '@neram/ui';
import NexusShowcase from './showcase/NexusShowcase';
import { SHELL_HEADER_HEIGHT } from './shell/constants';
import { NX } from './showcase/palette';

/**
 * The apply page body, laid out like a sign-in page: the Nexus showcase on
 * the left (above the form on phones) and the form on the right. From the
 * `md` breakpoint the showcase sticks under the header while the form
 * scrolls; it may scroll itself on very short screens so nothing is cut off.
 */
export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  const headerOffset = `${SHELL_HEADER_HEIGHT.md}px`;
  return (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: { xs: 'column', md: 'row' },
        alignItems: { md: 'stretch' },
      }}
    >
      <Box
        sx={{
          flex: { md: '0 0 44%' },
          minWidth: 0,
          bgcolor: NX.navy,
          color: NX.white,
          position: { md: 'sticky' },
          top: { md: headerOffset },
          alignSelf: { md: 'flex-start' },
          // Exactly one viewport tall beside the form: fills it when the form is
          // short, sticks while a long step scrolls, scrolls itself only on very
          // short screens.
          minHeight: { md: `calc(100dvh - ${headerOffset})` },
          maxHeight: { md: `calc(100dvh - ${headerOffset})` },
          overflowX: 'hidden',
          overflowY: { md: 'auto' },
        }}
      >
        <NexusShowcase />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0, bgcolor: 'background.paper', display: 'flex', flexDirection: 'column' }}>{children}</Box>
    </Box>
  );
}

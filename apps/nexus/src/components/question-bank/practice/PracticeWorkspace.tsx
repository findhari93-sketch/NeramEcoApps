'use client';

import type { ReactNode } from 'react';
import { Box } from '@neram/ui';
import PaperShell from '../paper/PaperShell';

const noop = () => {};

interface PracticeWorkspaceProps {
  header: ReactNode;
  rail: ReactNode;
  reader: ReactNode;
}

/**
 * The laptop layout: a header, then the rail and the reader side by side, each
 * scrolling on its own inside a shell exactly as tall as the viewport leaves.
 *
 * The page used to flow, with a "sticky" question pane that could not stick,
 * so choosing question 18 meant scrolling down to it and back up to read it.
 * Here the document never scrolls. PaperShell (the teacher paper workspace's
 * frame) measures the height; focus mode is off, since there is no chrome here
 * worth hiding.
 *
 * The rail is clamped rather than breakpointed: 264px when an expanded sidebar
 * leaves a 920px window about 660px, up to 360px on a wide screen. A viewport
 * breakpoint cannot see the sidebar and would squeeze the reader instead.
 */
export default function PracticeWorkspace({ header, rail, reader }: PracticeWorkspaceProps) {
  return (
    <PaperShell focus={false} onFocusChange={noop} focusEnabled={false}>
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          maxWidth: 1600,
          mx: 'auto',
          px: 2,
          pt: 1,
        }}
      >
        {header}
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: 'grid',
            gridTemplateColumns: 'clamp(264px, 30%, 360px) minmax(0, 1fr)',
            gap: 2,
            pb: 1,
          }}
        >
          <Box
            component="section"
            aria-label="Questions"
            sx={{
              minHeight: 0,
              minWidth: 0,
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2,
              overflow: 'hidden',
              bgcolor: 'background.paper',
            }}
          >
            {rail}
          </Box>
          <Box
            component="section"
            aria-label="Question"
            sx={{
              minHeight: 0,
              minWidth: 0,
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2,
              overflow: 'hidden',
              bgcolor: 'background.paper',
            }}
          >
            {reader}
          </Box>
        </Box>
      </Box>
    </PaperShell>
  );
}

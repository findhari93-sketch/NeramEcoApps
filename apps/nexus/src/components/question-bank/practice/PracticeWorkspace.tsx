'use client';

import type { ReactNode } from 'react';
import { Box } from '@neram/ui';
import PaperShell from '../paper/PaperShell';

const noop = () => {};

interface PracticeWorkspaceProps {
  header: ReactNode;
  rail: ReactNode;
  reader: ReactNode;
  /** The AI Tutor, docked as a third column while it is open. */
  tutor?: ReactNode;
}

/**
 * Wide enough, measured on the workspace itself, for rail, reader and tutor
 * side by side. Below it the rail steps aside while the tutor is open. A
 * container query rather than a viewport breakpoint, for the same reason the
 * rail is clamped: the sidebar can take 260px of a 1280px window.
 */
const THREE_COLUMNS = '@container practice (min-width: 1100px)';

const paneSx = {
  minHeight: 0,
  minWidth: 0,
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 2,
  overflow: 'hidden',
  bgcolor: 'background.paper',
} as const;

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
export default function PracticeWorkspace({ header, rail, reader, tutor }: PracticeWorkspaceProps) {
  const docked = !!tutor;
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
          // Only while docked: a size container is a containing block for
          // fixed descendants (the answer tick), so it stays off otherwise.
          ...(docked ? { containerType: 'inline-size', containerName: 'practice' } : {}),
        }}
      >
        {header}
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: 'grid',
            gridTemplateColumns: docked ? 'minmax(0, 1fr) 400px' : 'clamp(264px, 30%, 360px) minmax(0, 1fr)',
            gap: 2,
            pb: 1,
            ...(docked
              ? { [THREE_COLUMNS]: { gridTemplateColumns: 'clamp(240px, 24%, 320px) minmax(0, 1fr) clamp(340px, 30%, 400px)' } }
              : {}),
          }}
        >
          <Box
            component="section"
            aria-label="Questions"
            sx={{ ...paneSx, ...(docked ? { display: 'none', [THREE_COLUMNS]: { display: 'block' } } : {}) }}
          >
            {rail}
          </Box>
          <Box component="section" aria-label="Question" sx={paneSx}>
            {reader}
          </Box>
          {docked && (
            // tabIndex -1: the Assistant's hand-off moves focus here (the docked tutor has no trap of its own).
            <Box component="section" aria-label="Tutor" data-tutor-dock tabIndex={-1} sx={{ ...paneSx, '&:focus': { outline: 'none' } }}>
              {tutor}
            </Box>
          )}
        </Box>
      </Box>
    </PaperShell>
  );
}

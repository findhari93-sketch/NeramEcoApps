'use client';

/**
 * The layout of the drawing review screen, and the only place in this feature
 * that decides anything based on width.
 *
 * Below 900px the drawing sits on top in a fixed 50vh stage and the feedback
 * column flows beneath it in the page scroll, with the action bar pinned above
 * the bottom nav. From 900px up the two become columns of a full-height row: the
 * stage takes the space that is left and the feedback column is a fixed 400px
 * that scrolls on its own.
 *
 * The page used to express that as two complete `return`s. Every panel in the
 * middle therefore existed twice, and switching viewport mid-session threw away
 * the state of everything in it. Both are now one tree and a set of breakpoints.
 */

import type { ReactNode } from 'react';
import { Box } from '@neram/ui';

/** Combined height of the fixed action bar and the bottom nav beneath it. */
const PHONE_BAR_RESERVE = 120;

/** Thin, only-on-hover scrollbar for the feedback column. */
const quietScrollbarSx = {
  scrollbarWidth: 'thin',
  scrollbarColor: 'transparent transparent',
  '&:hover': { scrollbarColor: 'rgba(0,0,0,0.15) transparent' },
  '&::-webkit-scrollbar': { width: 4 },
  '&::-webkit-scrollbar-track': { background: 'transparent' },
  '&::-webkit-scrollbar-thumb': { background: 'transparent', borderRadius: 2 },
  '&:hover::-webkit-scrollbar-thumb': {
    background: 'rgba(0,0,0,0.15)',
    '&:hover': { background: 'rgba(0,0,0,0.25)' },
  },
} as const;

export interface ReviewShellProps {
  header: ReactNode;
  /** Breadcrumb trail back to the assignment, or to the shared queue. */
  contextBar: ReactNode;
  /** The reference images the teacher set on the brief, when there are any. */
  referenceStrip: ReactNode;
  /** The drawing itself, with its tabs and markup layer. */
  stage: ReactNode;
  /** The "Feedback" title row with its Edit escape hatch. */
  panelHeader: ReactNode;
  panelBody: ReactNode;
  actionBar: ReactNode;
}

export default function ReviewShell({
  header, contextBar, referenceStrip, stage, panelHeader, panelBody, actionBar,
}: ReviewShellProps) {
  return (
    <Box
      sx={{
        // Negate the page padding so the review goes edge to edge, and break out
        // of the Container's max width on wide screens.
        mx: { xs: -2, sm: -3, md: -4 },
        mt: { xs: -2, md: -3 },
        mb: { xs: -10, md: -3 },
        width: { md: 'calc(100% + 64px)' },
        maxWidth: { md: 'none' },
        display: 'flex',
        flexDirection: { xs: 'column', md: 'row' },
        height: { md: 'calc(100vh - 64px)' },
        overflow: { md: 'hidden' },
      }}
    >
      <Box
        sx={{
          flex: { md: 1 },
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: { md: 'hidden' },
        }}
      >
        {header}
        {contextBar}
        {referenceStrip}
        <Box
          sx={{
            height: { xs: '50vh', md: 'auto' },
            flex: { md: 1 },
            minHeight: { md: 0 },
            display: { md: 'flex' },
            flexDirection: { md: 'column' },
            p: { xs: 0.5, md: 1.5 },
            bgcolor: { xs: '#1a1a1a', md: '#e8e8e8' },
          }}
        >
          {stage}
        </Box>
      </Box>

      <Box
        sx={{
          width: { xs: '100%', md: 400 },
          flexShrink: { md: 0 },
          minWidth: 0,
          borderLeft: { md: '1px solid' },
          borderColor: 'divider',
          bgcolor: 'background.paper',
          display: 'flex',
          flexDirection: 'column',
          overflow: { md: 'hidden' },
        }}
      >
        {panelHeader}
        <Box
          sx={{
            flex: { md: 1 },
            minHeight: { md: 0 },
            overflowY: { md: 'auto' },
            WebkitOverflowScrolling: 'touch',
            p: { xs: 1.5, md: 2 },
            ...quietScrollbarSx,
          }}
        >
          {panelBody}
        </Box>
        {/* The phone bar is fixed, so reserve the height it takes out of the flow. */}
        <Box aria-hidden sx={{ height: PHONE_BAR_RESERVE, flexShrink: 0, display: { md: 'none' } }} />
        {actionBar}
      </Box>
    </Box>
  );
}

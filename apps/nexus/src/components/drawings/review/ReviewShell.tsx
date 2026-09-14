'use client';

/**
 * The layout of the drawing review screen, and the only place in this feature
 * that decides anything based on width.
 *
 * Below 900px the drawing sits on top in a fixed 50vh stage and the feedback
 * column flows beneath it in the page scroll, with the action bar pinned above
 * the bottom nav. From 900px up the two become columns of a row that exactly
 * fills the screen under the top bar: the stage takes the space that is left and
 * the feedback column scrolls on its own, so the header, the drawing and the
 * action bar never move.
 *
 * The page used to express that as two complete `return`s. Every panel in the
 * middle therefore existed twice, and switching viewport mid-session threw away
 * the state of everything in it. Both are now one tree and a set of breakpoints.
 *
 * The route is full bleed (lib/full-bleed-routes), so there is no page padding
 * to cancel. The height is measured, not a guessed bar height: a guess of 64px
 * against a 56px bar was one of the two reasons the whole document scrolled.
 */

import { useRef, type ReactNode } from 'react';
import { Box, useMediaQuery, useTheme } from '@neram/ui';
import { useViewportShellHeight } from '@/hooks/useViewportShellHeight';

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
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const rootRef = useRef<HTMLDivElement>(null);
  const heightSx = useViewportShellHeight(rootRef, isDesktop);

  return (
    <Box
      ref={rootRef}
      sx={{
        // Full bleed keeps 64px of bottom padding on phones for the bottom nav;
        // the reserve spacer below already accounts for it.
        mb: { xs: -8, md: 0 },
        display: 'flex',
        flexDirection: { xs: 'column', md: 'row' },
        ...(isDesktop ? heightSx : {}),
        overflow: { md: 'hidden' },
      }}
    >
      <Box
        sx={{
          flex: { md: 1 },
          minWidth: 0,
          minHeight: { md: 0 },
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
            position: 'relative',
            p: { xs: 0.5, md: 1.5 },
            bgcolor: { xs: '#1a1a1a', md: '#e8e8e8' },
          }}
        >
          {stage}
        </Box>
      </Box>

      <Box
        sx={{
          width: { xs: '100%', md: 'clamp(360px, 28vw, 460px)' },
          flexShrink: { md: 0 },
          minWidth: 0,
          minHeight: { md: 0 },
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
            // Anything absolutely positioned inside the rail (screen-reader
            // announcers among them) must be clipped by the rail, not by the
            // page. Without this they stretched the document and it scrolled.
            position: 'relative',
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

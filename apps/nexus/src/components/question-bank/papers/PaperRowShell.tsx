'use client';

import type { ReactNode } from 'react';
import { Paper } from '@neram/ui';
import type { SxProps, Theme } from '@neram/ui';

export interface PaperRowShellProps {
  onOpen: () => void;
  /** Announced to screen readers as "Open JEE Paper 2 2024". */
  label: string;
  /** Mid-delete. Fades the row rather than removing it before the server agrees. */
  dimmed?: boolean;
  sx?: SxProps<Theme>;
  children: ReactNode;
}

/**
 * The clickable container the card, the tile and the compact row all share.
 *
 * A div with an onClick is not a button: it cannot be tabbed to and Enter does
 * nothing, which on this page means the only way to open a paper is a mouse.
 * Putting the behaviour here rather than in each of the three views is what
 * stops two of them quietly losing it.
 */
export default function PaperRowShell({
  onOpen,
  label,
  dimmed = false,
  sx,
  children,
}: PaperRowShellProps) {
  return (
    <Paper
      variant="outlined"
      role="button"
      tabIndex={0}
      aria-label={`Open ${label}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        // Space scrolls the page by default, which is exactly wrong on a
        // control that is meant to activate.
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      sx={{
        cursor: 'pointer',
        opacity: dimmed ? 0.5 : 1,
        transition: 'background-color 150ms ease, border-color 150ms ease',
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        '&:hover': { bgcolor: 'action.hover', borderColor: 'primary.light' },
        '&:focus-visible': {
          outline: '2px solid',
          outlineColor: 'primary.main',
          outlineOffset: 2,
        },
        ...sx,
      }}
    >
      {children}
    </Paper>
  );
}

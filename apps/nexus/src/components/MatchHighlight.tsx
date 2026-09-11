'use client';

/**
 * Marks the letters a search matched inside a result, the way LinkedIn and
 * Google bold them, so a teacher can see at a glance why each name is listed
 * and why it sits where it does.
 *
 * Ranges come from nameMatchRanges (lib/people-search.ts). A tint and a heavier
 * weight rather than a yellow highlighter: the text keeps its own colour, so
 * contrast never drops below the rest of the name.
 */

import { Fragment, type ReactNode } from 'react';
import { Box, alpha } from '@neram/ui';

export interface MatchHighlightProps {
  text: string;
  /** [start, end) spans of `text` to mark. */
  ranges: ReadonlyArray<readonly [number, number]>;
}

/** Clamp to the text, drop empty spans, sort, and merge any that overlap. */
function tidy(ranges: MatchHighlightProps['ranges'], length: number): Array<[number, number]> {
  const clamped = ranges
    .map(([start, end]): [number, number] => [Math.max(0, start), Math.min(length, end)])
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);

  const merged: Array<[number, number]> = [];
  for (const [start, end] of clamped) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

export default function MatchHighlight({ text, ranges }: MatchHighlightProps) {
  const spans = tidy(ranges, text.length);
  if (spans.length === 0) return <>{text}</>;

  const parts: ReactNode[] = [];
  let cursor = 0;
  spans.forEach(([start, end], i) => {
    if (start > cursor) parts.push(<Fragment key={`text-${i}`}>{text.slice(cursor, start)}</Fragment>);
    parts.push(
      <Box
        component="mark"
        key={`mark-${i}`}
        sx={{
          color: 'inherit',
          fontWeight: 800,
          borderRadius: '2px',
          bgcolor: (t) => alpha(t.palette.primary.main, t.palette.mode === 'dark' ? 0.3 : 0.14),
        }}
      >
        {text.slice(start, end)}
      </Box>,
    );
    cursor = end;
  });
  if (cursor < text.length) parts.push(<Fragment key="tail">{text.slice(cursor)}</Fragment>);

  return <>{parts}</>;
}

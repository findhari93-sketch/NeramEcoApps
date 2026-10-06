'use client';

import { Box, Chip } from '@neram/ui';
import type { Suggestion } from './client';

/**
 * Tappable prompts, always one row so they never push the conversation out of
 * view. The row scrolls sideways inside its own box (never the page). On a
 * phone the scrollbar is hidden since a swipe needs none; from md up a thin one
 * shows, so a mouse can reach the chips past the edge.
 * The chips look 36px tall to keep the panel compact; an invisible band above
 * and below keeps the tap area 44px (the row's padding leaves room for it).
 */
export default function SuggestionChips({ items, onPick, disabled }: { items: Suggestion[]; onPick: (send: string) => void; disabled?: boolean }) {
  if (items.length === 0) return null;
  return (
    <Box
      role="list"
      aria-label="Suggestions"
      sx={{
        display: 'flex', gap: 1, px: 2, py: 0.75, flexShrink: 0,
        flexWrap: 'nowrap', overflowX: 'auto', overflowY: 'hidden',
        scrollbarWidth: { xs: 'none', md: 'thin' },
        '&::-webkit-scrollbar': { display: { xs: 'none', md: 'block' }, height: 6 },
        // The last chip fades out at the edge: a cue that the row scrolls.
        maskImage: 'linear-gradient(to right, #000 calc(100% - 24px), transparent)',
      }}
    >
      {items.map((s) => (
        // The list item wraps the chip so the chip keeps its button role.
        <Box key={s.label} role="listitem" sx={{ flexShrink: 0, display: 'flex' }}>
          <Chip
            data-testid="assistant-chip"
            label={s.label}
            onClick={() => onPick(s.send)}
            disabled={disabled}
            variant="outlined"
            sx={{
              height: 36, borderRadius: 18, fontSize: '0.875rem', px: 0.25, cursor: 'pointer', position: 'relative',
              '&::after': { content: '""', position: 'absolute', left: 0, right: 0, top: -4, bottom: -4 },
            }}
          />
        </Box>
      ))}
    </Box>
  );
}

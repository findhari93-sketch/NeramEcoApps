'use client';

import { Box, Chip } from '@neram/ui';
import type { Suggestion } from './client';

/**
 * Tappable prompts. On a phone, one row that scrolls sideways inside its own box
 * (never the page), with the scrollbar hidden since a swipe needs none. From md up
 * the panel is a mouse-driven side drawer, where a hidden scrollbar strands the
 * chips past the edge, so they wrap instead.
 */
export default function SuggestionChips({ items, onPick, disabled }: { items: Suggestion[]; onPick: (send: string) => void; disabled?: boolean }) {
  if (items.length === 0) return null;
  return (
    <Box
      role="list"
      aria-label="Suggestions"
      sx={{
        display: 'flex', gap: 1, px: 2, py: 1,
        flexWrap: { xs: 'nowrap', md: 'wrap' },
        overflowX: { xs: 'auto', md: 'visible' },
        scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' },
      }}
    >
      {items.map((s) => (
        // The list item wraps the chip so the chip keeps its button role.
        <Box key={s.label} role="listitem" sx={{ flexShrink: 0, display: 'flex', maxWidth: '100%' }}>
          <Chip
            data-testid="assistant-chip"
            label={s.label}
            onClick={() => onPick(s.send)}
            disabled={disabled}
            variant="outlined"
            sx={{ height: 48, borderRadius: 24, fontSize: '0.9375rem', px: 0.5, cursor: 'pointer' }}
          />
        </Box>
      ))}
    </Box>
  );
}

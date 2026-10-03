'use client';

import { Box, Chip } from '@neram/ui';
import type { Suggestion } from './client';

/** One row of tappable prompts. Scrolls sideways inside its own box, never the page. */
export default function SuggestionChips({ items, onPick, disabled }: { items: Suggestion[]; onPick: (send: string) => void; disabled?: boolean }) {
  if (items.length === 0) return null;
  return (
    <Box
      role="list"
      aria-label="Suggestions"
      sx={{ display: 'flex', gap: 1, overflowX: 'auto', px: 2, py: 1, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}
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
            sx={{ height: 48, borderRadius: 24, fontSize: '0.9375rem', px: 0.5, cursor: 'pointer' }}
          />
        </Box>
      ))}
    </Box>
  );
}

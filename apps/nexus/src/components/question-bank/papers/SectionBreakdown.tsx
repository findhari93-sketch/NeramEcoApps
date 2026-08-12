'use client';

import { useState } from 'react';
import { Box, Chip } from '@neram/ui';

/** How many section chips a card shows before folding the rest away. */
const SECTION_CHIP_LIMIT = 6;

export interface SectionBreakdownProps {
  breakdown: Record<string, number>;
  getCategoryLabel: (cat: string) => string;
  /** The tile has room for two or three, not six. */
  limit?: number;
}

/**
 * A paper can carry twenty section tags. Printed in full they bury the card's
 * actions below a wall of chips, which on a phone is most of a screen of
 * scrolling per paper. Show the largest few, fold the rest behind a toggle.
 */
export default function SectionBreakdown({
  breakdown,
  getCategoryLabel,
  limit = SECTION_CHIP_LIMIT,
}: SectionBreakdownProps) {
  const [expanded, setExpanded] = useState(false);

  const entries = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
  const shown = expanded ? entries : entries.slice(0, limit);
  const hidden = entries.length - shown.length;

  return (
    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
      {shown.map(([cat, count]) => (
        <Chip
          key={cat}
          label={`${getCategoryLabel(cat)}: ${count}`}
          size="small"
          variant="outlined"
          sx={{ height: 24, fontSize: '0.7rem', maxWidth: '100%' }}
        />
      ))}
      {(hidden > 0 || expanded) && (
        <Chip
          label={expanded ? 'Show less' : `+${hidden} more`}
          size="small"
          // Only this chip swallows the click. The rest of the row stays part
          // of the card, which opens the paper.
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          sx={{
            height: { xs: 32, sm: 24 },
            fontSize: '0.7rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        />
      )}
    </Box>
  );
}

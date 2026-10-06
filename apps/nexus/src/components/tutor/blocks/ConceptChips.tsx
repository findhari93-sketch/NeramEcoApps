'use client';

import { Box, Typography } from '@neram/ui';
import type { MasteryState } from '@/lib/assistant/tutor/types';
import { MASTERY_LEVEL, MASTERY_WORD } from '../labels';

export interface ConceptItem {
  slug: string;
  label: string;
  state: MasteryState;
}

/** Five small bars, filled to the mastery level. Decorative: the word says it. */
function Meter({ state }: { state: MasteryState }) {
  const level = MASTERY_LEVEL[state];
  return (
    <Box component="span" aria-hidden sx={{ display: 'inline-flex', gap: '2px', alignItems: 'flex-end' }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Box
          key={n}
          component="span"
          sx={{
            width: 4,
            height: 4 + n * 2,
            borderRadius: 1,
            bgcolor: n <= level ? 'primary.main' : 'action.disabledBackground',
          }}
        />
      ))}
    </Box>
  );
}

/** The ideas this question uses, each with where the student stands on it, in words. */
export default function ConceptChips({ items, title = 'Ideas in this question' }: { items: ConceptItem[]; title?: string | null }) {
  if (!items.length) return null;
  return (
    <Box>
      {title && (
        <Typography variant="caption" component="p" sx={{ fontWeight: 700, color: 'text.secondary', mb: 0.75 }}>
          {title}
        </Typography>
      )}
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {items.map((c) => (
          <Box
            component="li"
            key={c.slug}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 1,
              maxWidth: '100%',
              minHeight: 32,
              px: 1.25,
              py: 0.5,
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 4,
              bgcolor: 'background.paper',
            }}
          >
            <Meter state={c.state} />
            <Typography variant="body2" component="span" sx={{ fontWeight: 600, minWidth: 0, overflowWrap: 'anywhere' }}>
              {c.label}
            </Typography>
            <Typography variant="caption" component="span" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
              {MASTERY_WORD[c.state] ?? MASTERY_WORD.UNKNOWN}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

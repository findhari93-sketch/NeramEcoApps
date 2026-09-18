'use client';

import Link from 'next/link';
import { Box, Typography } from '@neram/ui';
import ReviewStateBadge, { tileBadgeSx } from '@/components/drawings/ReviewStateBadge';
import { reviewStateWords } from '@/lib/drawing-source';
import { attemptCountLine, type AttemptCard, type AttemptsView } from '@/lib/inspiration-attempts';
import { inspirationBase, type InspirationMode } from './inspiration-nav';

const tileSx = {
  position: 'relative',
  display: 'block',
  aspectRatio: '1',
  borderRadius: 1.5,
  overflow: 'hidden',
  bgcolor: 'action.hover',
  '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 },
} as const;

/** "Drawn from this": every attempt for staff, the ones rated 4 stars and above for students. */
export default function InspirationAttempts({ mode, itemId, view }: { mode: InspirationMode; itemId: string; view: AttemptsView }) {
  const staff = mode === 'staff';
  const line = attemptCountLine(view.students, view.shown, staff);
  if (!line && view.cards.length === 0) return null;

  const hrefFor = (c: AttemptCard): string | null => {
    if (staff && c.submissionId) return `/teacher/drawing-reviews/${c.submissionId}?from=inspiration&item=${itemId}`;
    return c.itemId ? `${inspirationBase(mode)}/${c.itemId}` : null;
  };
  const labelFor = (c: AttemptCard): string => {
    const parts = [c.credit];
    if (c.practisedFrom) parts.push('practised from this drawing');
    const words = c.review ? reviewStateWords(c.review, { maxMarks: null, viewer: 'teacher' }) : null;
    if (words) parts.push(words);
    return parts.join(', ');
  };

  return (
    <Box component="section" aria-labelledby="inspiration-drawn-from-this" sx={{ mt: 5 }}>
      <Typography id="inspiration-drawn-from-this" variant="h6" component="h2" sx={{ fontWeight: 700 }}>
        Drawn from this
      </Typography>
      {line && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 1.5 }}>
          {line}
        </Typography>
      )}
      {view.cards.length > 0 && (
        <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 1, gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))' }}>
          {view.cards.map((c) => {
            const href = hrefFor(c);
            const inner = (
              <>
                <Box component="img" src={c.thumbnailUrl || c.imageUrl} alt="" loading="lazy" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                {c.review && <ReviewStateBadge review={c.review} maxMarks={null} />}
                {c.practisedFrom && (
                  <Box aria-hidden sx={{ ...tileBadgeSx, left: 6, bottom: 6 }}>Practised</Box>
                )}
              </>
            );
            return (
              <Box component="li" key={c.key} sx={{ minWidth: 0 }}>
                {href ? (
                  <Box component={Link} href={href} aria-label={labelFor(c)} sx={tileSx}>{inner}</Box>
                ) : (
                  <Box role="img" aria-label={labelFor(c)} sx={tileSx}>{inner}</Box>
                )}
                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', mt: 0.5 }}>
                  {c.credit}
                </Typography>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

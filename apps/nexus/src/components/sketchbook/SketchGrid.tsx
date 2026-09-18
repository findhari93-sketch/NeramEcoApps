'use client';

import Link from 'next/link';
import { Box, Button, EmptyState, Skeleton, Typography } from '@neram/ui';
import AutoStoriesOutlinedIcon from '@mui/icons-material/AutoStoriesOutlined';
import StarOutlinedIcon from '@mui/icons-material/StarOutlined';
import ReviewStateBadge, { tileBadgeSx } from '@/components/drawings/ReviewStateBadge';
import { drawingSourceLabel, reviewStateWords } from '@/lib/drawing-source';
import type { SketchbookPayload } from '@/lib/sketchbook-payload';

export type GridSketch = SketchbookPayload['sketches'][number];

interface SketchGridProps {
  sketches: GridSketch[];
  hrefFor: (s: GridSketch) => string;
  loading?: boolean;
  /** Shown under the grid when there may be older months. */
  onLoadOlder?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Whose eyes the tile label speaks for: the student's own, or a teacher's. */
  viewer?: 'own' | 'teacher';
}

const SKELETON_COUNT = 9;

function tileLabel(s: GridSketch, viewer: 'own' | 'teacher'): string {
  const date = new Date(s.submitted_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
  const parts = [`${drawingSourceLabel(s.source_type)} from ${date}`];
  if (s.assignment?.title) parts.push(s.assignment.title);
  const words = reviewStateWords(s.review, { maxMarks: s.assignment?.max_marks ?? null, viewer });
  if (words) parts.push(words);
  if (s.featured.length > 0) parts.push('featured in class');
  return parts.join(', ');
}

/**
 * Square thumbnails, three across on a phone. Loads thumbnail_url and never
 * the original; a sketch without one (thumbnail upload failed) falls back.
 */
export default function SketchGrid({
  sketches, hrefFor, loading = false, onLoadOlder, viewer = 'own',
  emptyTitle = 'Your sketchbook is empty',
  emptyDescription = 'Draw anything for ten minutes and add it here. Small sketches count.',
}: SketchGridProps) {
  if (loading) {
    return (
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(3, 1fr)', sm: 'repeat(4, 1fr)', lg: 'repeat(6, 1fr)' }, gap: 1 }}>
        {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
          <Skeleton key={i} variant="rounded" sx={{ aspectRatio: '1', height: 'auto', width: '100%', borderRadius: 1.5 }} />
        ))}
      </Box>
    );
  }
  if (sketches.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} icon={<AutoStoriesOutlinedIcon />} />;
  }
  return (
    <>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(3, 1fr)', sm: 'repeat(4, 1fr)', lg: 'repeat(6, 1fr)' }, gap: 1 }}>
        {sketches.map((s) => (
          <Box
            key={s.id}
            component={Link}
            href={hrefFor(s)}
            aria-label={tileLabel(s, viewer)}
            sx={{
              position: 'relative', display: 'block', aspectRatio: '1', borderRadius: 1.5, overflow: 'hidden',
              bgcolor: 'action.hover', minWidth: 0,
              '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 },
            }}
          >
            <Box
              component="img"
              src={s.thumbnail_url || s.original_image_url}
              alt=""
              loading="lazy"
              width={400}
              height={400}
              sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
            {s.featured.length > 0 && (
              <Box aria-hidden sx={{ ...tileBadgeSx, top: 6, left: 6, bgcolor: 'warning.main', color: 'warning.contrastText' }}>
                <StarOutlinedIcon sx={{ fontSize: 16 }} />
              </Box>
            )}
            <ReviewStateBadge review={s.review} maxMarks={s.assignment?.max_marks ?? null} />
            {s.source_type !== 'sketchbook' && (
              <Box aria-hidden sx={{ ...tileBadgeSx, left: 6, bottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                {drawingSourceLabel(s.source_type)}
              </Box>
            )}
          </Box>
        ))}
      </Box>
      {onLoadOlder && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
          <Button variant="outlined" onClick={onLoadOlder} sx={{ minHeight: 48 }}>Load older</Button>
        </Box>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        Tap a drawing to open it.
      </Typography>
    </>
  );
}

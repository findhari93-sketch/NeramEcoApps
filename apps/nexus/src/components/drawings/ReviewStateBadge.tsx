'use client';

/**
 * The review state on a drawing tile: stars, marks, a tick, waiting or redo.
 * Decorative (aria-hidden): the tile's own label says the same in words, so
 * nothing is conveyed by the badge's colour or icon alone.
 */

import { Box, alpha } from '@neram/ui';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import HourglassEmptyRoundedIcon from '@mui/icons-material/HourglassEmptyRounded';
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded';
import type { ReviewSummary } from '@/lib/drawing-source';

export const tileBadgeSx = {
  position: 'absolute',
  display: 'flex',
  alignItems: 'center',
  gap: 0.25,
  px: 0.75,
  py: 0.25,
  borderRadius: 1,
  bgcolor: (t: any) => alpha(t.palette.common.black, 0.66),
  color: 'common.white',
  typography: 'caption',
  fontWeight: 700,
  lineHeight: 1.4,
  maxWidth: 'calc(100% - 12px)',
} as const;

export default function ReviewStateBadge({ review, maxMarks }: { review: ReviewSummary; maxMarks: number | null }) {
  if (review.state === 'none') return null;
  let content: React.ReactNode;
  if (review.state === 'reviewed') {
    content =
      review.marks != null && maxMarks ? `${review.marks}/${maxMarks}`
        : review.rating ? (<><StarRoundedIcon sx={{ fontSize: 16 }} />{review.rating}</>)
          : <CheckCircleRoundedIcon sx={{ fontSize: 16 }} />;
  } else if (review.state === 'waiting') {
    content = <HourglassEmptyRoundedIcon sx={{ fontSize: 16 }} />;
  } else {
    content = <ReplayRoundedIcon sx={{ fontSize: 16 }} />;
  }
  return (
    <Box aria-hidden sx={{ ...tileBadgeSx, top: 6, right: 6 }}>
      {content}
    </Box>
  );
}

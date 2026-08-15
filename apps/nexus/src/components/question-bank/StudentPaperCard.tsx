'use client';

/**
 * One paper on the student grid.
 *
 * Answers three questions in the order a student asks them: which paper is this,
 * how far am I through it, and what can I do with it. The face pips are the last
 * line rather than the first because they are the follow-up, not the headline.
 *
 * The whole card is one target. Three separate face buttons would put three
 * 24px controls inside a card on a 375px screen, which fails the touch rules and
 * makes the common action (open the paper) the hardest one to hit.
 */

import { Box, LinearProgress, Paper, Skeleton, Typography, alpha, useTheme } from '@neram/ui';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import type { NexusQBPaperCard } from '@neram/database';
import PaperFacePips from './PaperFacePips';

export interface StudentPaperCardProps {
  paper: NexusQBPaperCard;
  onOpen: (paper: NexusQBPaperCard) => void;
}

/**
 * What to put under a paper's title. Best mock score beats practice progress:
 * a student who has sat the paper cares about the mark, not the coverage.
 *
 * Shared between the card grid and the table view so the two densities never
 * describe the same paper differently.
 */
export function getPaperSubline(paper: NexusQBPaperCard): string {
  return paper.best_test_pct != null
    ? `Best score ${Math.round(paper.best_test_pct)}%`
    : paper.question_count > 0
      ? `${paper.attempted_count} of ${paper.question_count} attempted`
      : 'Original paper';
}

export default function StudentPaperCard({ paper, onOpen }: StudentPaperCardProps) {
  const theme = useTheme();

  const provided = (['read', 'practice', 'test'] as const).filter(
    (f) => paper.faces[f] !== 'unavailable',
  );
  const allDone = provided.length > 0 && provided.every((f) => paper.faces[f] === 'done');

  const subline = getPaperSubline(paper);

  const open = () => onOpen(paper);

  return (
    <Paper
      variant="outlined"
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`${paper.title}, ${subline}`}
      sx={{
        p: 1.75,
        borderRadius: 3,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        minHeight: 132,
        borderColor: allDone ? alpha(theme.palette.success.main, 0.4) : 'divider',
        bgcolor: allDone ? alpha(theme.palette.success.main, 0.04) : 'background.paper',
        // Colour and shadow only. A transform here would shift the card under
        // the finger mid-tap on a touch device that also reports hover.
        transition: theme.transitions.create(['border-color', 'box-shadow'], { duration: 180 }),
        '&:hover': {
          borderColor: theme.palette.primary.main,
          boxShadow: `0 2px 10px ${alpha(theme.palette.primary.main, 0.16)}`,
        },
        '&:focus-visible': {
          outline: `2px solid ${theme.palette.primary.main}`,
          outlineOffset: 2,
        },
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.3 }}>
            {paper.short_title}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
            {subline}
          </Typography>
        </Box>
        {allDone ? (
          <CheckCircleIcon sx={{ fontSize: 20, color: 'success.main', flexShrink: 0 }} />
        ) : (
          <ChevronRightIcon sx={{ fontSize: 20, color: 'text.disabled', flexShrink: 0 }} />
        )}
      </Box>

      {paper.question_count > 0 && (
        <Box>
          <LinearProgress
            variant="determinate"
            value={Math.min(paper.practice_pct, 100)}
            aria-label={`Practice progress ${paper.practice_pct}%`}
            sx={{
              height: 6,
              borderRadius: 3,
              bgcolor: alpha(theme.palette.primary.main, 0.12),
              '& .MuiLinearProgress-bar': {
                borderRadius: 3,
                bgcolor: paper.practice_pct >= 100 ? theme.palette.success.main : theme.palette.primary.main,
              },
            }}
          />
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: '0.68rem', mt: 0.5, display: 'block' }}
          >
            {paper.question_count} questions
          </Typography>
        </Box>
      )}

      <Box sx={{ mt: 'auto' }}>
        <PaperFacePips faces={paper.faces} context={paper.short_title} />
      </Box>
    </Paper>
  );
}

/** Shadows the card's own layout so the grid does not reflow when data lands. */
export function StudentPaperCardSkeleton() {
  return (
    <Paper variant="outlined" sx={{ p: 1.75, borderRadius: 3, minHeight: 132 }}>
      <Skeleton variant="text" width="60%" height={22} />
      <Skeleton variant="text" width="45%" height={16} sx={{ mb: 1.5 }} />
      <Skeleton variant="rounded" height={6} sx={{ borderRadius: 3, mb: 1.5 }} />
      <Skeleton variant="rounded" width="70%" height={24} sx={{ borderRadius: 1 }} />
    </Paper>
  );
}

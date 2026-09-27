'use client';

import Link from 'next/link';
import { Box, Paper, Typography } from '@neram/ui';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

/**
 * A row that opens the learner review form. `from` is where the learner came
 * from, so the review page's Back link returns there.
 */
export default function ReviewPromptCard({ from, sx }: { from: 'feedback' | 'profile'; sx?: object }) {
  return (
    <Paper
      component={Link}
      href={`/review?from=${from}`}
      elevation={0}
      sx={{
        p: 2,
        minHeight: 64,
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        textDecoration: 'none',
        color: 'text.primary',
        transition: 'border-color 0.2s, background-color 0.2s',
        '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        ...sx,
      }}
    >
      <RateReviewOutlinedIcon color="primary" aria-hidden />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle2" component="span" sx={{ display: 'block', fontWeight: 600 }}>
          Studied with Neram? Write a review
        </Typography>
        <Typography variant="body2" color="text.secondary" component="span" sx={{ display: 'block' }}>
          With your permission, we may share it on our website.
        </Typography>
      </Box>
      <ChevronRightIcon sx={{ color: 'text.secondary' }} aria-hidden />
    </Paper>
  );
}

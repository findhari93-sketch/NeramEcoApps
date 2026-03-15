'use client';

import { Box, Paper, Typography, alpha, useTheme } from '@neram/ui';
import type { NexusQBQuestionListItem } from '@neram/database/src/types';
import SourceBadges from './SourceBadges';
import DifficultyChip from './DifficultyChip';
import CategoryChips from './CategoryChips';
import AttemptIndicator from './AttemptIndicator';

interface QuestionCardProps {
  question: NexusQBQuestionListItem;
  mode: 'practice' | 'study';
  onClick: () => void;
}

export default function QuestionCard({ question, mode, onClick }: QuestionCardProps) {
  const theme = useTheme();

  return (
    <Paper
      variant="outlined"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      sx={{
        p: { xs: 1.5, md: 2 },
        cursor: 'pointer',
        transition: 'all 0.2s ease-in-out',
        animation: 'fadeIn 0.3s ease-in',
        '@keyframes fadeIn': {
          from: { opacity: 0, transform: 'translateY(8px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
        '&:hover': {
          elevation: 4,
          boxShadow: theme.shadows[4],
          borderColor: alpha(theme.palette.primary.main, 0.4),
        },
        '&:focus-visible': {
          outline: `2px solid ${theme.palette.primary.main}`,
          outlineOffset: 2,
        },
      }}
    >
      <Box sx={{ display: 'flex', gap: 1.5 }}>
        {/* Main content */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {/* Source badges */}
          <Box sx={{ mb: 1 }}>
            <SourceBadges sources={question.sources} />
          </Box>

          {/* Question text */}
          <Typography
            variant="body2"
            sx={{
              mb: 1,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              lineHeight: 1.5,
              color: 'text.primary',
            }}
          >
            {question.question_text || 'Image-based question'}
          </Typography>

          {/* Bottom row */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              flexWrap: 'wrap',
            }}
          >
            <DifficultyChip difficulty={question.difficulty} size="small" />
            <CategoryChips
              categories={question.categories.slice(0, 2)}
              size="small"
            />
            <Box sx={{ flexGrow: 1 }} />
            <AttemptIndicator summary={question.attempt_summary} />
          </Box>
        </Box>

        {/* Image thumbnail */}
        {question.question_image_url && (
          <Box
            sx={{
              width: { xs: 56, md: 72 },
              height: { xs: 56, md: 72 },
              flexShrink: 0,
              borderRadius: 1,
              overflow: 'hidden',
              bgcolor: 'grey.100',
            }}
          >
            <Box
              component="img"
              src={question.question_image_url}
              alt="Question"
              sx={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
          </Box>
        )}
      </Box>
    </Paper>
  );
}

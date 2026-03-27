'use client';

import { Box, Typography } from '@neram/ui';
import type { QuestionStatus } from './JumpBar';

export interface MiniMapProps {
  totalQuestions: number;
  currentIndex: number;
  questionStatuses: Map<number, QuestionStatus>;
  onJump: (index: number) => void;
}

const STATUS_COLORS: Record<QuestionStatus, string> = {
  correct: '#4caf50',
  incorrect: '#ef5350',
  unattempted: '#e0e0e0',
  bookmarked: '#ffa000',
};

export function MiniMap({
  totalQuestions,
  currentIndex,
  questionStatuses,
  onJump,
}: MiniMapProps) {
  return (
    <Box
      sx={{
        display: { xs: 'none', md: 'flex' },
        flexDirection: 'column',
        alignItems: 'center',
        width: 32,
        borderLeft: 1,
        borderColor: 'divider',
        bgcolor: 'grey.50',
        gap: '2px',
        px: '4px',
        py: 1,
        overflowY: 'auto',
        flexShrink: 0,
        /* Thin scrollbar */
        '&::-webkit-scrollbar': { width: 3 },
        '&::-webkit-scrollbar-thumb': {
          bgcolor: 'grey.300',
          borderRadius: 2,
        },
      }}
    >
      <Typography
        variant="caption"
        sx={{
          fontSize: 8,
          fontWeight: 700,
          color: 'text.secondary',
          letterSpacing: 1,
          mb: 0.5,
          lineHeight: 1,
        }}
      >
        MAP
      </Typography>

      {Array.from({ length: totalQuestions }, (_, i) => {
        const status = questionStatuses.get(i) ?? 'unattempted';
        const isCurrent = i === currentIndex;

        return (
          <Box
            key={i}
            onClick={() => onJump(i)}
            sx={{
              width: 14,
              aspectRatio: '1',
              borderRadius: '3px',
              bgcolor: isCurrent ? '#1976d2' : STATUS_COLORS[status],
              cursor: 'pointer',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              boxShadow: isCurrent ? '0 0 0 1.5px #90caf9' : 'none',
              '&:hover': {
                transform: 'scale(1.2)',
                opacity: 0.85,
              },
            }}
          />
        );
      })}
    </Box>
  );
}

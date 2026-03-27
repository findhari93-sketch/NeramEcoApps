'use client';

import { useState } from 'react';
import { Box, Chip, Typography, useTheme, useMediaQuery } from '@neram/ui';

export type QuestionStatus = 'correct' | 'incorrect' | 'unattempted' | 'bookmarked';

export interface JumpBarProps {
  totalQuestions: number;
  currentIndex: number;
  /** Map of question index to status */
  questionStatuses: Map<number, QuestionStatus>;
  onJump: (index: number) => void;
  /** On mobile, collapsible. Default collapsed showing first maxVisible */
  collapsible?: boolean;
  /** Max items to show before "...N" (default: 10 on mobile, 15 on desktop) */
  maxVisible?: number;
}

const STATUS_COLORS: Record<QuestionStatus, string> = {
  correct: '#4caf50',
  incorrect: '#ef5350',
  unattempted: '#e0e0e0',
  bookmarked: '#e0e0e0',
};

export function JumpBar({
  totalQuestions,
  currentIndex,
  questionStatuses,
  onJump,
  collapsible = false,
  maxVisible: maxVisibleProp,
}: JumpBarProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [expanded, setExpanded] = useState(false);

  const defaultMax = isMobile ? 10 : 15;
  const maxVisible = maxVisibleProp ?? defaultMax;
  const isCollapsed = collapsible && !expanded && totalQuestions > maxVisible;
  const visibleCount = isCollapsed ? maxVisible : totalQuestions;
  const remaining = totalQuestions - maxVisible;
  const size = isMobile ? 24 : 28;
  const gap = isMobile ? '3px' : '4px';

  return (
    <Box sx={{ display: 'flex', gap, flexWrap: 'wrap', alignItems: 'center' }}>
      {Array.from({ length: visibleCount }, (_, i) => {
        const status = questionStatuses.get(i) ?? 'unattempted';
        const isCurrent = i === currentIndex;
        const isBookmarked = status === 'bookmarked';
        const bgColor = isCurrent ? '#1976d2' : STATUS_COLORS[status];
        const textColor =
          isCurrent || status === 'correct' || status === 'incorrect'
            ? '#fff'
            : '#424242';

        return (
          <Box
            key={i}
            onClick={() => onJump(i)}
            sx={{
              width: size,
              height: size,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '4px',
              backgroundColor: bgColor,
              color: textColor,
              fontSize: isMobile ? 10 : 11,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              transform: isCurrent ? 'scale(1.1)' : 'scale(1)',
              boxShadow: isCurrent
                ? '0 0 0 2px #90caf9'
                : isBookmarked
                  ? '0 0 0 1.5px #ffa000'
                  : 'none',
              '&:hover': {
                transform: 'scale(1.15)',
                opacity: 0.9,
              },
            }}
          >
            {i + 1}
          </Box>
        );
      })}

      {isCollapsed && (
        <Chip
          label={`...${remaining}`}
          size="small"
          onClick={() => setExpanded(true)}
          sx={{
            height: size,
            fontSize: isMobile ? 10 : 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        />
      )}

      {collapsible && expanded && totalQuestions > (maxVisibleProp ?? defaultMax) && (
        <Typography
          variant="caption"
          onClick={() => setExpanded(false)}
          sx={{
            cursor: 'pointer',
            color: 'primary.main',
            ml: 0.5,
            '&:hover': { textDecoration: 'underline' },
          }}
        >
          Collapse
        </Typography>
      )}
    </Box>
  );
}

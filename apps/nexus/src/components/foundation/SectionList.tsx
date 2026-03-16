'use client';

import { Box, Typography, alpha, useTheme } from '@neram/ui';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import type { NexusFoundationSectionWithQuiz } from '@neram/database/types';

interface SectionListProps {
  sections: NexusFoundationSectionWithQuiz[];
  currentSectionIndex: number;
  chapterNumber?: number;
  onSectionClick: (index: number) => void;
}

function formatDuration(startSec: number, endSec: number): string {
  const duration = endSec - startSec;
  const m = Math.floor(duration / 60);
  const s = duration % 60;
  if (m === 0) return `${s}s`;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export default function SectionList({
  sections,
  currentSectionIndex,
  chapterNumber,
  onSectionClick,
}: SectionListProps) {
  const theme = useTheme();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Typography
        variant="subtitle2"
        sx={{ fontWeight: 700, mb: 1, px: 0.5 }}
      >
        Sections ({sections.length})
      </Typography>

      {sections.map((section, index) => {
        const isPassed = section.quiz_attempt?.passed === true;
        const isCurrent = index === currentSectionIndex;
        const isLocked = !isPassed && index > 0 && !sections[index - 1]?.quiz_attempt?.passed;
        const isFirst = index === 0;
        const isAccessible = isFirst || !isLocked;

        return (
          <Box
            key={section.id}
            onClick={() => isAccessible && onSectionClick(index)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              py: 1.5,
              px: 1.5,
              borderRadius: 2,
              cursor: isAccessible ? 'pointer' : 'not-allowed',
              bgcolor: isCurrent
                ? alpha(theme.palette.primary.main, 0.08)
                : 'transparent',
              border: isCurrent
                ? `1px solid ${alpha(theme.palette.primary.main, 0.2)}`
                : '1px solid transparent',
              opacity: isLocked ? 0.5 : 1,
              transition: 'all 150ms ease',
              minHeight: 48,
              ...(isAccessible && !isCurrent && {
                '&:hover': {
                  bgcolor: alpha(theme.palette.action.hover, 0.04),
                },
              }),
            }}
          >
            {/* Status icon */}
            <Box sx={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
              {isPassed ? (
                <CheckCircleIcon sx={{ fontSize: '1.3rem', color: theme.palette.success.main }} />
              ) : isLocked ? (
                <LockOutlinedIcon sx={{ fontSize: '1.2rem', color: theme.palette.text.disabled }} />
              ) : isCurrent ? (
                <PlayArrowIcon sx={{ fontSize: '1.3rem', color: theme.palette.primary.main }} />
              ) : (
                <RadioButtonUncheckedIcon sx={{ fontSize: '1.2rem', color: theme.palette.text.disabled }} />
              )}
            </Box>

            {/* Section info */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: isCurrent ? 600 : 500,
                  fontSize: '0.85rem',
                  lineHeight: 1.3,
                  color: isLocked ? 'text.disabled' : 'text.primary',
                }}
              >
                {chapterNumber != null && (
                  <Typography
                    component="span"
                    sx={{
                      fontWeight: 700,
                      color: isCurrent ? 'primary.main' : 'text.secondary',
                      mr: 0.5,
                      fontSize: '0.75rem',
                    }}
                  >
                    {chapterNumber}{String.fromCharCode(65 + index)}
                  </Typography>
                )}
                {section.title}
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: 'text.secondary', fontSize: '0.7rem' }}
              >
                {formatDuration(section.start_timestamp_seconds, section.end_timestamp_seconds)}
              </Typography>
            </Box>

            {/* Quiz indicator */}
            {section.quiz_questions.length > 0 && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  flexShrink: 0,
                }}
              >
                <QuizOutlinedIcon
                  sx={{
                    fontSize: '0.9rem',
                    color: isPassed ? theme.palette.success.main : theme.palette.text.secondary,
                  }}
                />
                <Typography
                  variant="caption"
                  sx={{
                    fontSize: '0.65rem',
                    color: isPassed ? theme.palette.success.main : 'text.secondary',
                    fontWeight: isPassed ? 600 : 400,
                  }}
                >
                  {isPassed
                    ? 'Passed'
                    : section.min_questions_to_pass
                      ? `${section.min_questions_to_pass}/${section.quiz_questions.length}`
                      : `${section.quiz_questions.length}Q`
                  }
                </Typography>
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

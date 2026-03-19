'use client';

import { Box, Paper, Typography, alpha, useTheme } from '@neram/ui';
import type { NexusQBQuestionOption } from '@neram/database';
import MathText from '@/components/common/MathText';

interface MCQOptionsProps {
  options: NexusQBQuestionOption[];
  selectedId: string | null;
  correctId?: string | null;
  submitted: boolean;
  onSelect: (id: string) => void;
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export default function MCQOptions({
  options,
  selectedId,
  correctId,
  submitted,
  onSelect,
}: MCQOptionsProps) {
  const theme = useTheme();

  const getOptionStyles = (optionId: string) => {
    const isSelected = optionId === selectedId;
    const isCorrect = optionId === correctId;

    if (submitted && correctId) {
      if (isCorrect) {
        return {
          bgcolor: alpha(theme.palette.success.main, 0.12),
          borderColor: theme.palette.success.main,
          borderWidth: 2,
        };
      }
      if (isSelected && !isCorrect) {
        return {
          bgcolor: alpha(theme.palette.error.main, 0.12),
          borderColor: theme.palette.error.main,
          borderWidth: 2,
        };
      }
      return {
        bgcolor: 'background.paper',
        borderColor: 'divider',
        borderWidth: 1,
        opacity: 0.6,
      };
    }

    if (isSelected) {
      return {
        bgcolor: alpha(theme.palette.primary.main, 0.08),
        borderColor: theme.palette.primary.main,
        borderWidth: 2,
      };
    }

    return {
      bgcolor: 'background.paper',
      borderColor: 'divider',
      borderWidth: 1,
    };
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {options.map((option, idx) => {
        const styles = getOptionStyles(option.id);
        return (
          <Paper
            key={option.id}
            variant="outlined"
            onClick={() => !submitted && onSelect(option.id)}
            role="radio"
            aria-checked={option.id === selectedId}
            aria-disabled={submitted}
            tabIndex={submitted ? -1 : 0}
            onKeyDown={(e) => {
              if (!submitted && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onSelect(option.id);
              }
            }}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              p: { xs: 1.5, md: 2 },
              minHeight: 56,
              cursor: submitted ? 'default' : 'pointer',
              transition: 'all 0.15s ease',
              borderStyle: 'solid',
              ...styles,
              '&:hover': submitted
                ? {}
                : {
                    borderColor: theme.palette.primary.main,
                    bgcolor: alpha(theme.palette.primary.main, 0.04),
                  },
              '&:focus-visible': {
                outline: `2px solid ${theme.palette.primary.main}`,
                outlineOffset: 2,
              },
            }}
          >
            {/* Option letter */}
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor:
                  option.id === selectedId
                    ? theme.palette.primary.main
                    : alpha(theme.palette.text.primary, 0.08),
                color:
                  option.id === selectedId ? '#fff' : 'text.secondary',
                fontWeight: 700,
                fontSize: '0.85rem',
                flexShrink: 0,
                transition: 'all 0.15s ease',
              }}
            >
              {OPTION_LETTERS[idx] || idx + 1}
            </Box>

            {/* Option content */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              {option.text ? (
                <MathText text={option.text} variant="body2" sx={{ lineHeight: 1.5 }} />
              ) : null}
              {option.image_url && (
                <Box
                  component="img"
                  src={option.image_url}
                  alt={`Option ${OPTION_LETTERS[idx]}`}
                  sx={{
                    mt: 1,
                    maxWidth: '100%',
                    maxHeight: 120,
                    borderRadius: 1,
                    objectFit: 'contain',
                  }}
                />
              )}
            </Box>
          </Paper>
        );
      })}
    </Box>
  );
}

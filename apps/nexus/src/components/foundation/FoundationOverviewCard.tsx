'use client';

import { Box, Typography, Paper, Button, alpha, useTheme, Skeleton } from '@neram/ui';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import FoundationProgressBar from './ProgressBar';
import type { NexusFoundationChapterWithProgress, FoundationChapterStatus } from '@neram/database/types';

interface FoundationOverviewCardProps {
  chapters: NexusFoundationChapterWithProgress[] | null;
  loading?: boolean;
  onContinue: (chapterId: string) => void;
  onViewAll: () => void;
}

function getEffectiveStatus(
  chapters: NexusFoundationChapterWithProgress[],
  index: number
): FoundationChapterStatus {
  const chapter = chapters[index];
  if (chapter.progress?.status === 'completed') return 'completed';
  if (chapter.progress?.status === 'in_progress') return 'in_progress';
  if (index === 0) return 'in_progress';
  const prevStatus = getEffectiveStatus(chapters, index - 1);
  return prevStatus === 'completed' ? 'in_progress' : 'locked';
}

export default function FoundationOverviewCard({
  chapters,
  loading,
  onContinue,
  onViewAll,
}: FoundationOverviewCardProps) {
  const theme = useTheme();

  if (loading) {
    return (
      <Paper elevation={0} sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3, border: `1px solid ${theme.palette.divider}`, mb: 3 }}>
        <Skeleton variant="text" width={180} height={28} />
        <Skeleton variant="rectangular" height={8} sx={{ borderRadius: 4, my: 2 }} />
        <Skeleton variant="text" width={140} height={20} />
      </Paper>
    );
  }

  if (!chapters || chapters.length === 0) return null;

  const completedCount = chapters.filter((_, i) => getEffectiveStatus(chapters, i) === 'completed').length;
  const totalCount = chapters.length;
  const allCompleted = completedCount === totalCount;

  // Find current chapter (first non-completed)
  const currentIndex = chapters.findIndex((_, i) => getEffectiveStatus(chapters, i) !== 'completed');
  const currentChapter = currentIndex >= 0 ? chapters[currentIndex] : null;

  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 1.5, sm: 2 },
        borderRadius: 2,
        border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
        background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.04)} 0%, ${alpha(theme.palette.primary.main, 0.01)} 100%)`,
        mb: 0,
      }}
    >
      {/* Row 1: Icon + Title + Progress + Continue */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        {/* Icon */}
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: 2,
            bgcolor: alpha(theme.palette.primary.main, 0.1),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {allCompleted ? (
            <CheckCircleIcon sx={{ fontSize: '1.2rem', color: theme.palette.success.main }} />
          ) : (
            <MenuBookOutlinedIcon sx={{ fontSize: '1.1rem', color: theme.palette.primary.main }} />
          )}
        </Box>

        {/* Content */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.25 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.8rem', lineHeight: 1.2 }}>
              Foundation Module
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.65rem', flexShrink: 0 }}>
              {completedCount}/{totalCount}
            </Typography>
          </Box>

          {/* Progress bar */}
          <FoundationProgressBar
            completed={completedCount}
            total={totalCount}
            size="small"
            showPercentage={false}
          />
        </Box>

        {/* Continue button */}
        {currentChapter && !allCompleted && (
          <Button
            variant="contained"
            size="small"
            onClick={() => onContinue(currentChapter.id)}
            sx={{
              borderRadius: 1.5,
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.75rem',
              px: 1.5,
              py: 0.5,
              minHeight: 30,
              minWidth: 'auto',
              flexShrink: 0,
              boxShadow: 'none',
              '&:hover': { boxShadow: 'none' },
            }}
          >
            Continue
          </Button>
        )}
      </Box>

      {/* Row 2: Current chapter + chapter dots + View All */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1, pl: '52px' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
          {currentChapter && !allCompleted ? (
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem', lineHeight: 1.2 }} noWrap>
              Ch {currentChapter.chapter_number}: <strong>{currentChapter.title}</strong>
            </Typography>
          ) : allCompleted ? (
            <Typography variant="caption" sx={{ color: theme.palette.success.main, fontSize: '0.7rem', fontWeight: 600 }}>
              All chapters completed!
            </Typography>
          ) : null}

          {/* Chapter dots */}
          <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
            {chapters.map((ch, i) => {
              const status = getEffectiveStatus(chapters, i);
              return (
                <Box
                  key={ch.id}
                  sx={{
                    width: 14,
                    height: 4,
                    borderRadius: 2,
                    bgcolor: status === 'completed'
                      ? theme.palette.success.main
                      : status === 'in_progress'
                        ? theme.palette.primary.main
                        : alpha(theme.palette.action.disabled, 0.2),
                  }}
                />
              );
            })}
          </Box>
        </Box>

        <Button
          variant="text"
          size="small"
          onClick={onViewAll}
          sx={{
            textTransform: 'none',
            fontWeight: 500,
            fontSize: '0.7rem',
            color: 'text.secondary',
            minWidth: 'auto',
            px: 0.5,
            py: 0,
            minHeight: 'auto',
            '&:hover': { color: 'primary.main', bgcolor: 'transparent' },
          }}
        >
          View All
        </Button>
      </Box>
    </Paper>
  );
}

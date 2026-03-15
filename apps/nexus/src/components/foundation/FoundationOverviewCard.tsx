'use client';

import { Box, Typography, Paper, Button, alpha, useTheme, Skeleton } from '@neram/ui';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
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
        p: { xs: 2, sm: 3 },
        borderRadius: 3,
        border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
        background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.04)} 0%, ${alpha(theme.palette.primary.main, 0.01)} 100%)`,
        mb: 3,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: 2,
            bgcolor: alpha(theme.palette.primary.main, 0.1),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MenuBookOutlinedIcon sx={{ fontSize: '1.2rem', color: theme.palette.primary.main }} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            Foundation Module
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
            {allCompleted ? 'All chapters completed!' : `Chapter ${currentChapter?.chapter_number || 1} of ${totalCount}`}
          </Typography>
        </Box>
        {allCompleted && (
          <CheckCircleIcon sx={{ fontSize: '1.5rem', color: theme.palette.success.main }} />
        )}
      </Box>

      {/* Progress */}
      <FoundationProgressBar
        completed={completedCount}
        total={totalCount}
        label="Chapters completed"
        size="medium"
      />

      {/* Current chapter info */}
      {currentChapter && !allCompleted && (
        <Box sx={{ mt: 2 }}>
          <Typography
            variant="body2"
            sx={{ color: 'text.secondary', fontSize: '0.8rem', mb: 1 }}
          >
            Currently on: <strong>{currentChapter.title}</strong>
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="contained"
              size="small"
              onClick={() => onContinue(currentChapter.id)}
              endIcon={<ArrowForwardIcon />}
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.8rem',
                px: 2,
                py: 0.75,
                minHeight: 36,
              }}
            >
              Continue Learning
            </Button>
            <Button
              variant="text"
              size="small"
              onClick={onViewAll}
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 500,
                fontSize: '0.8rem',
                color: 'text.secondary',
              }}
            >
              View All
            </Button>
          </Box>
        </Box>
      )}

      {/* Chapter dots/pills */}
      <Box sx={{ display: 'flex', gap: 0.5, mt: 2, flexWrap: 'wrap' }}>
        {chapters.map((ch, i) => {
          const status = getEffectiveStatus(chapters, i);
          return (
            <Box
              key={ch.id}
              sx={{
                width: 24,
                height: 6,
                borderRadius: 3,
                bgcolor: status === 'completed'
                  ? theme.palette.success.main
                  : status === 'in_progress'
                    ? theme.palette.primary.main
                    : alpha(theme.palette.action.disabled, 0.2),
                transition: 'background-color 300ms ease',
              }}
            />
          );
        })}
      </Box>
    </Paper>
  );
}

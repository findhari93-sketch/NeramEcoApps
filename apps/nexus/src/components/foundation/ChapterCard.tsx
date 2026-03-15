'use client';

import { Box, Typography, Paper, alpha, useTheme, Chip } from '@neram/ui';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PlayCircleFilledIcon from '@mui/icons-material/PlayCircleFilled';
import FoundationProgressBar from './ProgressBar';
import type { NexusFoundationChapterWithProgress, FoundationChapterStatus } from '@neram/database/types';

interface ChapterCardProps {
  chapter: NexusFoundationChapterWithProgress;
  effectiveStatus: FoundationChapterStatus;
  onClick?: () => void;
  delay?: number;
}

export default function ChapterCard({ chapter, effectiveStatus, onClick, delay = 0 }: ChapterCardProps) {
  const theme = useTheme();
  const isLocked = effectiveStatus === 'locked';
  const isCompleted = effectiveStatus === 'completed';
  const isInProgress = effectiveStatus === 'in_progress';

  const statusColor = isCompleted
    ? theme.palette.success.main
    : isInProgress
      ? theme.palette.primary.main
      : theme.palette.text.disabled;

  return (
    <Paper
      elevation={0}
      onClick={isLocked ? undefined : onClick}
      sx={{
        p: { xs: 2, sm: 2.5 },
        borderRadius: 3,
        border: `1px solid ${isInProgress ? alpha(theme.palette.primary.main, 0.3) : theme.palette.divider}`,
        bgcolor: isLocked ? alpha(theme.palette.action.disabled, 0.03) : 'background.paper',
        opacity: isLocked ? 0.6 : 1,
        cursor: isLocked ? 'not-allowed' : 'pointer',
        transition: 'all 200ms ease',
        animation: `fadeInUp 400ms cubic-bezier(0.05, 0.7, 0.1, 1) ${delay}ms both`,
        '@keyframes fadeInUp': {
          from: { opacity: 0, transform: 'translateY(12px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
        ...(!isLocked && {
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: `0 4px 16px ${alpha(theme.palette.primary.main, 0.1)}`,
            borderColor: alpha(theme.palette.primary.main, 0.4),
          },
          '&:active': {
            transform: 'translateY(0)',
          },
        }),
      }}
    >
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
        {/* Chapter Number / Status Icon */}
        <Box
          sx={{
            width: 44,
            height: 44,
            borderRadius: 2.5,
            bgcolor: isCompleted
              ? alpha(theme.palette.success.main, 0.1)
              : isInProgress
                ? alpha(theme.palette.primary.main, 0.1)
                : alpha(theme.palette.action.disabled, 0.08),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {isLocked ? (
            <LockOutlinedIcon sx={{ fontSize: '1.25rem', color: theme.palette.text.disabled }} />
          ) : isCompleted ? (
            <CheckCircleIcon sx={{ fontSize: '1.5rem', color: theme.palette.success.main }} />
          ) : (
            <Typography
              sx={{
                fontWeight: 800,
                fontSize: '1.1rem',
                color: theme.palette.primary.main,
              }}
            >
              {chapter.chapter_number}
            </Typography>
          )}
        </Box>

        {/* Content */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: 700,
                color: isLocked ? 'text.disabled' : 'text.primary',
                lineHeight: 1.3,
                flex: 1,
              }}
            >
              {chapter.title}
            </Typography>
            {isCompleted && (
              <Chip label="Done" size="small" color="success" sx={{ height: 22, fontSize: '0.65rem', fontWeight: 700 }} />
            )}
            {isInProgress && (
              <Chip label="In Progress" size="small" color="primary" sx={{ height: 22, fontSize: '0.65rem', fontWeight: 700 }} />
            )}
          </Box>

          {chapter.description && (
            <Typography
              variant="body2"
              sx={{
                color: 'text.secondary',
                fontSize: '0.8rem',
                lineHeight: 1.4,
                mb: 1,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {chapter.description}
            </Typography>
          )}

          {/* Progress bar for in-progress chapters */}
          {isInProgress && chapter.section_count > 0 && (
            <FoundationProgressBar
              completed={chapter.completed_sections}
              total={chapter.section_count}
              size="small"
              label="Sections"
            />
          )}

          {/* Section count for locked chapters */}
          {isLocked && chapter.section_count > 0 && (
            <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>
              {chapter.section_count} sections
            </Typography>
          )}
        </Box>

        {/* Play button for accessible chapters */}
        {!isLocked && !isCompleted && (
          <PlayCircleFilledIcon
            sx={{
              fontSize: '2rem',
              color: alpha(theme.palette.primary.main, 0.7),
              flexShrink: 0,
              alignSelf: 'center',
            }}
          />
        )}
      </Box>
    </Paper>
  );
}

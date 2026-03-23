'use client';

import { Box, LinearProgress, Typography, Stack } from '@neram/ui';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import type { ExamRecallCheckpointStatus } from '@neram/database';

interface CheckpointProgressProps {
  checkpoint: ExamRecallCheckpointStatus;
}

const DRAWING_REQUIRED = 3;
const APTITUDE_REQUIRED = 5;

export default function CheckpointProgress({ checkpoint }: CheckpointProgressProps) {
  const drawingCount = checkpoint.checkpoint?.drawing_count ?? 0;
  const aptitudeCount = checkpoint.checkpoint?.aptitude_count ?? 0;
  const drawingProgress = Math.min((drawingCount / DRAWING_REQUIRED) * 100, 100);
  const aptitudeProgress = Math.min((aptitudeCount / APTITUDE_REQUIRED) * 100, 100);

  if (checkpoint.is_unlocked) {
    return (
      <Box
        sx={{
          p: { xs: 1.5, md: 2 },
          borderRadius: 2,
          bgcolor: 'success.50',
          border: '1px solid',
          borderColor: 'success.200',
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <CheckCircleIcon color="success" sx={{ fontSize: '1.5rem' }} />
          <Typography variant="body2" fontWeight={600} color="success.main">
            Access unlocked! Browse all recalled questions
          </Typography>
        </Stack>
      </Box>
    );
  }

  const remainingDrawings = checkpoint.drawing_remaining;
  const remainingAptitude = checkpoint.aptitude_remaining;
  const parts: string[] = [];
  if (remainingDrawings > 0) parts.push(`${remainingDrawings} more drawing${remainingDrawings > 1 ? 's' : ''}`);
  if (remainingAptitude > 0) parts.push(`${remainingAptitude} more question${remainingAptitude > 1 ? 's' : ''}`);
  const statusMessage = `Share ${parts.join(' and ')} to unlock`;

  return (
    <Box
      sx={{
        p: { xs: 1.5, md: 2 },
        borderRadius: 2,
        bgcolor: 'grey.50',
        border: '1px solid',
        borderColor: 'grey.200',
      }}
    >
      <Stack spacing={1.5}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <LockOpenIcon sx={{ fontSize: '1.25rem', color: 'text.secondary' }} />
          <Typography variant="subtitle2">Contribution Progress</Typography>
        </Stack>

        {/* Drawing progress */}
        <Box>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              Drawing (Part A):
            </Typography>
            <Typography variant="caption" fontWeight={600}>
              {drawingCount}/{DRAWING_REQUIRED}
            </Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={drawingProgress}
            sx={{
              height: 6,
              borderRadius: 3,
              bgcolor: 'grey.200',
              '& .MuiLinearProgress-bar': {
                borderRadius: 3,
                bgcolor: drawingProgress >= 100 ? 'success.main' : 'primary.main',
              },
            }}
          />
        </Box>

        {/* Aptitude progress */}
        <Box>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              Aptitude (Part B):
            </Typography>
            <Typography variant="caption" fontWeight={600}>
              {aptitudeCount}/{APTITUDE_REQUIRED}
            </Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={aptitudeProgress}
            sx={{
              height: 6,
              borderRadius: 3,
              bgcolor: 'grey.200',
              '& .MuiLinearProgress-bar': {
                borderRadius: 3,
                bgcolor: aptitudeProgress >= 100 ? 'success.main' : 'warning.main',
              },
            }}
          />
        </Box>

        {/* Status message */}
        <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
          {statusMessage}
        </Typography>
      </Stack>
    </Box>
  );
}

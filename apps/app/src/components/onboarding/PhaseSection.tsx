// @ts-nocheck
'use client';

import { Box, Typography, LinearProgress, Chip } from '@neram/ui';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LockIcon from '@mui/icons-material/Lock';

interface PhaseSectionProps {
  phaseNumber: number;
  title: string;
  isActive: boolean;
  isComplete: boolean;
  completedCount: number;
  totalCount: number;
  children: React.ReactNode;
}

export default function PhaseSection({
  phaseNumber,
  title,
  isActive,
  isComplete,
  completedCount,
  totalCount,
  children,
}: PhaseSectionProps) {
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <Box
      sx={{
        mb: 2.5,
        opacity: isActive || isComplete ? 1 : 0.5,
        transition: 'opacity 0.3s',
      }}
    >
      {/* Phase Header */}
      <Box
        display="flex"
        alignItems="center"
        gap={1.5}
        mb={1.5}
        sx={{
          p: 1.5,
          borderRadius: 2,
          bgcolor: isComplete ? 'success.50' : isActive ? 'primary.50' : 'grey.50',
          border: '1px solid',
          borderColor: isComplete ? 'success.light' : isActive ? 'primary.light' : 'grey.200',
        }}
      >
        {/* Phase indicator */}
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            bgcolor: isComplete ? 'success.main' : isActive ? 'primary.main' : 'grey.300',
            color: 'white',
          }}
        >
          {isComplete ? (
            <CheckCircleIcon sx={{ fontSize: 20 }} />
          ) : !isActive ? (
            <LockIcon sx={{ fontSize: 16 }} />
          ) : (
            <Typography variant="caption" fontWeight={800}>
              {phaseNumber}
            </Typography>
          )}
        </Box>

        {/* Title + progress */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.5}>
            <Typography variant="body2" fontWeight={700} color={isActive || isComplete ? 'text.primary' : 'text.disabled'}>
              {title}
            </Typography>
            <Chip
              label={`${completedCount}/${totalCount}`}
              size="small"
              color={isComplete ? 'success' : isActive ? 'primary' : 'default'}
              sx={{ fontWeight: 700, fontSize: '0.7rem', height: 22 }}
            />
          </Box>
          <LinearProgress
            variant="determinate"
            value={progressPercent}
            color={isComplete ? 'success' : 'primary'}
            sx={{ height: 4, borderRadius: 2, bgcolor: 'rgba(0,0,0,0.06)' }}
          />
        </Box>
      </Box>

      {/* Steps within this phase */}
      {(isActive || isComplete) && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pl: 1 }}>
          {children}
        </Box>
      )}
    </Box>
  );
}

'use client';

import { Box, Typography } from '@neram/ui';

export interface ProgressHeaderProps {
  /** e.g. "NATA 2025 - Test 1" */
  contextLabel: string;
  currentIndex: number;
  totalQuestions: number;
  correctCount: number;
  incorrectCount: number;
  /** Children rendered below progress bar (e.g. JumpBar, FilterChips) */
  children?: React.ReactNode;
}

export function ProgressHeader({
  contextLabel,
  currentIndex,
  totalQuestions,
  correctCount,
  incorrectCount,
  children,
}: ProgressHeaderProps) {
  const attempted = correctCount + incorrectCount;
  const remaining = totalQuestions - attempted;
  const progressPct = totalQuestions > 0 ? (attempted / totalQuestions) * 100 : 0;
  const correctPct = attempted > 0 ? (correctCount / attempted) * 100 : 0;

  return (
    <Box
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        bgcolor: 'background.paper',
        borderBottom: 1,
        borderColor: 'divider',
        px: { xs: 1.5, sm: 2 },
        py: 1,
      }}
    >
      {/* Row 1: Context label + question counter */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 0.5,
        }}
      >
        <Typography
          variant="body2"
          sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', mr: 1 }}
        >
          {contextLabel}
        </Typography>
        <Typography variant="body2" sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>
          Q{currentIndex + 1} of {totalQuestions}
        </Typography>
      </Box>

      {/* Row 2: Gradient progress bar */}
      <Box
        sx={{
          width: '100%',
          height: 3,
          bgcolor: 'grey.200',
          borderRadius: 1.5,
          overflow: 'hidden',
          mb: 0.5,
        }}
      >
        <Box
          sx={{
            width: `${progressPct}%`,
            height: '100%',
            borderRadius: 1.5,
            background:
              attempted > 0
                ? `linear-gradient(to right, #4caf50 ${correctPct}%, #ef5350 ${correctPct}%)`
                : 'transparent',
            transition: 'width 0.3s ease',
          }}
        />
      </Box>

      {/* Row 3: Stats line */}
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: children ? 1 : 0 }}>
        {'✓ '}{correctCount} correct{' • '}{'✗ '}{incorrectCount} wrong{' • '}{remaining} remaining
      </Typography>

      {/* Children slot for JumpBar, FilterChips, etc. */}
      {children}
    </Box>
  );
}

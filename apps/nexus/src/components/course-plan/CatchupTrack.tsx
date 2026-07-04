'use client';

/**
 * The numbered catch-up track list: done steps ticked, the current step
 * highlighted with a CTA, later steps locked. Shared by the teacher
 * Catch-up screen and the student Self-learning page.
 */
import { ReactNode } from 'react';
import { Box, Typography, Stack, alpha } from '@neram/ui';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';

export interface TrackStep {
  id: string;
  title: string;
  description?: string | null;
  done: boolean;
}

export default function CatchupTrack({
  steps,
  onStepClick,
  currentAction,
  lockFuture = true,
}: {
  steps: TrackStep[];
  /** Tap anywhere on an unlocked step. */
  onStepClick?: (step: TrackStep, index: number) => void;
  /** Rendered on the right of the current step (e.g. a Start button). */
  currentAction?: (step: TrackStep, index: number) => ReactNode;
  /** When false, later steps are tappable too (teacher view). */
  lockFuture?: boolean;
}) {
  const currentIdx = steps.findIndex((s) => !s.done);
  return (
    <Stack spacing={1}>
      {steps.map((s, i) => {
        const isDone = s.done;
        const isCurrent = i === currentIdx;
        const locked = lockFuture && currentIdx !== -1 && i > currentIdx;
        const clickable = !!onStepClick && !locked;
        return (
          <Box
            key={s.id}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            onClick={() => clickable && onStepClick!(s, i)}
            onKeyDown={(e) => e.key === 'Enter' && clickable && onStepClick!(s, i)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              px: 1.75,
              py: 1.5,
              minHeight: 56,
              borderRadius: 3,
              bgcolor: 'background.paper',
              border: isCurrent ? '1.5px solid' : '1px solid',
              borderColor: isCurrent ? 'primary.main' : 'divider',
              opacity: isDone ? 0.65 : locked ? 0.75 : 1,
              cursor: clickable ? 'pointer' : 'default',
              '&:hover': clickable ? { borderColor: alpha('#7C3AED', 0.5) } : {},
            }}
          >
            <Box
              sx={{
                width: 30,
                height: 30,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.82rem',
                fontWeight: 800,
                flexShrink: 0,
                bgcolor: isDone ? 'rgba(46,125,50,0.12)' : isCurrent ? 'rgba(124,58,237,0.12)' : alpha('#1A2027', 0.06),
                color: isDone ? '#1B5E20' : isCurrent ? '#5B21B6' : 'text.secondary',
              }}
            >
              {isDone ? '✓' : i + 1}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', lineHeight: 1.3 }}>{s.title}</Typography>
              {s.description && (
                <Typography variant="caption" color="text.secondary">
                  {s.description}
                </Typography>
              )}
            </Box>
            {isCurrent && currentAction ? (
              <Box sx={{ flexShrink: 0 }}>{currentAction(s, i)}</Box>
            ) : locked ? (
              <LockOutlinedIcon sx={{ fontSize: 16, color: 'text.disabled', flexShrink: 0 }} />
            ) : null}
          </Box>
        );
      })}
    </Stack>
  );
}

'use client';

/**
 * The numbered catch-up track list: done steps ticked, the current step
 * highlighted with a CTA, later steps locked. Shared by the teacher
 * Catch-up screen and the student Self-learning page.
 */
import { ReactNode } from 'react';
import { Box, Typography, Stack, alpha } from '@neram/ui';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';

/**
 * Explicit per-step state, for callers whose ordering is not simply "the first
 * unfinished one is next". A catch-up backlog steps OVER a class whose recap the
 * teacher has not published yet rather than stalling every later class behind
 * it, which the done/not-done derivation below cannot express.
 */
export type TrackStepStatus = 'done' | 'current' | 'locked' | 'pending' | 'excused';

export interface TrackStep {
  id: string;
  title: string;
  description?: string | null;
  done: boolean;
  /** Optional. When any step sets it, the derived ordering is not used. */
  status?: TrackStepStatus;
  /** Optional badge number. Defaults to the row's index. */
  label?: string | number;
}

export default function CatchupTrack({
  steps,
  onStepClick,
  currentAction,
  trailing,
  lockFuture = true,
}: {
  steps: TrackStep[];
  /** Tap anywhere on an unlocked step. */
  onStepClick?: (step: TrackStep, index: number) => void;
  /** Rendered on the right of the current step (e.g. a Start button). */
  currentAction?: (step: TrackStep, index: number) => ReactNode;
  /** Rendered on the right of every OTHER step (e.g. a due-date chip). */
  trailing?: (step: TrackStep, index: number) => ReactNode;
  /** When false, later steps are tappable too (teacher view). */
  lockFuture?: boolean;
}) {
  const explicit = steps.some((s) => s.status);
  const currentIdx = explicit
    ? steps.findIndex((s) => s.status === 'current')
    : steps.findIndex((s) => !s.done);
  return (
    <Stack spacing={1}>
      {steps.map((s, i) => {
        const isDone = explicit ? s.status === 'done' || s.status === 'excused' : s.done;
        const isCurrent = i === currentIdx;
        const locked = explicit
          ? s.status === 'locked' || s.status === 'pending'
          : lockFuture && currentIdx !== -1 && i > currentIdx;
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
              {isDone ? '✓' : (s.label ?? i + 1)}
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
            ) : trailing?.(s, i) ? (
              <Box sx={{ flexShrink: 0 }}>{trailing(s, i)}</Box>
            ) : locked ? (
              <LockOutlinedIcon sx={{ fontSize: 16, color: 'text.disabled', flexShrink: 0 }} />
            ) : null}
          </Box>
        );
      })}
    </Stack>
  );
}

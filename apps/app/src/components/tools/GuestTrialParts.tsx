'use client';

import { Box, Button, Typography, alpha } from '@neram/ui';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import DemoGate from './DemoGate';
import { useToolTrial } from './ToolTrial';
import type { PendingInput } from '@/lib/tools/pending-input';
import type { ToolId } from '@/lib/tools/tool-ids';

/**
 * The strip above a full tool opened as a free trial: how many calculations
 * are left, and the way back to the public page.
 */
export function GuestTrialBanner({ remaining, limit, locked = false }: { remaining: number; limit: number; locked?: boolean }) {
  const trial = useToolTrial();
  const text =
    remaining > 0
      ? `Free trial: ${remaining} of ${limit} calculation${limit === 1 ? '' : 's'} left on this device. Sign in to keep using it and save your scores.`
      : locked
        ? 'You have used your free calculations. Sign in free to keep going; what you entered stays filled in.'
        : 'That was your last free calculation on this device. Sign in free to keep going and save it.';
  return (
    <Box
      role="status"
      sx={{
        mb: 2,
        p: 1.5,
        borderRadius: 2,
        display: 'flex',
        gap: 1.5,
        alignItems: { xs: 'flex-start', sm: 'center' },
        flexDirection: { xs: 'column', sm: 'row' },
        bgcolor: (t) => alpha(t.palette.primary.main, 0.06),
        border: '1px solid',
        borderColor: (t) => alpha(t.palette.primary.main, 0.25),
      }}
    >
      <Typography variant="body2" sx={{ flex: 1, color: 'text.primary' }}>
        {text}
      </Typography>
      {trial && (
        <Button
          onClick={trial.stop}
          startIcon={<ArrowBackRoundedIcon />}
          sx={{ minHeight: 44, textTransform: 'none', flexShrink: 0 }}
        >
          Back to the quick calculator
        </Button>
      )}
    </Box>
  );
}

/**
 * Stands in for a result once the free calculations are spent. The real
 * numbers are never rendered, only a placeholder, so there is nothing to read
 * behind the blur.
 */
export function LockedResult({
  toolId,
  input,
  headline,
  benefits,
}: {
  toolId: ToolId;
  input: PendingInput;
  headline: string;
  benefits: string[];
}) {
  return (
    <Box>
      <Box
        aria-hidden="true"
        sx={{
          position: 'relative',
          p: 3,
          borderRadius: 2,
          textAlign: 'center',
          bgcolor: 'action.hover',
          overflow: 'hidden',
        }}
      >
        <Typography sx={{ fontSize: '2.5rem', fontWeight: 800, filter: 'blur(10px)', userSelect: 'none' }}>
          288.5 / 400
        </Typography>
        <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
          <LockOutlinedIcon sx={{ fontSize: 36, color: 'text.secondary' }} />
        </Box>
      </Box>
      <DemoGate toolId={toolId} headline={headline} benefits={benefits} input={input} cta="Sign in free to see it" />
    </Box>
  );
}

/** The demo's way into the full tool, shown only when a trial can be offered. */
export function TryFullToolButton({ label, input }: { label: string; input?: PendingInput | null }) {
  const trial = useToolTrial();
  if (!trial?.offered || trial.remaining <= 0) return null;
  return (
    <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 0.5, alignItems: 'flex-start' }}>
      <Button
        variant="outlined"
        onClick={() => trial.start(input)}
        sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600 }}
      >
        {label}
      </Button>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {trial.remaining} free calculation{trial.remaining === 1 ? '' : 's'} left, no sign-in needed. Adds every NATA attempt
        and last year&apos;s score.
      </Typography>
    </Box>
  );
}

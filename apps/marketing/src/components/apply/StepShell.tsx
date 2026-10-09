'use client';

import { Box, Button, CircularProgress, Typography } from '@neram/ui';
import ArrowBack from '@mui/icons-material/ArrowBack';
import ArrowForward from '@mui/icons-material/ArrowForward';
import { useTranslations } from 'next-intl';
import type { FormStep } from './types';
import StepIndicator from './StepIndicator';

export interface StepActions {
  primaryLabel: string;
  onPrimary: () => void;
  /** Saving or submitting: the button is disabled and shows a spinner. */
  busy?: boolean;
  /** Omitted on the first step, where there is nothing to go back to. */
  onBack?: () => void;
  backDisabled?: boolean;
  /** One quiet line under the button, for example "No payment needed yet". */
  note?: string;
}

interface StepShellProps {
  step: FormStep;
  children: React.ReactNode;
  /** The primary action, Back and the note. Omitted on the pay step, where the payment panel has its own button. */
  actions?: StepActions;
  /** Lets the step indicator jump back to a completed step. */
  onStepClick?: (step: FormStep) => void;
  /** A quiet extra line under the actions, for example the free demo link. */
  aside?: React.ReactNode;
}

/**
 * The form column as the Neram Apply design draws it: a mono eyebrow, the
 * four-step indicator (which carries "Step 2 of 4" for screen readers), the
 * step itself, then the action block inline under the fields on every width:
 * the wide gold button, then "Back" on the left and one quiet note.
 */
export default function StepShell({ step, children, actions, onStepClick, aside }: StepShellProps) {
  const t = useTranslations('apply');

  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: 696,
        boxSizing: 'border-box',
        px: { xs: 2, md: 6 },
        pt: { xs: 3.5, md: 6 },
        pb: { xs: 5, md: 7 },
        display: 'flex',
        flexDirection: 'column',
        gap: { xs: 3, md: 3.5 },
      }}
    >
      <Box component="header" sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Typography
          component="p"
          sx={{
            m: 0,
            fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'text.secondary',
          }}
        >
          {t('eyebrow')}
        </Typography>
        <StepIndicator step={step} onStepClick={onStepClick} />
      </Box>

      <Box>{children}</Box>

      {actions && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          <Button
            variant="contained"
            fullWidth
            onClick={actions.onPrimary}
            disabled={actions.busy}
            endIcon={actions.busy ? <CircularProgress size={18} color="inherit" /> : <ArrowForward />}
            sx={{
              minHeight: 56,
              px: 2.5,
              justifyContent: 'space-between',
              fontSize: 16,
              fontWeight: 800,
              textTransform: 'none',
              '& .MuiButton-endIcon': { ml: 2 },
            }}
          >
            {actions.primaryLabel}
          </Button>
          {(actions.onBack || actions.note) && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                columnGap: 1.5,
                flexWrap: 'wrap',
                minHeight: 44,
              }}
            >
              {actions.onBack && (
                <Button
                  variant="text"
                  color="inherit"
                  startIcon={<ArrowBack />}
                  onClick={actions.onBack}
                  disabled={actions.backDisabled}
                  sx={{ minHeight: 44, ml: -1, fontWeight: 700, textTransform: 'none' }}
                >
                  {t('actions.back')}
                </Button>
              )}
              {actions.note && (
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: 13, textAlign: actions.onBack ? 'right' : 'left' }}>
                  {actions.note}
                </Typography>
              )}
            </Box>
          )}
        </Box>
      )}

      {aside}
    </Box>
  );
}

'use client';

import { Box, Button, CircularProgress, IconButton, Typography } from '@neram/ui';
import ArrowBack from '@mui/icons-material/ArrowBack';
import ArrowForward from '@mui/icons-material/ArrowForward';
import { useTranslations } from 'next-intl';
import { STEP_COUNT, type FormStep } from './types';
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
}

/**
 * The form column: an eyebrow row ("Apply to Neram Classes" and "Step 2 of
 * 4"), the four-step indicator, the step itself, then the action block. On a
 * phone the action block is a sticky bar (Back icon + the wide gold button)
 * that rides the bottom edge while the step scrolls, then settles above the
 * legal strip; from `sm` up it is a static block with "Back" and the note
 * under the button.
 */
export default function StepShell({ step, children, actions, onStepClick }: StepShellProps) {
  const t = useTranslations('apply');
  const progressLabel = t('progress', { current: step + 1, total: STEP_COUNT });

  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: 696,
        boxSizing: 'border-box',
        px: { xs: 2, md: 6 },
        pt: { xs: 3, md: 6 },
        pb: actions ? { xs: 0, sm: 7 } : { xs: 5, md: 7 },
        display: 'flex',
        flexDirection: 'column',
        gap: { xs: 3, md: 3.5 },
      }}
    >
      <Box component="header" sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 2 }}>
          <Typography variant="caption" component="p" sx={{ m: 0, fontSize: 12, color: 'text.secondary' }}>
            {t('title')}
          </Typography>
          <Typography variant="caption" component="p" aria-live="polite" sx={{ m: 0, fontSize: 12, color: 'text.secondary', whiteSpace: 'nowrap' }}>
            {progressLabel}
          </Typography>
        </Box>
        <StepIndicator step={step} onStepClick={onStepClick} />
      </Box>

      <Box>{children}</Box>

      {actions?.note && (
        <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'block', sm: 'none' }, mt: -1 }}>
          {actions.note}
        </Typography>
      )}

      {actions && (
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'row', sm: 'column' },
            alignItems: { xs: 'center', sm: 'stretch' },
            gap: { xs: 1.5, sm: 1.75 },
            // Sticky, not fixed: it rides the bottom edge while the step
            // scrolls, then settles above the legal strip at the end.
            position: { xs: 'sticky', sm: 'static' },
            bottom: 0,
            zIndex: 10,
            mx: { xs: -2, sm: 0 },
            px: { xs: 2, sm: 0 },
            py: { xs: 1.5, sm: 0 },
            bgcolor: 'background.paper',
            borderTop: { xs: 1, sm: 0 },
            borderColor: 'divider',
            pb: { xs: 'max(12px, env(safe-area-inset-bottom))', sm: 0 },
          }}
        >
          {actions.onBack && (
            <IconButton
              aria-label={t('actions.back')}
              onClick={actions.onBack}
              disabled={actions.backDisabled}
              sx={{
                display: { xs: 'inline-flex', sm: 'none' },
                width: 56,
                height: 56,
                flex: 'none',
                border: 2,
                borderColor: 'text.primary',
                borderRadius: 1.5,
                color: 'text.primary',
              }}
            >
              <ArrowBack />
            </IconButton>
          )}
          <Button
            variant="contained"
            onClick={actions.onPrimary}
            disabled={actions.busy}
            endIcon={actions.busy ? <CircularProgress size={18} color="inherit" /> : <ArrowForward />}
            sx={{
              flex: { xs: 1, sm: 'none' },
              minHeight: 56,
              px: 2.5,
              justifyContent: 'space-between',
              fontSize: 16,
              fontWeight: 800,
              '& .MuiButton-endIcon': { ml: 2 },
            }}
          >
            {actions.primaryLabel}
          </Button>
          <Box
            sx={{
              display: { xs: 'none', sm: 'flex' },
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1.5,
              flexWrap: 'wrap',
              minHeight: 44,
            }}
          >
            {actions.onBack ? (
              <Button
                variant="text"
                color="inherit"
                startIcon={<ArrowBack />}
                onClick={actions.onBack}
                disabled={actions.backDisabled}
                sx={{ minHeight: 44, ml: -1, fontWeight: 700 }}
              >
                {t('actions.back')}
              </Button>
            ) : (
              <span />
            )}
            {actions.note && (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'right' }}>
                {actions.note}
              </Typography>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
}

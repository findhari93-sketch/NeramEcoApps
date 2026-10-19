'use client';

import { Box, Button, CircularProgress, Typography } from '@neram/ui';
import ArrowBack from '@mui/icons-material/ArrowBack';
import ArrowForward from '@mui/icons-material/ArrowForward';
import { useTranslations } from 'next-intl';
import type { FormStep } from './types';
import StepIndicator from './StepIndicator';
import { tokens as tk, eyebrowSx } from '@/design-system';
import { DESK } from './shell/density';

/** Side padding of the form column on a laptop; the sticky action bar bleeds into it. */
const DESK_GUTTER = '40px';

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
 *
 * From 900px (laptops) the column tightens: the eyebrow goes (the header
 * already says "Secure application"), and the actions become one sticky bar
 * at the bottom of the window, "Back" and the note on the left and the gold
 * button on the right, so the next step is always one click away.
 */
export default function StepShell({ step, children, actions, onStepClick, aside }: StepShellProps) {
  const t = useTranslations('apply');

  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: 720,
        boxSizing: 'border-box',
        px: 'clamp(16px, 4vw, 48px)',
        pt: 4,
        pb: 5,
        display: 'flex',
        flexDirection: 'column',
        gap: 3.5,
        [DESK]: { maxWidth: 680, px: DESK_GUTTER, pt: 'clamp(16px, 2.5vh, 32px)', pb: 4, gap: 2 },
      }}
    >
      <Box component="header" sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography component="p" sx={{ ...eyebrowSx, color: tk.gold800, [DESK]: { display: 'none' } }}>
          {t('eyebrow')}
        </Typography>
        <StepIndicator step={step} onStepClick={onStepClick} />
      </Box>

      {/* Keyboard focus scrolls a field clear of the sticky action bar, never under it. */}
      <Box sx={{ [DESK]: { '& input, & textarea, & button, & [role="button"]': { scrollMarginBottom: '96px' } } }}>{children}</Box>

      {actions && (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1.25,
            borderTop: `1px solid ${tk.line}`,
            pt: 3,
            [DESK]: {
              position: 'sticky',
              bottom: 0,
              zIndex: 2,
              flexDirection: 'row-reverse',
              alignItems: 'center',
              gap: 2,
              mx: `-${DESK_GUTTER}`,
              px: DESK_GUTTER,
              py: 1.5,
              bgcolor: tk.surface,
            },
          }}
        >
          <Button
            variant="contained"
            color="primary"
            fullWidth
            onClick={actions.onPrimary}
            disabled={actions.busy}
            endIcon={actions.busy ? <CircularProgress size={18} color="inherit" /> : <ArrowForward />}
            sx={{
              minHeight: 56,
              px: 2.5,
              [DESK]: { width: 'auto', flex: '0 0 auto', minWidth: 300, minHeight: 52 },
              justifyContent: 'space-between',
              borderRadius: `${tk.radius}px`,
              bgcolor: tk.gold500,
              color: tk.navy900,
              fontSize: 16,
              fontWeight: 800,
              textTransform: 'none',
              '&:hover': { bgcolor: tk.gold300 },
              '&.Mui-disabled': { bgcolor: tk.gold500, color: tk.navy900, opacity: 0.6 },
              '&.Mui-focusVisible': { outline: tk.focusOutline, outlineOffset: '2px' },
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
                [DESK]: { flex: 1, minWidth: 0 },
              }}
            >
              {actions.onBack && (
                <Button
                  variant="text"
                  startIcon={<ArrowBack />}
                  onClick={actions.onBack}
                  disabled={actions.backDisabled}
                  sx={{ minHeight: 44, ml: -1, px: 1, color: tk.ink, fontSize: 15, fontWeight: 700, textTransform: 'none' }}
                >
                  {t('actions.back')}
                </Button>
              )}
              {actions.note && (
                <Typography component="p" sx={{ m: 0, ml: 'auto', fontSize: 13, color: tk.inkMuted, textAlign: actions.onBack ? 'right' : 'left' }}>
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

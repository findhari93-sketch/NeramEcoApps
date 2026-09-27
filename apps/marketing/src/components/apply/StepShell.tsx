'use client';

import { Box, Container, LinearProgress, Typography } from '@neram/ui';
import { useTranslations } from 'next-intl';
import { STEP_COUNT, STEP_KEYS, type FormStep } from './types';

interface StepShellProps {
  step: FormStep;
  children: React.ReactNode;
  /** The sticky action bar (Back, Continue). Omitted on the pay step. */
  actions?: React.ReactNode;
}

/** "Step 2 of 4, Your course" plus a thin progress bar, then the step, then the actions. */
export default function StepShell({ step, children, actions }: StepShellProps) {
  const t = useTranslations('apply');
  const progress = ((step + 1) / STEP_COUNT) * 100;
  const progressLabel = t('progress', { current: step + 1, total: STEP_COUNT });

  return (
    <Container maxWidth="sm" sx={{ px: 2, pt: 2, pb: actions ? { xs: 0, sm: 4 } : 4 }}>
      <Box sx={{ mb: 2 }} aria-live="polite">
        <Typography variant="overline" color="text.secondary" component="p">
          {progressLabel} · {t(`steps.${STEP_KEYS[step]}`)}
        </Typography>
        <LinearProgress
          variant="determinate"
          value={progress}
          aria-label={progressLabel}
          sx={{
            height: 4,
            borderRadius: 2,
            mt: 0.5,
            '@media (prefers-reduced-motion: reduce)': { '& .MuiLinearProgress-bar': { transition: 'none' } },
          }}
        />
      </Box>

      <Box sx={{ bgcolor: 'background.paper', borderRadius: 2, p: { xs: 2, sm: 3 }, boxShadow: { xs: 0, sm: 1 } }}>
        {children}
      </Box>

      {actions && (
        <Box
          sx={{
            // Sticky, not fixed: it rides the bottom edge while the step
            // scrolls, then settles above the legal strip at the end.
            position: { xs: 'sticky', sm: 'static' },
            bottom: 0,
            mx: { xs: -2, sm: 0 },
            zIndex: 10,
            bgcolor: 'background.paper',
            borderTop: { xs: 1, sm: 0 },
            borderColor: 'divider',
            px: 2,
            py: 1.5,
            mt: { sm: 3 },
            pb: { xs: 'max(12px, env(safe-area-inset-bottom))', sm: 0 },
          }}
        >
          <Container maxWidth="sm" sx={{ px: 0, display: 'flex', gap: 1.5, justifyContent: 'space-between' }}>
            {actions}
          </Container>
        </Box>
      )}
    </Container>
  );
}

'use client';

import { Box, LinearProgress, Step, StepLabel, Stepper, Typography, useMediaQuery, useTheme } from '@neram/ui';
import { WIZARD_STEPS, type WizardStep } from '@/lib/test-wizard-draft';

const LABELS: Record<WizardStep, string> = {
  source: 'Source',
  generate: 'Generate',
  review: 'Review',
  place: 'Place',
};

/**
 * 1 Source, 2 Generate, 3 Review, 4 Place.
 *
 * Below sm the four-dot rail is replaced by one honest line plus a four-segment
 * bar. A Stepper squeezed into 375px produces four unreadable labels and a
 * horizontal scrollbar, and the thing a teacher actually needs there is "how
 * much of this is left", which a bar answers better than dots.
 */
export default function WizardStepper({ step }: { step: WizardStep }) {
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down('sm'));
  const index = WIZARD_STEPS.indexOf(step);

  if (compact) {
    return (
      <Box sx={{ mb: 2 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
          Step {index + 1} of {WIZARD_STEPS.length} · {LABELS[step]}
        </Typography>
        <LinearProgress
          variant="determinate"
          value={((index + 1) / WIZARD_STEPS.length) * 100}
          sx={{ mt: 0.75, height: 3, borderRadius: 999 }}
          aria-label={`Step ${index + 1} of ${WIZARD_STEPS.length}`}
        />
      </Box>
    );
  }

  return (
    <Stepper activeStep={index} alternativeLabel sx={{ mb: 3 }}>
      {WIZARD_STEPS.map((s) => (
        <Step key={s}>
          <StepLabel>{LABELS[s]}</StepLabel>
        </Step>
      ))}
    </Stepper>
  );
}

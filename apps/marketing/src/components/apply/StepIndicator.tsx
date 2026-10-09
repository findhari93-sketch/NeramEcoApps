'use client';

import { Box, Typography } from '@neram/ui';
import { useTranslations } from 'next-intl';
import { STEP_COUNT, STEP_KEYS, type FormStep } from './types';

interface StepIndicatorProps {
  step: FormStep;
  /** Called with a completed step when the applicant taps it. Omit to make the indicator read-only. */
  onStepClick?: (step: FormStep) => void;
}

/**
 * Four columns, one per step: a 4 px bar (gold now, ink done, pale to come)
 * over "01 About you", every label shown even on a phone. Done steps are
 * buttons so an applicant can go back to fix something; nothing is clickable
 * on the pay step, where the application
 * has already been written and "Change details" is the way back.
 */
export default function StepIndicator({ step, onStepClick }: StepIndicatorProps) {
  const t = useTranslations('apply');
  const locked = step === 3;

  return (
    <Box
      component="ol"
      aria-label={t('progress', { current: step + 1, total: STEP_COUNT })}
      sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', columnGap: 1 }}
    >
      {STEP_KEYS.map((key, index) => {
        const done = index < step;
        const active = index === step;
        const clickable = done && !locked && !!onStepClick;
        return (
          <Box component="li" key={key} sx={{ minWidth: 0 }}>
            <Box
              component="button"
              type="button"
              disabled={!clickable}
              aria-current={active ? 'step' : undefined}
              onClick={() => clickable && onStepClick?.(index as FormStep)}
              sx={{
                all: 'unset',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                width: '100%',
                minHeight: 44,
                pt: 0.5,
                cursor: clickable ? 'pointer' : 'default',
                color: active || done ? 'text.primary' : 'text.secondary',
                '&:hover': clickable ? { color: 'primary.dark' } : undefined,
                '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
              }}
            >
              <Box
                sx={{
                  height: 4,
                  bgcolor: active ? 'primary.main' : done ? 'text.primary' : '#e4e1da',
                  transition: 'background-color 200ms',
                  '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                }}
              />
              <Typography
                component="span"
                sx={{
                  display: 'flex',
                  gap: 0.75,
                  alignItems: 'baseline',
                  fontSize: 12,
                  fontWeight: 700,
                  lineHeight: 1.2,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                <Box component="span" sx={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', flexShrink: 0 }}>
                  {`0${index + 1}`}
                </Box>
                <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t(`stepsShort.${key}`)}
                </Box>
              </Typography>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

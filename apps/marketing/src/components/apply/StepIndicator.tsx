'use client';

import { Box, Typography } from '@neram/ui';
import { useTranslations } from 'next-intl';
import { tokens as tk } from '@/design-system';
import { STEP_COUNT, STEP_KEYS, type FormStep } from './types';
import { DESK } from './shell/density';

interface StepIndicatorProps {
  step: FormStep;
  /** Called with a completed step when the applicant taps it. Omit to make the indicator read-only. */
  onStepClick?: (step: FormStep) => void;
}

/**
 * Four columns, one per step: a 4 px bar (gold done and current, line to come)
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
      sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', columnGap: { xs: 0.75, sm: 1 } }}
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
                [DESK]: { gap: 0.75 },
                pt: 0.5,
                cursor: clickable ? 'pointer' : 'default',
                color: active || done ? tk.ink : tk.inkMuted,
                '&:hover': clickable ? { color: tk.gold800 } : undefined,
                '&:focus-visible': { outline: tk.focusOutline, outlineOffset: '2px' },
              }}
            >
              <Box
                sx={{
                  height: 4,
                  [DESK]: { height: 3 },
                  borderRadius: '2px',
                  bgcolor: active || done ? tk.gold500 : tk.line,
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
                  fontSize: { xs: 13, sm: 14 },
                  [DESK]: { fontSize: 13 },
                  fontWeight: active ? 700 : 600,
                  lineHeight: 1.2,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                <Box component="span" sx={{ fontFamily: tk.fontMono, fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
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

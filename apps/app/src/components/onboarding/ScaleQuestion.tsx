'use client';

/**
 * ScaleQuestion - Emoji/number scale selector (1-10)
 * Large tap targets for mobile, visual feedback on selection.
 */

import { Box, Typography, Slider } from '@neram/ui';
import type { OnboardingScaleOptions } from '@neram/database';

interface ScaleQuestionProps {
  options: OnboardingScaleOptions;
  value?: number;
  onChange: (value: number) => void;
}

export function ScaleQuestion({ options, value, onChange }: ScaleQuestionProps) {
  const { min, max, min_label, max_label } = options;

  return (
    <Box sx={{ px: { xs: 1, sm: 2 }, py: 2 }}>
      {/* Current value display */}
      <Box sx={{ textAlign: 'center', mb: 3 }}>
        <Typography
          variant="h2"
          fontWeight="bold"
          color="primary"
          sx={{ fontSize: { xs: '3rem', sm: '4rem' }, lineHeight: 1 }}
        >
          {value ?? '—'}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {value !== undefined ? getEmoji(value, max) : 'Drag to select'}
        </Typography>
      </Box>

      {/* Slider */}
      <Slider
        value={value ?? Math.floor((min + max) / 2)}
        min={min}
        max={max}
        step={1}
        marks
        onChange={(_, newValue) => onChange(newValue as number)}
        sx={{
          height: 8,
          '& .MuiSlider-thumb': {
            width: 32,
            height: 32,
          },
          '& .MuiSlider-mark': {
            width: 4,
            height: 4,
            borderRadius: '50%',
          },
        }}
      />

      {/* Labels */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ maxWidth: '40%' }}>
          {min_label}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ maxWidth: '40%', textAlign: 'right' }}>
          {max_label}
        </Typography>
      </Box>
    </Box>
  );
}

function getEmoji(value: number, max: number): string {
  const ratio = value / max;
  if (ratio <= 0.2) return 'Just checking things out';
  if (ratio <= 0.4) return 'Getting curious';
  if (ratio <= 0.6) return 'Interested!';
  if (ratio <= 0.8) return 'Very motivated!';
  return 'This is my dream!';
}

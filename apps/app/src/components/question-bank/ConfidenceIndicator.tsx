'use client';

import { Chip } from '@neram/ui';

const CONFIDENCE_LABELS: Record<number, { label: string; color: 'error' | 'warning' | 'default' | 'info' | 'success' }> = {
  1: { label: 'I may be wrong', color: 'error' },
  2: { label: 'Not very sure', color: 'warning' },
  3: { label: 'Somewhat confident', color: 'default' },
  4: { label: 'Fairly confident', color: 'info' },
  5: { label: 'Very sure', color: 'success' },
};

interface ConfidenceIndicatorProps {
  level: number;
  size?: 'small' | 'medium';
}

export default function ConfidenceIndicator({ level, size = 'small' }: ConfidenceIndicatorProps) {
  const config = CONFIDENCE_LABELS[level] || CONFIDENCE_LABELS[3];

  return (
    <Chip
      label={config.label}
      size={size}
      color={config.color}
      variant="outlined"
      sx={{
        height: size === 'small' ? 22 : 28,
        fontSize: size === 'small' ? '0.7rem' : '0.8rem',
      }}
    />
  );
}

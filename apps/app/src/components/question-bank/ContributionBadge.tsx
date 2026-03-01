'use client';

import { Chip } from '@neram/ui';

interface ContributionBadgeProps {
  score: number;
  size?: 'small' | 'medium';
}

const LEVELS = [
  { min: 0, label: 'New', color: 'default' as const },
  { min: 5, label: 'Contributor', color: 'info' as const },
  { min: 15, label: 'Active', color: 'primary' as const },
  { min: 30, label: 'Top Contributor', color: 'success' as const },
  { min: 50, label: 'Expert', color: 'warning' as const },
];

export default function ContributionBadge({ score, size = 'small' }: ContributionBadgeProps) {
  if (score < 5) return null; // Don't show badge for new users

  const level = [...LEVELS].reverse().find((l) => score >= l.min) || LEVELS[0];

  return (
    <Chip
      label={level.label}
      size={size}
      color={level.color}
      variant="outlined"
      sx={{
        height: size === 'small' ? 20 : 24,
        fontSize: size === 'small' ? '0.65rem' : '0.75rem',
        fontWeight: 600,
      }}
    />
  );
}

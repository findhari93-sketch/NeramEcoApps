'use client';

import { Chip } from '@neram/ui';
import type { QBDifficulty } from '@neram/database';
import { QB_DIFFICULTY_COLORS } from '@neram/database';

interface DifficultyChipProps {
  difficulty: QBDifficulty;
  size?: 'small' | 'medium';
}

const DIFFICULTY_LABELS: Record<QBDifficulty, string> = {
  EASY: 'Easy',
  MEDIUM: 'Medium',
  HARD: 'Hard',
};

export default function DifficultyChip({ difficulty, size = 'small' }: DifficultyChipProps) {
  return (
    <Chip
      label={DIFFICULTY_LABELS[difficulty]}
      size={size}
      sx={{
        bgcolor: QB_DIFFICULTY_COLORS[difficulty],
        color: '#fff',
        fontWeight: 600,
        fontSize: size === 'small' ? '0.7rem' : '0.8rem',
        height: size === 'small' ? 24 : 32,
      }}
    />
  );
}

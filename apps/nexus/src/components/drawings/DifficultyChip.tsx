'use client';

import { Chip } from '@neram/ui';

const DIFFICULTY_CONFIG: Record<string, { color: string; bg: string }> = {
  easy: { color: '#2e7d32', bg: '#e8f5e9' },
  medium: { color: '#e65100', bg: '#fff3e0' },
  hard: { color: '#c62828', bg: '#ffebee' },
};

export default function DifficultyChip({ difficulty }: { difficulty: string }) {
  const config = DIFFICULTY_CONFIG[difficulty] || { color: '#666', bg: '#f5f5f5' };
  return (
    <Chip
      label={difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
      size="small"
      sx={{
        color: config.color,
        bgcolor: config.bg,
        fontWeight: 500,
        fontSize: '0.7rem',
        height: 22,
      }}
    />
  );
}

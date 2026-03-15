'use client';

import { Chip, Box, useTheme } from '@neram/ui';
import { QB_CATEGORY_LABELS } from '@neram/database/src/types';
import type { QBCategory } from '@neram/database/src/types';

interface CategoryChipsProps {
  categories: string[];
  size?: 'small' | 'medium';
}

const CATEGORY_COLORS: Record<string, number> = {
  mathematics: 0,
  history_of_architecture: 1,
  general_knowledge: 2,
  aptitude: 3,
  drawing: 4,
  puzzle: 5,
  perspective: 6,
  building_materials: 7,
  building_services: 8,
  planning: 9,
  sustainability: 10,
  famous_architects: 11,
  current_affairs: 12,
  visualization_3d: 13,
};

export default function CategoryChips({ categories, size = 'small' }: CategoryChipsProps) {
  const theme = useTheme();

  const palette = [
    theme.palette.primary.main,
    theme.palette.secondary.main,
    theme.palette.info.main,
    theme.palette.success.main,
    theme.palette.warning.main,
    '#8B5CF6',
    '#EC4899',
    '#06B6D4',
    '#84CC16',
    '#F97316',
    '#14B8A6',
    '#6366F1',
    '#EF4444',
    '#0EA5E9',
  ];

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
      {categories.map((cat) => {
        const label = QB_CATEGORY_LABELS[cat as QBCategory] ?? cat;
        const colorIdx = CATEGORY_COLORS[cat] ?? 0;
        const color = palette[colorIdx % palette.length];
        return (
          <Chip
            key={cat}
            label={label}
            size={size}
            variant="filled"
            sx={{
              bgcolor: color,
              color: '#fff',
              fontWeight: 500,
              fontSize: size === 'small' ? '0.65rem' : '0.75rem',
              height: size === 'small' ? 22 : 28,
            }}
          />
        );
      })}
    </Box>
  );
}

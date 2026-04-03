'use client';

import { Chip, Box, useTheme } from '@neram/ui';
import { QB_CATEGORY_LABELS } from '@neram/database';
import type { QBCategory } from '@neram/database';

interface CategoryChipsProps {
  categories: string[];
  size?: 'small' | 'medium';
  onCategoryClick?: (category: string) => void;
}

const CATEGORY_COLORS: Record<string, number> = {
  // Broad
  mathematics: 0,
  aptitude: 3,
  drawing: 4,
  // NATA
  history_of_architecture: 1,
  general_knowledge: 2,
  puzzle: 5,
  perspective: 6,
  building_materials: 7,
  building_services: 8,
  planning: 9,
  sustainability: 10,
  famous_architects: 11,
  current_affairs: 12,
  visualization_3d: 13,
  // JEE Aptitude
  spatial_visualization: 5,
  orthographic_projection: 6,
  pattern_recognition: 8,
  analogy: 9,
  counting_figures: 10,
  odd_one_out: 11,
  surface_counting: 12,
  mirror_image: 13,
  embedded_figure: 1,
  architecture_gk: 2,
  building_science: 7,
  design_fundamentals: 14,
  // JEE Mathematics
  trigonometry: 1,
  probability: 2,
  statistics: 5,
  matrices: 6,
  determinants: 7,
  complex_numbers: 8,
  vectors: 9,
  '3d_geometry': 10,
  conic_sections: 11,
  circles: 12,
  straight_lines: 13,
  sequences_and_series: 14,
  binomial_theorem: 15,
  permutations_combinations: 1,
  definite_integrals: 2,
  indefinite_integrals: 5,
  differential_equations: 6,
  applications_of_derivatives: 7,
  differentiability: 8,
  continuity: 9,
  mean_value_theorems: 10,
  quadratic_equations: 11,
  functions: 12,
  sets_and_relations: 13,
  mathematical_logic: 14,
};

export default function CategoryChips({ categories, size = 'small', onCategoryClick }: CategoryChipsProps) {
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
    '#D946EF',
    '#059669',
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
            onClick={onCategoryClick ? (e) => { e.stopPropagation(); onCategoryClick(cat); } : undefined}
            sx={{
              bgcolor: color,
              color: '#fff',
              fontWeight: 500,
              fontSize: size === 'small' ? '0.65rem' : '0.75rem',
              height: size === 'small' ? 22 : 28,
              cursor: onCategoryClick ? 'pointer' : 'default',
              '&:hover': onCategoryClick ? { opacity: 0.85 } : {},
            }}
          />
        );
      })}
    </Box>
  );
}

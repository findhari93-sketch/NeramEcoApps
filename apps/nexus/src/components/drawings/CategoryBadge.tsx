'use client';

import { Chip } from '@neram/ui';

const CATEGORY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  '2d_composition': { label: '2D', color: '#1565c0', bg: '#e3f2fd' },
  '3d_composition': { label: '3D', color: '#2e7d32', bg: '#e8f5e9' },
  'kit_sculpture': { label: 'Kit', color: '#6a1b9a', bg: '#f3e5f5' },
};

export default function CategoryBadge({ category }: { category: string }) {
  const config = CATEGORY_CONFIG[category] || { label: category, color: '#666', bg: '#f5f5f5' };
  return (
    <Chip
      label={config.label}
      size="small"
      sx={{
        color: config.color,
        bgcolor: config.bg,
        fontWeight: 600,
        fontSize: '0.7rem',
        height: 22,
      }}
    />
  );
}

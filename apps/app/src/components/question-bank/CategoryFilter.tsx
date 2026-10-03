'use client';

import { Stack, Chip } from '@neram/ui';

const CATEGORIES = [
  { value: '', label: 'All' },
  { value: 'mathematics', label: 'Mathematics' },
  { value: 'general_aptitude', label: 'General Aptitude' },
  { value: 'drawing', label: 'Drawing' },
  { value: 'logical_reasoning', label: 'Logical Reasoning' },
  { value: 'aesthetic_sensitivity', label: 'Aesthetic Sensitivity' },
  { value: 'other', label: 'Other' },
];

/** Valid category values (including '' for All), for validating URL params */
export const QB_CATEGORY_VALUES: string[] = CATEGORIES.map((c) => c.value);

interface CategoryFilterProps {
  selected: string;
  onChange: (category: string) => void;
}

export default function CategoryFilter({ selected, onChange }: CategoryFilterProps) {
  return (
    <Stack
      direction="row"
      spacing={1}
      role="group"
      aria-label="Filter by category"
      sx={{
        // Scrolls inside its own row on phones; the page never scrolls sideways
        overflowX: 'auto',
        py: 0.5,
        px: 0.25,
        scrollbarWidth: 'none',
        '&::-webkit-scrollbar': { display: 'none' },
      }}
    >
      {CATEGORIES.map((cat) => {
        const isSelected = selected === cat.value;
        return (
          <Chip
            key={cat.value}
            label={cat.label}
            color={isSelected ? 'primary' : 'default'}
            variant={isSelected ? 'filled' : 'outlined'}
            onClick={() => onChange(cat.value)}
            aria-pressed={isSelected}
            sx={{ whiteSpace: 'nowrap', height: 44, px: 0.5, fontSize: '0.875rem', flexShrink: 0 }}
          />
        );
      })}
    </Stack>
  );
}

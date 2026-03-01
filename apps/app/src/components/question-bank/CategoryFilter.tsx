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

interface CategoryFilterProps {
  selected: string;
  onChange: (category: string) => void;
}

export default function CategoryFilter({ selected, onChange }: CategoryFilterProps) {
  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{
        overflowX: 'auto',
        pb: 1,
        '&::-webkit-scrollbar': { display: 'none' },
      }}
    >
      {CATEGORIES.map((cat) => (
        <Chip
          key={cat.value}
          label={cat.label}
          size="small"
          color={selected === cat.value ? 'primary' : 'default'}
          variant={selected === cat.value ? 'filled' : 'outlined'}
          onClick={() => onChange(cat.value)}
          sx={{ whiteSpace: 'nowrap', minHeight: 32 }}
        />
      ))}
    </Stack>
  );
}

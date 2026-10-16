'use client';

import { Box, ToggleButton, ToggleButtonGroup, Typography } from '@neram/ui';
import { tokens as t } from '@/design-system';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  id: string;
  label: string;
  value: T | '';
  options: SegmentedOption<T>[];
  onChange: (value: T | '') => void;
  /** When false, tapping the selected cell clears it (for optional answers). */
  required?: boolean;
}

/**
 * Separate 48px pills on an auto-fit grid (min 120px), navy fill when
 * selected: the design's control for short single-choice answers ("I'm
 * currently in", Gender). The pill look comes from the apply theme.
 */
export default function Segmented<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
  required = false,
}: SegmentedProps<T>) {
  const labelId = `${id}-label`;
  return (
    <Box>
      <Typography id={labelId} component="p" sx={{ m: 0, mb: 1, fontSize: 15, fontWeight: 600, lineHeight: 1.35, color: t.ink }}>
        {label}
      </Typography>
      <ToggleButtonGroup
        exclusive
        aria-labelledby={labelId}
        sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 1 }}
        value={value || null}
        onChange={(_, next: T | null) => {
          if (next === null && required) return;
          onChange(next ?? '');
        }}
      >
        {options.map((option) => (
          <ToggleButton key={option.value} value={option.value} sx={{ px: 1.5 }}>
            {option.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Box>
  );
}

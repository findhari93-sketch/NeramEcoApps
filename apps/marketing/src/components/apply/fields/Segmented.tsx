'use client';

import { Box, ToggleButton, ToggleButtonGroup, Typography } from '@neram/ui';

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
 * One row of square cells with an ink selected state, the design's control
 * for short single-choice answers ("I'm currently in", Gender).
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
      <Typography id={labelId} component="p" sx={{ m: 0, mb: 1, fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>
        {label}
      </Typography>
      <ToggleButtonGroup
        exclusive
        fullWidth
        aria-labelledby={labelId}
        value={value || null}
        onChange={(_, next: T | null) => {
          if (next === null && required) return;
          onChange(next ?? '');
        }}
      >
        {options.map((option) => (
          <ToggleButton key={option.value} value={option.value} sx={{ px: 1, lineHeight: 1.2 }}>
            {option.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Box>
  );
}

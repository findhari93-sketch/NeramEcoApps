'use client';

import { ToggleButton, ToggleButtonGroup } from '@neram/ui';

interface PeriodToggleProps {
  value: string;
  onChange: (period: string) => void;
}

const PERIODS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'all', label: 'All' },
];

export default function PeriodToggle({ value, onChange }: PeriodToggleProps) {
  return (
    <ToggleButtonGroup
      value={value}
      exclusive
      onChange={(_, val) => {
        if (val) onChange(val);
      }}
      size="small"
      sx={{
        width: '100%',
        '& .MuiToggleButton-root': {
          flex: 1,
          textTransform: 'none',
          fontWeight: 600,
          fontSize: '0.75rem',
          py: 0.75,
          borderRadius: '8px !important',
          border: '1px solid',
          borderColor: 'divider',
          '&.Mui-selected': {
            bgcolor: 'primary.main',
            color: '#fff',
            '&:hover': { bgcolor: 'primary.dark' },
          },
        },
      }}
    >
      {PERIODS.map((p) => (
        <ToggleButton key={p.value} value={p.value}>
          {p.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

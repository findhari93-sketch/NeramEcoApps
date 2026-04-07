'use client';

import { ToggleButton, ToggleButtonGroup } from '@neram/ui';
import RouteOutlinedIcon from '@mui/icons-material/RouteOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';

interface ViewSegmentControlProps {
  value: 'journey' | 'schedule';
  onChange: (v: 'journey' | 'schedule') => void;
}

export default function ViewSegmentControl({ value, onChange }: ViewSegmentControlProps) {
  return (
    <ToggleButtonGroup
      value={value}
      exclusive
      onChange={(_, v) => { if (v) onChange(v); }}
      fullWidth
      sx={{
        '& .MuiToggleButton-root': {
          textTransform: 'none',
          fontWeight: 600,
          py: 1,
          gap: 0.75,
          fontSize: '0.85rem',
        },
      }}
    >
      <ToggleButton value="journey">
        <RouteOutlinedIcon sx={{ fontSize: '1.1rem' }} />
        My Journey
      </ToggleButton>
      <ToggleButton value="schedule">
        <PeopleOutlinedIcon sx={{ fontSize: '1.1rem' }} />
        Classroom
      </ToggleButton>
    </ToggleButtonGroup>
  );
}

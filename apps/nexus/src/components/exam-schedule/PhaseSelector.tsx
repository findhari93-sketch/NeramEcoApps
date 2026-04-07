'use client';

import { ToggleButton, ToggleButtonGroup, Typography, Box } from '@neram/ui';

interface PhaseSelectorProps {
  phase: string;
  onChange: (phase: string) => void;
}

export default function PhaseSelector({ phase, onChange }: PhaseSelectorProps) {
  return (
    <ToggleButtonGroup
      value={phase}
      exclusive
      onChange={(_, v) => { if (v) onChange(v); }}
      size="small"
      sx={{ '& .MuiToggleButton-root': { textTransform: 'none', px: 2, py: 0.5, minHeight: 36 } }}
    >
      <ToggleButton value="phase_1">
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="body2" fontWeight={600} lineHeight={1.2}>Phase 1</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>Apr - Jun</Typography>
        </Box>
      </ToggleButton>
      <ToggleButton value="phase_2">
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="body2" fontWeight={600} lineHeight={1.2}>Phase 2</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>Aug 7-8</Typography>
        </Box>
      </ToggleButton>
    </ToggleButtonGroup>
  );
}

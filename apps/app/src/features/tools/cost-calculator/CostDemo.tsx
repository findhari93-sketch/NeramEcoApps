'use client';

import { useState } from 'react';
import { Box, MenuItem, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@neram/ui';
import DemoGate from '@/components/tools/DemoGate';
import { NATA_FEES, NATA_FEE_YEAR } from '@/lib/tools/nata-fees';

/** Test cities for a state: in-state ones, or the nearest to its capital with km. */
export type DemoStateCentres = Record<string, Array<{ label: string; km: number | null }>>;

interface Props {
  states: Array<{ slug: string; name: string }>;
  centresByState: DemoStateCentres;
  initialState?: string;
}

const rupees = (n: number) => `Rs ${n.toLocaleString('en-IN')}`;

/**
 * Public demo: category and attempts give the exact NATA fee; the state shows
 * where the test cities are. Signed in: travel, stay and materials plan.
 */
export default function CostDemo({ states, centresByState, initialState = '' }: Props) {
  const categories = Object.keys(NATA_FEES);
  const [category, setCategory] = useState(categories[0]);
  const [attempts, setAttempts] = useState(1);
  const [state, setState] = useState(initialState);
  const fee = (NATA_FEES[category] ?? 0) * attempts;
  const centres = state ? centresByState[state] ?? [] : [];
  const fieldSx = { '& .MuiInputBase-root': { minHeight: 48 } };

  return (
    <Box>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
        <TextField select label="Category" value={category} onChange={(e) => setCategory(e.target.value)} sx={fieldSx}>
          {categories.map((c) => (
            <MenuItem key={c} value={c} sx={{ minHeight: 44 }}>
              {c}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Your state"
          value={state}
          onChange={(e) => setState(e.target.value)}
          sx={fieldSx}
          SelectProps={{ MenuProps: { PaperProps: { sx: { maxHeight: 360 } } } }}
        >
          {states.map((s) => (
            <MenuItem key={s.slug} value={s.slug} sx={{ minHeight: 44 }}>
              {s.name}
            </MenuItem>
          ))}
        </TextField>
      </Box>
      <Box sx={{ mt: 2 }}>
        <Typography id="attempts-label" variant="body2" sx={{ mb: 0.75, fontWeight: 600 }}>
          Attempts
        </Typography>
        <ToggleButtonGroup
          exclusive
          value={attempts}
          onChange={(_, v) => v && setAttempts(v)}
          aria-labelledby="attempts-label"
          sx={{ '& .MuiToggleButton-root': { minHeight: 44, minWidth: 64, textTransform: 'none' } }}
        >
          <ToggleButton value={1}>1</ToggleButton>
          <ToggleButton value={2}>2</ToggleButton>
          <ToggleButton value={3}>3</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Box aria-live="polite" sx={{ mt: 2, p: 2, borderRadius: 2.5, bgcolor: 'action.hover', minHeight: 96 }}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          NATA application fee ({NATA_FEE_YEAR} rates)
        </Typography>
        <Typography component="p" sx={{ fontSize: '2rem', fontWeight: 800, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>
          {rupees(fee)}
        </Typography>
        <Typography variant="body2">
          {rupees(NATA_FEES[category] ?? 0)} per attempt x {attempts}
        </Typography>
        {state && (
          <Typography variant="body2" sx={{ mt: 1 }}>
            {centres.length > 0 && centres[0].km == null
              ? `Test cities in your state: ${centres.map((c) => c.label).join(', ')}.`
              : centres.length > 0
                ? `No test city in your state. Nearest: ${centres.map((c) => `${c.label} (${c.km} km)`).join(', ')}.`
                : 'Test city data is not available for this state.'}
          </Typography>
        )}
      </Box>

      <DemoGate
        toolId="nata-cost-calculator"
        headline="Add travel, stay and materials"
        benefits={['A full budget for your test city', 'Several attempts side by side', 'Saved to your account']}
        cta="Sign in free to plan it all"
        input={{ category, attempts, state }}
      />
    </Box>
  );
}

'use client';

import { useState } from 'react';
import { Box, MenuItem, TextField, Typography } from '@neram/ui';
import DemoGate from '@/components/tools/DemoGate';

/** [from mark, to mark, best rank, worst rank] */
export type DemoBand = [number, number, number, number];

export interface DemoRankSystem {
  code: string;
  label: string;
  year: number;
  total: number;
  bands: DemoBand[];
}

function bandFor(bands: DemoBand[], mark: number): DemoBand | null {
  if (bands.length === 0) return null;
  return bands.find((b) => mark >= b[0] && mark < b[1]) ?? (mark >= bands[0][1] ? bands[0] : bands[bands.length - 1]);
}

/**
 * Public demo: your cutoff out of 400 gives the rank range students with that
 * mark got last year. Signed in: a closer estimate, community rank, trend.
 */
export default function RankDemo({ systems, initialSystem }: { systems: DemoRankSystem[]; initialSystem?: string }) {
  const [code, setCode] = useState(initialSystem && systems.some((s) => s.code === initialSystem) ? initialSystem : systems[0]?.code ?? '');
  const [mark, setMark] = useState('');
  const sys = systems.find((s) => s.code === code);
  const m = parseFloat(mark);
  const valid = Number.isFinite(m) && m > 0 && m <= 400;
  const band = sys && valid ? bandFor(sys.bands, m) : null;

  if (!sys) return <Typography>No rank list is available right now.</Typography>;

  return (
    <Box>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
        <TextField select label="Counselling" value={code} onChange={(e) => setCode(e.target.value)} sx={{ '& .MuiInputBase-root': { minHeight: 48 } }}>
          {systems.map((s) => (
            <MenuItem key={s.code} value={s.code} sx={{ minHeight: 44 }}>
              {s.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Your cutoff out of 400"
          value={mark}
          onChange={(e) => setMark(e.target.value.replace(/[^\d.]/g, ''))}
          inputProps={{ inputMode: 'decimal' }}
          error={mark !== '' && !valid}
          helperText={mark !== '' && !valid ? 'Enter a mark from 1 to 400' : `${sys.label} ${sys.year} rank list, ${sys.total.toLocaleString('en-IN')} students`}
          sx={{ '& .MuiInputBase-root': { minHeight: 48 } }}
        />
      </Box>
      <Box aria-live="polite" sx={{ mt: 2, minHeight: 96 }}>
        {band ? (
          <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: 'action.hover' }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Students with {band[0]} to {band[1]} marks in {sys.year} ranked
            </Typography>
            <Typography component="p" sx={{ fontSize: '1.75rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
              {band[2].toLocaleString('en-IN')} to {band[3].toLocaleString('en-IN')}
            </Typography>
            <Typography variant="body2">out of {sys.total.toLocaleString('en-IN')} on the rank list</Typography>
          </Box>
        ) : (
          <Typography variant="body2" sx={{ color: 'text.secondary', p: 2, borderRadius: 2.5, border: '1px dashed', borderColor: 'divider' }}>
            Enter your cutoff to see the rank range for that mark.
          </Typography>
        )}
      </Box>
      {band && (
        <DemoGate
          toolId="counseling-rank-predictor"
          headline="Get a closer rank and your community rank"
          benefits={['A closer estimate than the 10-mark range', 'Your community rank', 'How the same mark ranked in other years']}
          input={{ system: code, mark: m }}
        />
      )}
    </Box>
  );
}

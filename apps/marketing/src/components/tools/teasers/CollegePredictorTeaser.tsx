'use client';

import { useState } from 'react';
import { FormControl, InputLabel, MenuItem, Select, TextField } from '@neram/ui';
import { CtaButton, QuickCheck, QuickCheckResult } from '@/design-system';

const FULL_TOOL = 'https://app.neramclasses.com/tools/counseling/college-predictor';

const STATES = [
  'All India',
  'Tamil Nadu',
  'Karnataka',
  'Maharashtra',
  'Delhi',
  'Kerala',
  'Telangana',
  'Uttar Pradesh',
  'West Bengal',
  'Rajasthan',
  'Gujarat',
];

// Approximate college counts by score range per state
const COLLEGES_DATA: Record<
  string,
  { above150: number; s120to150: number; s90to120: number; s60to90: number; below60: number }
> = {
  'All India': { above150: 15, s120to150: 45, s90to120: 120, s60to90: 200, below60: 130 },
  'Tamil Nadu': { above150: 2, s120to150: 5, s90to120: 15, s60to90: 18, below60: 5 },
  'Karnataka': { above150: 1, s120to150: 3, s90to120: 8, s60to90: 10, below60: 3 },
  'Maharashtra': { above150: 2, s120to150: 5, s90to120: 12, s60to90: 15, below60: 5 },
  'Delhi': { above150: 2, s120to150: 3, s90to120: 3, s60to90: 2, below60: 0 },
  'Kerala': { above150: 0, s120to150: 2, s90to120: 5, s60to90: 5, below60: 2 },
  'Telangana': { above150: 0, s120to150: 1, s90to120: 4, s60to90: 5, below60: 2 },
  'Uttar Pradesh': { above150: 1, s120to150: 2, s90to120: 6, s60to90: 8, below60: 3 },
  'West Bengal': { above150: 1, s120to150: 2, s90to120: 3, s60to90: 4, below60: 1 },
  'Rajasthan': { above150: 0, s120to150: 1, s90to120: 3, s60to90: 3, below60: 1 },
  'Gujarat': { above150: 1, s120to150: 2, s90to120: 4, s60to90: 5, below60: 2 },
};

function getCollegeCount(score: number, state: string): number {
  const data = COLLEGES_DATA[state] ?? COLLEGES_DATA['All India'];
  let count = 0;
  if (score >= 150) count += data.above150;
  if (score >= 120) count += data.s120to150;
  if (score >= 90) count += data.s90to120;
  if (score >= 60) count += data.s60to90;
  count += data.below60;
  return count;
}

const fieldSx = { '& .MuiInputBase-root': { minHeight: 48 }, '& input': { fontSize: '1rem' } } as const;

export default function CollegePredictorTeaser() {
  const [score, setScore] = useState('');
  const [state, setState] = useState('All India');
  const [result, setResult] = useState<{ count: number; state: string } | null>(null);
  const [error, setError] = useState('');

  function handleCheck() {
    const parsed = Number(score);
    if (!score || isNaN(parsed) || parsed < 0 || parsed > 200) {
      setError('Please enter a valid score between 0 and 200.');
      setResult(null);
      return;
    }
    setError('');
    const count = getCollegeCount(parsed, state);
    setResult({ count, state });
  }

  return (
    <QuickCheck title="Quick college check" headingId="college-predictor-quick-check">
      <TextField
        label="Your NATA Score (0 to 200)"
        type="number"
        value={score}
        onChange={(e) => {
          setScore(e.target.value);
          setError('');
          setResult(null);
        }}
        inputProps={{ min: 0, max: 200, inputMode: 'numeric' }}
        fullWidth
        error={!!error}
        helperText={error}
        sx={fieldSx}
      />

      <FormControl fullWidth>
        <InputLabel id="college-predictor-state-label">State</InputLabel>
        <Select
          labelId="college-predictor-state-label"
          value={state}
          label="State"
          onChange={(e) => {
            setState(e.target.value as string);
            setResult(null);
          }}
          sx={{ minHeight: 48, fontSize: '1rem' }}
        >
          {STATES.map((s) => (
            <MenuItem key={s} value={s}>
              {s}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <CtaButton variant="navy" fullWidth onClick={handleCheck} endIcon={null}>
        Check
      </CtaButton>

      {result ? (
        <QuickCheckResult value={result.count} label="Colleges match your score" summary={`In ${result.state}`} />
      ) : (
        <QuickCheckResult label="Colleges that match your score" summary="Enter your score and tap Check" />
      )}

      <CtaButton href={FULL_TOOL} external fullWidth>
        View full college list with fees and cutoffs
      </CtaButton>
    </QuickCheck>
  );
}

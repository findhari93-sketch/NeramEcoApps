'use client';

import { useState } from 'react';
import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TextField,
  Typography,
} from '@neram/ui';
import Link from 'next/link';

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
    <Paper
      elevation={0}
      sx={{
        p: { xs: 3, sm: 4 },
        border: '1px solid #E0E0E0',
        borderRadius: 2,
      }}
    >
      <Typography
        component="h2"
        sx={{ fontWeight: 700, fontSize: { xs: '1.25rem', sm: '1.5rem' }, mb: 2 }}
      >
        Quick College Check
      </Typography>

      <TextField
        label="Your NATA Score (0 to 200)"
        type="number"
        value={score}
        onChange={(e) => {
          setScore(e.target.value);
          setError('');
          setResult(null);
        }}
        inputProps={{ min: 0, max: 200 }}
        fullWidth
        error={!!error}
        helperText={error}
        sx={{
          mb: 2,
          '& .MuiInputBase-root': { minHeight: 48 },
        }}
      />

      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel id="state-select-label">State</InputLabel>
        <Select
          labelId="state-select-label"
          value={state}
          label="State"
          onChange={(e) => {
            setState(e.target.value as string);
            setResult(null);
          }}
          sx={{ minHeight: 48 }}
        >
          {STATES.map((s) => (
            <MenuItem key={s} value={s}>
              {s}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Button
        variant="contained"
        fullWidth
        onClick={handleCheck}
        sx={{
          minHeight: 48,
          fontWeight: 700,
          fontSize: '1rem',
          mb: result ? 3 : 0,
        }}
      >
        Check
      </Button>

      {result && (
        <Box>
          <Typography
            sx={{
              fontSize: { xs: '1rem', sm: '1.1rem' },
              fontWeight: 600,
              color: 'text.primary',
              mb: 2,
              p: 2,
              bgcolor: '#E8F5E9',
              borderRadius: 1,
              lineHeight: 1.6,
            }}
          >
            {result.count} colleges match your score in {result.state}.
          </Typography>

          <Button
            component={Link}
            href="https://app.neramclasses.com/tools/counseling/college-predictor"
            variant="outlined"
            fullWidth
            sx={{
              minHeight: 48,
              fontWeight: 700,
              fontSize: '0.95rem',
            }}
          >
            View full college list with fees and cutoffs
          </Button>
        </Box>
      )}
    </Paper>
  );
}

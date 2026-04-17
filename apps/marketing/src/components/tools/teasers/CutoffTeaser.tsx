'use client';

import { useState } from 'react';
import {
  Box,
  Button,
  Paper,
  TextField,
  Typography,
} from '@neram/ui';
import Link from 'next/link';

const PERCENTILE_MAP: Array<{ minScore: number; percentile: number }> = [
  { minScore: 180, percentile: 1 },
  { minScore: 170, percentile: 3 },
  { minScore: 160, percentile: 5 },
  { minScore: 150, percentile: 10 },
  { minScore: 140, percentile: 15 },
  { minScore: 130, percentile: 25 },
  { minScore: 120, percentile: 35 },
  { minScore: 110, percentile: 45 },
  { minScore: 100, percentile: 55 },
  { minScore: 90, percentile: 65 },
  { minScore: 80, percentile: 75 },
  { minScore: 70, percentile: 85 },
  { minScore: 60, percentile: 92 },
  { minScore: 50, percentile: 96 },
  { minScore: 0, percentile: 99 },
];

function getPercentile(score: number): number {
  const entry = PERCENTILE_MAP.find((e) => score >= e.minScore);
  return entry ? entry.percentile : 99;
}

export default function CutoffTeaser() {
  const [score, setScore] = useState('');
  const [result, setResult] = useState<{ score: number; percentile: number } | null>(null);
  const [error, setError] = useState('');

  function handleCheck() {
    const parsed = Number(score);
    if (!score || isNaN(parsed) || parsed < 0 || parsed > 200) {
      setError('Please enter a valid score between 0 and 200.');
      setResult(null);
      return;
    }
    setError('');
    const percentile = getPercentile(parsed);
    setResult({ score: parsed, percentile });
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
        Quick Score Check
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
            Your score of {result.score} puts you in the top {result.percentile}% of NATA applicants.
          </Typography>

          <Button
            component={Link}
            href="https://app.neramclasses.com/tools/nata/cutoff-calculator"
            variant="outlined"
            fullWidth
            sx={{
              minHeight: 48,
              fontWeight: 700,
              fontSize: '0.95rem',
            }}
          >
            See college matches and full analysis
          </Button>
        </Box>
      )}
    </Paper>
  );
}

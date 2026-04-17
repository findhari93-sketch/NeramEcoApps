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

const RANK_RANGES: Array<{ minScore: number; rankLow: number; rankHigh: number }> = [
  { minScore: 180, rankLow: 1, rankHigh: 50 },
  { minScore: 170, rankLow: 50, rankHigh: 200 },
  { minScore: 160, rankLow: 200, rankHigh: 500 },
  { minScore: 150, rankLow: 500, rankHigh: 1500 },
  { minScore: 140, rankLow: 1500, rankHigh: 3000 },
  { minScore: 130, rankLow: 3000, rankHigh: 5000 },
  { minScore: 120, rankLow: 5000, rankHigh: 8000 },
  { minScore: 110, rankLow: 8000, rankHigh: 12000 },
  { minScore: 100, rankLow: 12000, rankHigh: 18000 },
  { minScore: 90, rankLow: 18000, rankHigh: 25000 },
  { minScore: 80, rankLow: 25000, rankHigh: 35000 },
  { minScore: 70, rankLow: 35000, rankHigh: 45000 },
  { minScore: 0, rankLow: 45000, rankHigh: 70000 },
];

function getRankRange(score: number): { rankLow: number; rankHigh: number } {
  const entry = RANK_RANGES.find((e) => score >= e.minScore);
  return entry ? { rankLow: entry.rankLow, rankHigh: entry.rankHigh } : { rankLow: 45000, rankHigh: 70000 };
}

export default function RankPredictorTeaser() {
  const [score, setScore] = useState('');
  const [result, setResult] = useState<{ score: number; rankLow: number; rankHigh: number } | null>(null);
  const [error, setError] = useState('');

  function handlePredict() {
    const parsed = Number(score);
    if (!score || isNaN(parsed) || parsed < 0 || parsed > 200) {
      setError('Please enter a valid score between 0 and 200.');
      setResult(null);
      return;
    }
    setError('');
    const { rankLow, rankHigh } = getRankRange(parsed);
    setResult({ score: parsed, rankLow, rankHigh });
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
        Quick Rank Estimate
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
        onClick={handlePredict}
        sx={{
          minHeight: 48,
          fontWeight: 700,
          fontSize: '1rem',
          mb: result ? 3 : 0,
        }}
      >
        Predict Rank
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
            Estimated rank: {result.rankLow.toLocaleString()} to {result.rankHigh.toLocaleString()} for a score of {result.score}.
          </Typography>

          <Button
            component={Link}
            href="https://app.neramclasses.com/tools/counseling/rank-predictor"
            variant="outlined"
            fullWidth
            sx={{
              minHeight: 48,
              fontWeight: 700,
              fontSize: '0.95rem',
            }}
          >
            Get detailed rank analysis with trends
          </Button>
        </Box>
      )}
    </Paper>
  );
}

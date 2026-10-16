'use client';

import { useState } from 'react';
import { TextField } from '@neram/ui';
import { CtaButton, QuickCheck, QuickCheckResult } from '@/design-system';

const FULL_TOOL = 'https://app.neramclasses.com/tools/counseling/rank-predictor';

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

const fieldSx = { '& .MuiInputBase-root': { minHeight: 48 }, '& input': { fontSize: '1rem' } } as const;

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
    <QuickCheck title="Quick rank estimate" headingId="rank-predictor-quick-check">
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

      <CtaButton variant="navy" fullWidth onClick={handlePredict} endIcon={null}>
        Predict Rank
      </CtaButton>

      {result ? (
        <QuickCheckResult
          label="Estimated rank"
          summary={`${result.rankLow.toLocaleString()} to ${result.rankHigh.toLocaleString()} for a score of ${result.score}.`}
        />
      ) : (
        <QuickCheckResult label="Estimated rank" summary="Enter your score and tap Predict Rank" />
      )}

      <CtaButton href={FULL_TOOL} external fullWidth>
        Get detailed rank analysis with trends
      </CtaButton>
    </QuickCheck>
  );
}

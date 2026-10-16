'use client';

import { useState } from 'react';
import { FormControl, InputLabel, MenuItem, Select, TextField } from '@neram/ui';
import { CtaButton, QuickCheck, QuickCheckResult } from '@/design-system';

const FULL_TOOL = 'https://app.neramclasses.com/tools/nata/eligibility-checker';

const BOARDS = ['CBSE', 'ICSE', 'State Board'];

const fieldSx = { '& .MuiInputBase-root': { minHeight: 48 }, '& input': { fontSize: '1rem' } } as const;

export default function EligibilityTeaser() {
  const [board, setBoard] = useState('');
  const [percentage, setPercentage] = useState('');
  const [result, setResult] = useState<'eligible' | 'not-eligible' | null>(null);
  const [error, setError] = useState('');

  function handleCheck() {
    if (!board) {
      setError('Please select your board.');
      setResult(null);
      return;
    }
    const pct = Number(percentage);
    if (!percentage || isNaN(pct) || pct < 0 || pct > 100) {
      setError('Please enter a valid percentage between 0 and 100.');
      setResult(null);
      return;
    }
    setError('');
    setResult(pct >= 50 ? 'eligible' : 'not-eligible');
  }

  return (
    <QuickCheck title="Quick eligibility check" headingId="eligibility-quick-check">
      <FormControl fullWidth>
        <InputLabel id="eligibility-board-label">Your Board</InputLabel>
        <Select
          labelId="eligibility-board-label"
          value={board}
          label="Your Board"
          onChange={(e) => {
            setBoard(e.target.value as string);
            setError('');
            setResult(null);
          }}
          sx={{ minHeight: 48, fontSize: '1rem' }}
        >
          {BOARDS.map((b) => (
            <MenuItem key={b} value={b}>
              {b}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <TextField
        label="PCM Aggregate Percentage"
        type="number"
        value={percentage}
        onChange={(e) => {
          setPercentage(e.target.value);
          setError('');
          setResult(null);
        }}
        inputProps={{ min: 0, max: 100, step: 0.1, inputMode: 'decimal' }}
        fullWidth
        error={!!error}
        helperText={error || 'Enter your Physics, Chemistry, Maths combined percentage'}
        sx={fieldSx}
      />

      <CtaButton variant="navy" fullWidth onClick={handleCheck} endIcon={null}>
        Check Eligibility
      </CtaButton>

      {result ? (
        <QuickCheckResult
          label="NATA 2026 eligibility"
          summary={
            result === 'eligible'
              ? 'You are eligible for NATA 2026 based on the minimum 50% PCM criteria for General category.'
              : 'You may not meet the minimum criteria. General category requires 50% in PCM. SC/ST candidates need 45%.'
          }
        />
      ) : (
        <QuickCheckResult label="NATA 2026 eligibility" summary="Enter your board and PCM percentage to check" />
      )}

      <CtaButton href={FULL_TOOL} external fullWidth>
        Check complete eligibility with all criteria
      </CtaButton>
    </QuickCheck>
  );
}

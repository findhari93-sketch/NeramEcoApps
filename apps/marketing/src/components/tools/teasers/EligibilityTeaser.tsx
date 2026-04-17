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

const BOARDS = ['CBSE', 'ICSE', 'State Board'];

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
        Quick Eligibility Check
      </Typography>

      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel>Your Board</InputLabel>
        <Select
          value={board}
          label="Your Board"
          onChange={(e) => {
            setBoard(e.target.value as string);
            setError('');
            setResult(null);
          }}
          sx={{ minHeight: 48 }}
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
        inputProps={{ min: 0, max: 100, step: 0.1 }}
        fullWidth
        error={!!error}
        helperText={error || 'Enter your Physics, Chemistry, Maths combined percentage'}
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
        Check Eligibility
      </Button>

      {result && (
        <Box>
          <Typography
            sx={{
              fontSize: { xs: '1rem', sm: '1.1rem' },
              fontWeight: 600,
              color: result === 'eligible' ? 'success.dark' : 'warning.dark',
              mb: 2,
              p: 2,
              bgcolor: result === 'eligible' ? '#E8F5E9' : '#FFF8E1',
              borderRadius: 1,
              lineHeight: 1.6,
            }}
          >
            {result === 'eligible'
              ? 'You are eligible for NATA 2026 based on the minimum 50% PCM criteria for General category.'
              : 'You may not meet the minimum criteria. General category requires 50% in PCM. SC/ST candidates need 45%.'}
          </Typography>

          <Button
            component={Link}
            href="https://app.neramclasses.com/tools/nata/eligibility-checker"
            variant="outlined"
            fullWidth
            sx={{
              minHeight: 48,
              fontWeight: 700,
              fontSize: '0.95rem',
            }}
          >
            Check complete eligibility with all criteria
          </Button>
        </Box>
      )}
    </Paper>
  );
}

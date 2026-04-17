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
  Typography,
} from '@neram/ui';
import Link from 'next/link';

const INSIGHTS_BY_STATE: Record<string, string> = {
  'Tamil Nadu': '45 B.Arch colleges participate in TNEA counseling. Average cutoff: 110.',
  'Karnataka': '22 B.Arch colleges. KCET and COMEDK counseling. Average cutoff: 105.',
  'Maharashtra': '35 B.Arch colleges. Centralised CAP counseling. Average cutoff: 100.',
  'Delhi': '8 B.Arch colleges including SPA Delhi. JoSAA and Delhi state counseling.',
  'Kerala': '12 B.Arch colleges. KEAM counseling. Strong government college options.',
  'Telangana': '10 B.Arch colleges. TSEAMCET and EAMCET counseling.',
  'Uttar Pradesh': '18 B.Arch colleges. UPSEE counseling for state quota.',
  'West Bengal': '8 B.Arch colleges. WBJEE counseling for state seats.',
  'Rajasthan': '6 B.Arch colleges. REAP counseling process.',
  'Gujarat': '12 B.Arch colleges. ACPC counseling for B.Arch seats.',
};

const STATES = Object.keys(INSIGHTS_BY_STATE);

export default function CounselingInsightsTeaser() {
  const [state, setState] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState('');

  function handleCheck() {
    if (!state) {
      setError('Please select your state.');
      setResult(null);
      return;
    }
    setError('');
    setResult(INSIGHTS_BY_STATE[state]);
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
        State Counseling Overview
      </Typography>

      <FormControl fullWidth sx={{ mb: 2 }} error={!!error}>
        <InputLabel>Select Your State</InputLabel>
        <Select
          value={state}
          label="Select Your State"
          onChange={(e) => {
            setState(e.target.value as string);
            setError('');
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
        {error && (
          <Typography sx={{ fontSize: '0.75rem', color: 'error.main', mt: 0.5, ml: 1.75 }}>
            {error}
          </Typography>
        )}
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
        Show Counseling Info
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
            {result}
          </Typography>

          <Button
            component={Link}
            href="https://app.neramclasses.com/tools/counseling/insights"
            variant="outlined"
            fullWidth
            sx={{
              minHeight: 48,
              fontWeight: 700,
              fontSize: '0.95rem',
            }}
          >
            Get personalized counseling recommendations
          </Button>
        </Box>
      )}
    </Paper>
  );
}

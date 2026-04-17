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

const FEE_BY_TYPE: Record<string, string> = {
  'Government': '₹20,000 to ₹1,50,000 per year',
  'Private': '₹1,50,000 to ₹5,00,000 per year',
  'Deemed University': '₹2,00,000 to ₹6,00,000 per year',
  'NIT/IIT': '₹1,00,000 to ₹2,50,000 per year',
};

const COLLEGE_TYPES = Object.keys(FEE_BY_TYPE);

export default function CostCalculatorTeaser() {
  const [collegeType, setCollegeType] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState('');

  function handleCalculate() {
    if (!collegeType) {
      setError('Please select a college type.');
      setResult(null);
      return;
    }
    setError('');
    setResult(FEE_BY_TYPE[collegeType]);
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
        Quick Fee Estimate
      </Typography>

      <FormControl fullWidth sx={{ mb: 2 }} error={!!error}>
        <InputLabel>College Type</InputLabel>
        <Select
          value={collegeType}
          label="College Type"
          onChange={(e) => {
            setCollegeType(e.target.value as string);
            setError('');
            setResult(null);
          }}
          sx={{ minHeight: 48 }}
        >
          {COLLEGE_TYPES.map((type) => (
            <MenuItem key={type} value={type}>
              {type}
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
        onClick={handleCalculate}
        sx={{
          minHeight: 48,
          fontWeight: 700,
          fontSize: '1rem',
          mb: result ? 3 : 0,
        }}
      >
        Show Fee Range
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
            Average annual fee for {collegeType}: {result}
          </Typography>

          <Button
            component={Link}
            href="https://app.neramclasses.com/tools/nata/cost-calculator"
            variant="outlined"
            fullWidth
            sx={{
              minHeight: 48,
              fontWeight: 700,
              fontSize: '0.95rem',
            }}
          >
            Calculate total 5-year education cost
          </Button>
        </Box>
      )}
    </Paper>
  );
}

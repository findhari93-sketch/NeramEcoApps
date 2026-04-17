'use client';

import { useState } from 'react';
import {
  Box,
  Button,
  MenuItem,
  Paper,
  Select,
  Typography,
  FormControl,
  InputLabel,
} from '@neram/ui';
import Link from 'next/link';

const CENTERS_BY_STATE: Record<string, { centers: number; cities: number }> = {
  'Tamil Nadu': { centers: 12, cities: 5 },
  'Maharashtra': { centers: 15, cities: 7 },
  'Karnataka': { centers: 8, cities: 4 },
  'Uttar Pradesh': { centers: 10, cities: 6 },
  'Delhi': { centers: 6, cities: 1 },
  'West Bengal': { centers: 5, cities: 3 },
  'Rajasthan': { centers: 4, cities: 3 },
  'Gujarat': { centers: 4, cities: 3 },
  'Telangana': { centers: 4, cities: 2 },
  'Kerala': { centers: 4, cities: 3 },
  'Andhra Pradesh': { centers: 3, cities: 2 },
  'Madhya Pradesh': { centers: 3, cities: 2 },
  'Bihar': { centers: 2, cities: 1 },
  'Odisha': { centers: 2, cities: 1 },
  'Punjab': { centers: 2, cities: 2 },
  'Jharkhand': { centers: 2, cities: 1 },
  'Assam': { centers: 1, cities: 1 },
  'Uttarakhand': { centers: 1, cities: 1 },
  'Goa': { centers: 1, cities: 1 },
  'Chandigarh': { centers: 1, cities: 1 },
};

const STATES = Object.keys(CENTERS_BY_STATE).sort();

export default function ExamCentersTeaser() {
  const [selectedState, setSelectedState] = useState('');

  const result = selectedState ? CENTERS_BY_STATE[selectedState] : null;

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
        Quick Center Search
      </Typography>

      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel id="state-select-label">Select a State</InputLabel>
        <Select
          labelId="state-select-label"
          label="Select a State"
          value={selectedState}
          onChange={(e) => setSelectedState(e.target.value as string)}
          sx={{ minHeight: 48 }}
        >
          {STATES.map((state) => (
            <MenuItem key={state} value={state}>
              {state}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

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
            {result.centers} exam {result.centers === 1 ? 'center' : 'centers'} across{' '}
            {result.cities} {result.cities === 1 ? 'city' : 'cities'} in {selectedState}
          </Typography>

          <Button
            component={Link}
            href="https://app.neramclasses.com/tools/nata/exam-centers"
            variant="outlined"
            fullWidth
            sx={{
              minHeight: 48,
              fontWeight: 700,
              fontSize: '0.95rem',
            }}
          >
            Find centers with addresses and directions
          </Button>
        </Box>
      )}
    </Paper>
  );
}

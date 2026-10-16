'use client';

import { useState } from 'react';
import { FormControl, InputLabel, MenuItem, Select } from '@neram/ui';
import { CtaButton, QuickCheck, QuickCheckResult } from '@/design-system';

const FULL_TOOL = 'https://app.neramclasses.com/tools/nata/exam-centers';

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
    <QuickCheck title="Quick center search" headingId="exam-centers-quick-check">
      <FormControl fullWidth>
        <InputLabel id="exam-centers-state-label">Select a State</InputLabel>
        <Select
          labelId="exam-centers-state-label"
          label="Select a State"
          value={selectedState}
          onChange={(e) => setSelectedState(e.target.value as string)}
          sx={{ minHeight: 48, fontSize: '1rem' }}
        >
          {STATES.map((state) => (
            <MenuItem key={state} value={state}>
              {state}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {result ? (
        <QuickCheckResult
          value={result.centers}
          label={`Exam ${result.centers === 1 ? 'center' : 'centers'}`}
          summary={`Across ${result.cities} ${result.cities === 1 ? 'city' : 'cities'} in ${selectedState}`}
        />
      ) : (
        <QuickCheckResult label="NATA exam centers" summary="Pick a state to see the count" />
      )}

      <CtaButton href={FULL_TOOL} external fullWidth>
        Find centers with addresses and directions
      </CtaButton>
    </QuickCheck>
  );
}

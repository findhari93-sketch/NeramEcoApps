'use client';

import { useState } from 'react';
import { FormControl, FormHelperText, InputLabel, MenuItem, Select } from '@neram/ui';
import { CtaButton, QuickCheck, QuickCheckResult } from '@/design-system';

const FULL_TOOL = 'https://app.neramclasses.com/tools/counseling/insights';

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
    <QuickCheck title="State counseling overview" headingId="counseling-insights-quick-check">
      <FormControl fullWidth error={!!error}>
        <InputLabel id="counseling-insights-state-label">Select Your State</InputLabel>
        <Select
          labelId="counseling-insights-state-label"
          value={state}
          label="Select Your State"
          onChange={(e) => {
            setState(e.target.value as string);
            setError('');
            setResult(null);
          }}
          sx={{ minHeight: 48, fontSize: '1rem' }}
        >
          {STATES.map((s) => (
            <MenuItem key={s} value={s}>
              {s}
            </MenuItem>
          ))}
        </Select>
        {error && <FormHelperText>{error}</FormHelperText>}
      </FormControl>

      <CtaButton variant="navy" fullWidth onClick={handleCheck} endIcon={null}>
        Show Counseling Info
      </CtaButton>

      {result ? (
        <QuickCheckResult label={state} summary={result} />
      ) : (
        <QuickCheckResult label="Counseling in your state" summary="Pick your state to see the overview" />
      )}

      <CtaButton href={FULL_TOOL} external fullWidth>
        Get personalized counseling recommendations
      </CtaButton>
    </QuickCheck>
  );
}

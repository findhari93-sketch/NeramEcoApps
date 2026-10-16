'use client';

import { useState } from 'react';
import { FormControl, FormHelperText, InputLabel, MenuItem, Select } from '@neram/ui';
import { CtaButton, QuickCheck, QuickCheckResult } from '@/design-system';

const FULL_TOOL = 'https://app.neramclasses.com/tools/nata/cost-calculator';

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
    <QuickCheck title="Quick fee estimate" headingId="cost-calculator-quick-check">
      <FormControl fullWidth error={!!error}>
        <InputLabel id="cost-calculator-type-label">College Type</InputLabel>
        <Select
          labelId="cost-calculator-type-label"
          value={collegeType}
          label="College Type"
          onChange={(e) => {
            setCollegeType(e.target.value as string);
            setError('');
            setResult(null);
          }}
          sx={{ minHeight: 48, fontSize: '1rem' }}
        >
          {COLLEGE_TYPES.map((type) => (
            <MenuItem key={type} value={type}>
              {type}
            </MenuItem>
          ))}
        </Select>
        {error && <FormHelperText>{error}</FormHelperText>}
      </FormControl>

      <CtaButton variant="navy" fullWidth onClick={handleCalculate} endIcon={null}>
        Show Fee Range
      </CtaButton>

      {result ? (
        <QuickCheckResult label={`Average annual fee for ${collegeType}`} summary={result} />
      ) : (
        <QuickCheckResult label="Average annual fee" summary="Pick a college type to see the range" />
      )}

      <CtaButton href={FULL_TOOL} external fullWidth>
        Calculate total 5-year education cost
      </CtaButton>
    </QuickCheck>
  );
}

'use client';

import { useState } from 'react';
import { TextField, Typography } from '@neram/ui';
import { CtaButton, QuickCheck, tokens } from '@/design-system';

const FULL_TOOL = 'https://app.neramclasses.com/tools/counseling/coa-checker';

const fieldSx = { '& .MuiInputBase-root': { minHeight: 48 }, '& input': { fontSize: '1rem' } } as const;

export default function COACheckerTeaser() {
  const [query, setQuery] = useState('');

  return (
    <QuickCheck title="Check COA approval status" headingId="coa-checker-quick-check">
      <Typography sx={{ fontSize: '1rem', color: tokens.inkMuted, lineHeight: 1.5 }}>
        Search for any architecture college to check its Council of Architecture (COA) recognition status.
      </Typography>

      <TextField
        label="College Name"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="e.g. School of Planning and Architecture"
        fullWidth
        sx={fieldSx}
      />

      <CtaButton href={`${FULL_TOOL}${query ? `?q=${encodeURIComponent(query)}` : ''}`} external fullWidth>
        {query ? 'Check full approval details and history' : 'Search COA Status'}
      </CtaButton>
    </QuickCheck>
  );
}

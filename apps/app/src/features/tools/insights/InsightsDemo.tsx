'use client';

import { useState } from 'react';
import { Box, ToggleButton, ToggleButtonGroup, Typography } from '@neram/ui';
import DemoGate from '@/components/tools/DemoGate';

export interface DemoInsight {
  code: string;
  label: string;
  year: number;
  /** Students on the rank list. */
  rankList: number | null;
  /** Seats allotted in the open and reserved categories (TNEA), null when not published. */
  allotted: number | null;
  colleges: number;
  /** Colleges that filled first: [name, closing value as shown]. */
  first: Array<[string, string]>;
}

/** Public demo: headline numbers for one counselling and the colleges that filled first. */
export default function InsightsDemo({ systems, initialSystem }: { systems: DemoInsight[]; initialSystem?: string }) {
  const [code, setCode] = useState(initialSystem && systems.some((s) => s.code === initialSystem) ? initialSystem : systems[0]?.code ?? '');
  const s = systems.find((x) => x.code === code);
  if (!s) return <Typography>No counselling data is available right now.</Typography>;

  const stats = [
    s.rankList != null && { label: 'On the rank list', value: s.rankList.toLocaleString('en-IN') },
    s.allotted != null && { label: 'Seats allotted', value: s.allotted.toLocaleString('en-IN') },
    { label: 'Colleges', value: String(s.colleges) },
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  return (
    <Box>
      {systems.length > 1 && (
        <ToggleButtonGroup
          exclusive
          value={code}
          onChange={(_, v) => v && setCode(v)}
          aria-label="Counselling"
          sx={{ mb: 2, '& .MuiToggleButton-root': { minHeight: 44, px: 2, textTransform: 'none', fontWeight: 600 } }}
        >
          {systems.map((x) => (
            <ToggleButton key={x.code} value={x.code}>
              {x.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      )}
      <Box component="dl" sx={{ m: 0, display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr 1fr', sm: `repeat(${stats.length}, 1fr)` } }}>
        {stats.map((st) => (
          <Box key={st.label} sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
            <Typography component="dt" variant="body2" sx={{ color: 'text.secondary' }}>
              {st.label} ({s.year})
            </Typography>
            <Typography component="dd" sx={{ m: 0, fontSize: '1.5rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
              {st.value}
            </Typography>
          </Box>
        ))}
      </Box>
      <Typography component="h3" sx={{ fontWeight: 700, mt: 2, mb: 1, fontSize: '1rem' }}>
        Filled first in {s.year}
      </Typography>
      <Box component="ol" sx={{ m: 0, pl: 3, display: 'grid', gap: 0.5 }}>
        {s.first.map(([name, v]) => (
          <Typography component="li" key={name}>
            {name} <Typography component="span" sx={{ color: 'text.secondary' }}>({v})</Typography>
          </Typography>
        ))}
      </Box>
      <DemoGate
        toolId="counseling-insights"
        headline="See every round and every college"
        benefits={['Round by round allotments', 'Per-college and per-community views', 'Year on year trends']}
        cta="Sign in free to explore"
        input={{ system: code }}
      />
    </Box>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { Box, InputAdornment, TextField, Typography } from '@neram/ui';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import DemoGate from '@/components/tools/DemoGate';

/** [name, city, state name, period as COA lists it] */
export type DemoCoa = [string, string, string, string];

const FREE = 5;
const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Public demo: search the Council of Architecture list by college name or
 * city and see the first five matches. Signed in: the full list and filters.
 */
export default function CoaDemo({ colleges, placeholder = 'College name or city' }: { colleges: DemoCoa[]; placeholder?: string }) {
  const [q, setQ] = useState('');
  const terms = norm(q).split(' ').filter(Boolean);
  const matches = useMemo(
    () => (terms.length === 0 ? [] : colleges.filter((c) => terms.every((t) => norm(`${c[0]} ${c[1]} ${c[2]}`).includes(t)))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, colleges]
  );
  const shown = matches.slice(0, FREE);
  const more = matches.length - shown.length;

  return (
    <Box>
      <TextField
        fullWidth
        label="Search the COA list"
        placeholder={placeholder}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        inputProps={{ enterKeyHint: 'search', autoComplete: 'off' }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchRoundedIcon aria-hidden="true" />
            </InputAdornment>
          ),
        }}
        sx={{ '& .MuiInputBase-root': { minHeight: 48 } }}
      />

      <Box aria-live="polite" sx={{ mt: 2, minHeight: 96 }}>
        {terms.length === 0 ? (
          <Typography variant="body2" sx={{ color: 'text.secondary', p: 2, borderRadius: 2.5, border: '1px dashed', borderColor: 'divider' }}>
            Type a college name or a city. {colleges.length} institutions are on the list.
          </Typography>
        ) : matches.length === 0 ? (
          <Typography sx={{ p: 2, borderRadius: 2.5, bgcolor: 'action.hover' }}>
            No institution on the COA list matches “{q}”. Check the spelling, or ask the college for its COA approval letter before you pay any fee.
          </Typography>
        ) : (
          <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 1 }}>
            {shown.map((c) => (
              <Box component="li" key={c[0] + c[1]} sx={{ display: 'flex', gap: 1.5, p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                <VerifiedOutlinedIcon aria-hidden="true" sx={{ color: 'success.main', mt: '2px' }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700, lineHeight: 1.35 }}>{c[0]}</Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    {c[1]}, {c[2]}
                    {c[3] ? `. Listed by COA for ${c[3]}` : ''}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      {matches.length > 0 && (
        <DemoGate
          toolId="counseling-coa-checker"
          headline={more > 0 ? `+${more} more on the list` : 'See intake and approval details'}
          benefits={['The full list with state and city filters', 'Intake, approval years and university', 'Save colleges to compare']}
          input={{ q }}
        />
      )}
    </Box>
  );
}

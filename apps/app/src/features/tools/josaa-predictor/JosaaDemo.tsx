'use client';

import { useMemo, useState } from 'react';
import { Box, TextField, Typography } from '@neram/ui';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import DemoGate from '@/components/tools/DemoGate';

/** [institute, type, state, closing rank] for the open category, other-state or all-India quota. */
export type DemoJosaa = [string, string, string, number];

const FREE = 3;

/**
 * Public demo: your JEE Main Paper 2 (B.Arch) rank against last year's final
 * round JoSAA closing ranks, open category, other-state quota. Top three shown.
 */
export default function JosaaDemo({ rows, year, round }: { rows: DemoJosaa[]; year: number; round: number }) {
  const [rank, setRank] = useState('');
  const n = parseInt(rank, 10);
  const valid = Number.isFinite(n) && n >= 1;
  const matches = useMemo(() => (valid ? rows.filter((r) => r[3] >= n).sort((a, b) => a[3] - b[3]) : []), [rows, valid, n]);
  const shown = matches.slice(0, FREE);
  const more = matches.length - shown.length;

  return (
    <Box>
      <TextField
        label="Your JEE Main Paper 2 (B.Arch) rank"
        value={rank}
        onChange={(e) => setRank(e.target.value.replace(/[^\d]/g, ''))}
        inputProps={{ inputMode: 'numeric' }}
        helperText={`Compared with JoSAA ${year} round ${round}, open category, other-state quota`}
        sx={{ width: { xs: '100%', sm: 420 }, '& .MuiInputBase-root': { minHeight: 48 } }}
      />
      <Box aria-live="polite" sx={{ mt: 2, minHeight: 96 }}>
        {!valid ? (
          <Typography variant="body2" sx={{ color: 'text.secondary', p: 2, borderRadius: 2.5, border: '1px dashed', borderColor: 'divider' }}>
            Enter your rank to see the institutes that closed at or after it.
          </Typography>
        ) : matches.length === 0 ? (
          <Typography sx={{ p: 2, borderRadius: 2.5, bgcolor: 'action.hover' }}>
            No institute closed at or after rank {n.toLocaleString('en-IN')} in the open category. Category and home state quota often close later, so sign in to check yours.
          </Typography>
        ) : (
          <>
            <Typography variant="body2" sx={{ mb: 1, color: 'text.secondary' }}>
              {matches.length} institute{matches.length === 1 ? '' : 's'} closed at or after your rank. The strongest first:
            </Typography>
            <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 1 }}>
              {shown.map((r) => (
                <Box component="li" key={r[0]} sx={{ display: 'flex', gap: 1.5, p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                  <AccountBalanceOutlinedIcon aria-hidden="true" sx={{ color: 'primary.main', mt: '2px' }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, lineHeight: 1.35 }}>{r[0]}</Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      {[r[1], r[2]].filter(Boolean).join(', ')}
                    </Typography>
                  </Box>
                  <Typography sx={{ fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>#{r[3].toLocaleString('en-IN')}</Typography>
                </Box>
              ))}
            </Box>
          </>
        )}
      </Box>
      {valid && (
        <DemoGate
          toolId="counseling-josaa-predictor"
          headline={more > 0 ? `+${more} more institutes for your rank` : 'Check your category and home state quota'}
          benefits={['Your category, gender and home state quota', 'Every round, not just the last', 'Trends across years']}
          input={{ rank: n }}
        />
      )}
    </Box>
  );
}

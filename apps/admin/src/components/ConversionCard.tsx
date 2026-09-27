'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Alert,
  Button,
} from '@neram/ui';
import RefreshIcon from '@mui/icons-material/Refresh';
import { formatMonthKey } from '@/lib/ops-format';
import { OpsSkeleton, TARGET_44 } from '@/components/ops/OpsUi';

interface ConversionMonth {
  signup_month: string;
  signed_up: number;
  became_lead: number;
  applied: number;
  enrolled: number;
  leadRate: number;
  applyRate: number;
  enrollRate: number;
}

const STEPS: Array<{ key: 'became_lead' | 'applied' | 'enrolled'; rate: 'leadRate' | 'applyRate' | 'enrollRate'; label: string }> = [
  { key: 'became_lead', rate: 'leadRate', label: 'Became lead' },
  { key: 'applied', rate: 'applyRate', label: 'Applied' },
  { key: 'enrolled', rate: 'enrollRate', label: 'Enrolled' },
];

const num = (v: unknown) => Number(v || 0).toLocaleString('en-IN');

/** Signups per month and how far they got, from /api/crm/conversion. */
export default function ConversionCard() {
  const [rows, setRows] = useState<ConversionMonth[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    setRows(null);
    try {
      const res = await fetch('/api/crm/conversion?months=6', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load conversion.');
      setRows(data.months || []);
    } catch (e: any) {
      setError(e?.message || 'Could not load conversion.');
      setRows([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Paper variant="outlined" component="section" aria-labelledby="conversion-title" sx={{ borderRadius: 2, mt: 2, overflow: 'hidden' }}>
      <Box sx={{ px: 2, pt: 2, pb: 1 }}>
        <Typography id="conversion-title" variant="h6" component="h2" fontWeight={700}>
          Signups and conversion
        </Typography>
        <Typography variant="body2" color="text.secondary">
          People who signed up each month (India time) and how far they have got so far. Percentages are of that month&apos;s
          signups. Newest month first.
        </Typography>
      </Box>

      {error ? (
        <Box sx={{ p: 2 }}>
          <Alert
            severity="error"
            action={
              <Button color="inherit" startIcon={<RefreshIcon />} onClick={load} sx={{ textTransform: 'none', ...TARGET_44 }}>
                Try again
              </Button>
            }
          >
            {error}
          </Alert>
        </Box>
      ) : rows === null ? (
        <Box sx={{ p: 2, display: 'grid', gap: 1 }} aria-busy="true" aria-label="Loading conversion">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <OpsSkeleton key={i} variant="rounded" height={32} />
          ))}
        </Box>
      ) : rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
          No signups in the last 6 months.
        </Typography>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" aria-label="Signups and conversion by month" sx={{ '& td, & th': { px: { xs: 0.75, sm: 2 }, fontSize: { xs: 13, sm: 14 } } }}>
            <TableHead>
              <TableRow>
                <TableCell component="th" scope="col">
                  Month
                </TableCell>
                <TableCell component="th" scope="col" align="right">
                  Signed up
                </TableCell>
                {STEPS.map((s) => (
                  <TableCell key={s.key} component="th" scope="col" align="right">
                    {s.label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.signup_month}>
                  <TableCell component="th" scope="row" sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}>
                    {formatMonthKey(r.signup_month)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {num(r.signed_up)}
                  </TableCell>
                  {STEPS.map((s) => (
                    <TableCell key={s.key} align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      <Box component="span" sx={{ display: { xs: 'block', sm: 'inline' } }}>
                        {num(r[s.key])}
                      </Box>
                      <Box component="span" sx={{ color: 'text.secondary', ml: { xs: 0, sm: 0.75 }, fontSize: 12 }}>
                        {Number(r.signed_up) > 0 ? `${r[s.rate]}%` : ''}
                      </Box>
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Paper>
  );
}

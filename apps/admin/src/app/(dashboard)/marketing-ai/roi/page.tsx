'use client';

/**
 * Ads ROI: per month of Google Ads spend, the sign-ups, demos, joined students
 * and fees that spend brought back. Spec: docs/superpowers/specs/2026-10-14-ads-roi-design.md.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, Box, Button, Drawer, IconButton, Paper, Snackbar, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@neram/ui';
import SavingsOutlinedIcon from '@mui/icons-material/SavingsOutlined';
import CloseIcon from '@mui/icons-material/Close';
import { EmptyState, OpsPageHeader, OpsSkeleton, TARGET_44 } from '@/components/ops/OpsUi';
import { AdminOnly } from '@/components/marketing-ai/Parts';
import { api, inr, num } from '@/components/marketing-ai/format';
import type { RoiMonth, RoiPersonView, RoiReport, RoiRow, RoiStage, TierCounts } from '@/lib/marketing-ai/roi';

type Report = RoiReport & { generatedAt: string };
type Metric = 'signups' | 'demosBooked' | 'demosAttended' | 'joined' | 'fees';

const STAGE_LABEL: Record<RoiStage, string> = { signed_up: 'Signed up', demo_booked: 'Demo booked', demo_attended: 'Attended demo', joined: 'Joined' };
// The same flags the counts use, so a drawer lists exactly the people its number counts.
const IN_METRIC: Record<Metric, (p: RoiPersonView) => boolean> = {
  signups: () => true,
  demosBooked: (p) => p.demoBooked,
  demosAttended: (p) => p.demoAttended,
  joined: (p) => p.joined,
  fees: (p) => p.feesPaid > 0,
};
const COLUMNS: Array<{ key: Metric; label: string }> = [
  { key: 'signups', label: 'Sign-ups' },
  { key: 'demosBooked', label: 'Demos booked' },
  { key: 'demosAttended', label: 'Demos attended' },
  { key: 'joined', label: 'Joined' },
  { key: 'fees', label: 'Fees collected' },
];

function monthName(m: string) {
  const [y, mo] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function returnText(row: RoiRow) {
  const r = row.returnPerRupee;
  return r ? `₹${r.confirmed.toFixed(2)} + ₹${(r.withSaid - r.confirmed).toFixed(2)}` : '-';
}

function TierPair({ value, money }: { value: TierCounts; money?: boolean }) {
  const f = money ? inr : num;
  return (
    <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
      <strong>{f(value.confirmed)}</strong>
      <Box component="span" sx={{ color: 'text.secondary' }}> + {f(value.said_google_ad)}</Box>
    </Box>
  );
}

export default function AdsRoiPage() {
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);
  const [open, setOpen] = useState<{ month: RoiMonth; metric: Metric } | null>(null);
  const [form, setForm] = useState({ month: '', amount: '' });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Report>('/api/marketing-ai/roi')
      .then((r) => {
        setData(r);
        setError(null);
      })
      .catch((e: any) => setError({ message: e.message, status: e.status }));
  }, []);
  useEffect(load, [load]);

  const saveSpend = async (month: string, amount: number | null) => {
    setSaving(true);
    try {
      await api('/api/marketing-ai/roi/spend', { method: 'PUT', body: JSON.stringify({ month, amount }) });
      setToast(amount === null ? `Cleared spend for ${monthName(month)}.` : `Saved ${inr(amount)} for ${monthName(month)}.`);
      setForm({ month: '', amount: '' });
      load();
    } catch (e: any) {
      setToast(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (error?.status === 403) return <AdminOnly />;

  // Months before the first one with spend, a credited student or a Google answer are all zeros: skip them.
  const firstUsed = data ? data.months.findIndex((m) => m.spend !== null || m.signups.confirmed + m.signups.said_google_ad > 0 || m.alsoSaidGoogle > 0) : -1;
  const months = data ? (firstUsed < 0 ? data.months.slice(-1) : data.months.slice(firstUsed)).reverse() : [];
  const typed = data ? data.months.filter((m) => m.spendSource === 'manual') : [];
  const anyone = !!data && data.total.signups.confirmed + data.total.signups.said_google_ad > 0;
  const people = open ? open.month.people.filter(IN_METRIC[open.metric]) : [];

  return (
    <Box>
      <OpsPageHeader
        icon={SavingsOutlinedIcon}
        title="Ads ROI"
        subtitle="What each month of Google Ads spend brought back: sign-ups, demos, students who joined and fees paid."
        actions={
          <Button component={Link} href="/marketing-ai" sx={TARGET_44}>
            Back to overview
          </Button>
        }
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error.message}</Alert>}

      <Alert severity="info" sx={{ mb: 2 }}>
        Each number has two parts: <strong>Ad click</strong> (we recorded the student clicking your ad) + <strong>Said ad</strong> (the student answered
        &quot;Google ad&quot; when asked how they found Neram). Fees count toward the month of the first ad click, so recent months keep growing as fees come in.
        Students who answered plain &quot;Google Search&quot; are listed separately and not credited, because most of them found the free search results.
      </Alert>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600, mb: 1 }}>
          Monthly ad spend
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Type what Google Ads actually spent in a month (Google Ads, Billing, then Transactions). Money you add to the balance is not spend. Once Google Ads is connected, the real spend fills in by itself.
        </Typography>
        <Box
          component="form"
          onSubmit={(e) => {
            e.preventDefault();
            saveSpend(form.month, Number(form.amount));
          }}
          sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap' }}
        >
          <TextField label="Month" type="month" size="small" required fullWidth={false} sx={{ width: 200 }} value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} InputLabelProps={{ shrink: true }} inputProps={{ min: '2026-01' }} />
          <TextField label="Spent (₹)" type="number" size="small" required fullWidth={false} sx={{ width: 200 }} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} inputProps={{ min: 0, max: 1000000, step: 1 }} />
          <Button type="submit" variant="contained" disabled={saving || !form.month || form.amount === ''} sx={TARGET_44}>
            {saving ? 'Saving' : 'Save spend'}
          </Button>
        </Box>
        {typed.length > 0 && (
          <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {typed.map((m) => (
              <Box key={m.month} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, border: 1, borderColor: 'divider', borderRadius: 1, pl: 1.5 }}>
                <Typography variant="body2">
                  {monthName(m.month)}: {inr(m.spend ?? 0)}
                </Typography>
                <Button size="small" onClick={() => setForm({ month: m.month, amount: String(m.spend ?? '') })} aria-label={`Edit spend for ${monthName(m.month)}`} sx={TARGET_44}>
                  Edit
                </Button>
                <Button size="small" color="error" disabled={saving} onClick={() => saveSpend(m.month, null)} aria-label={`Clear spend for ${monthName(m.month)}`} sx={TARGET_44}>
                  Clear
                </Button>
              </Box>
            ))}
          </Box>
        )}
      </Paper>

      {!data && !error && <OpsSkeleton variant="rounded" height={360} />}

      {data && !anyone && (
        <EmptyState
          icon={SavingsOutlinedIcon}
          title="No students from Google Ads yet"
          body="Sign-ups appear here once a student who clicked your ad, or who answered Google ad, verifies their phone."
        />
      )}

      {data && anyone && (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small" aria-label="Google Ads return by month">
            <TableHead>
              <TableRow>
                <TableCell>Month</TableCell>
                <TableCell align="right">Spent</TableCell>
                {COLUMNS.map((c) => (
                  <TableCell key={c.key} align="right">
                    {c.label}
                  </TableCell>
                ))}
                <TableCell align="right">Return per ₹1</TableCell>
                <TableCell align="right">Also said Google search</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {months.map((m) => (
                <TableRow key={m.month} hover>
                  <TableCell component="th" scope="row" sx={{ whiteSpace: 'nowrap' }}>
                    {monthName(m.month)}
                  </TableCell>
                  <TableCell align="right">
                    {m.spend === null ? (
                      <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                        Not entered
                      </Typography>
                    ) : (
                      <>
                        {inr(m.spend)}
                        <Typography variant="caption" color="text.secondary" display="block">
                          {m.spendSource === 'google' ? 'from Google' : 'typed'}
                        </Typography>
                      </>
                    )}
                  </TableCell>
                  {COLUMNS.map((c) => (
                    <TableCell key={c.key} align="right">
                      <Button
                        variant="text"
                        size="small"
                        onClick={() => setOpen({ month: m, metric: c.key })}
                        disabled={m[c.key].confirmed + m[c.key].said_google_ad === 0}
                        aria-label={`${c.label} in ${monthName(m.month)}: show students`}
                        sx={{ minHeight: 44, minWidth: 44 }}
                      >
                        <TierPair value={m[c.key]} money={c.key === 'fees'} />
                      </Button>
                    </TableCell>
                  ))}
                  <TableCell align="right">{returnText(m)}</TableCell>
                  <TableCell align="right">{num(m.alsoSaidGoogle)}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell component="th" scope="row">
                  <strong>Total</strong>
                </TableCell>
                <TableCell align="right">
                  <strong>{data.total.spend === null ? '-' : inr(data.total.spend)}</strong>
                </TableCell>
                {COLUMNS.map((c) => (
                  <TableCell key={c.key} align="right">
                    <TierPair value={data.total[c.key]} money={c.key === 'fees'} />
                  </TableCell>
                ))}
                <TableCell align="right">{returnText(data.total)}</TableCell>
                <TableCell align="right">{num(data.total.alsoSaidGoogle)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Drawer anchor="right" open={!!open} onClose={() => setOpen(null)} PaperProps={{ sx: { width: { xs: '100%', sm: 420 }, p: 2 } }}>
        {open && (
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="h6" component="h2">
                {COLUMNS.find((c) => c.key === open.metric)!.label}, {monthName(open.month.month)}
              </Typography>
              <IconButton aria-label="Close" onClick={() => setOpen(null)} sx={TARGET_44}>
                <CloseIcon />
              </IconButton>
            </Box>
            {people.map((p) => (
              <Box key={p.userId} sx={{ py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                <Typography variant="body1">
                  {p.name || 'No name'}
                  {p.phoneLast4 ? `, phone ending ${p.phoneLast4}` : ''}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {p.tier === 'confirmed' ? 'Ad click' : 'Said ad'} · {STAGE_LABEL[p.stage]}
                  {p.feesPaid > 0 ? ` · paid ${inr(p.feesPaid)}` : ''}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </Drawer>

      <Snackbar open={!!toast} autoHideDuration={5000} onClose={() => setToast(null)} message={toast} />
    </Box>
  );
}

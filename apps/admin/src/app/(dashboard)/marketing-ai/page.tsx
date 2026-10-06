'use client';

/**
 * Marketing Intelligence: Overview. How Google Ads is doing (7 or 30 days
 * against the period before), what the agent wants approved, what autopilot
 * did, and whether the nightly jobs ran. Desktop first, usable from 900px.
 * Entered from the sidebar (Marketing Intelligence). Admins only.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, Box, Button, CircularProgress, LinearProgress, Paper, Snackbar, ToggleButton, ToggleButtonGroup, Typography, useTheme } from '@neram/ui';
import AutoGraphIcon from '@mui/icons-material/AutoGraph';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ScheduleIcon from '@mui/icons-material/Schedule';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import PanToolOutlinedIcon from '@mui/icons-material/PanToolOutlined';
import BlockIcon from '@mui/icons-material/Block';
import HistoryIcon from '@mui/icons-material/History';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';
import { EmptyState, OpsPageHeader, OpsSkeleton, StatusChip, TARGET_44 } from '@/components/ops/OpsUi';
import { AdminOnly, KpiCard, ModeBanner } from '@/components/marketing-ai/Parts';
import { ActivityFeed, SignupsCard, WeeklyReportCard } from '@/components/marketing-ai/OverviewParts';
import { api, CATEGORY_LABEL, inr, num, pct, shortDate, when } from '@/components/marketing-ai/format';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * This month's spend against the cap that applies now. Off-season the cap is
 * the minimum (₹7,000 by default); in the season months it is the season cap.
 */
function BudgetCard({ budget }: { budget: any }) {
  const used = budget.monthly_spend_cap_inr > 0 ? Math.min(100, (budget.spent / budget.monthly_spend_cap_inr) * 100) : 0;
  const over = budget.projected > budget.monthly_spend_cap_inr * 1.05;
  const budgetsOver = budget.budgets_allow > budget.monthly_spend_cap_inr * 1.02;
  const seasonLabel = budget.season_months.length ? budget.season_months.map((m: number) => MONTHS[m - 1]).join(', ') : 'none set';
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, borderColor: over ? 'warning.main' : 'divider' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="subtitle1" component="h2" fontWeight={700}>
            This month&apos;s budget
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {budget.in_season ? 'Admission season' : 'Off-season'} cap of {inr(budget.monthly_spend_cap_inr)}. Season months: {seasonLabel}.
          </Typography>
        </Box>
        <StatusChip icon={over ? ErrorOutlineIcon : CheckCircleOutlineIcon} tone={over ? 'warning' : 'success'} label={`On track for ${inr(budget.projected)}`} />
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1.5 }}>
        <LinearProgress
          variant="determinate"
          value={used}
          color={used >= 100 ? 'error' : over ? 'warning' : 'primary'}
          sx={{ flex: 1, height: 8, borderRadius: 4 }}
          aria-label={`${inr(budget.spent)} of ${inr(budget.monthly_spend_cap_inr)} spent`}
        />
        <Typography variant="body2" fontWeight={700} sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
          {inr(budget.spent)} of {inr(budget.monthly_spend_cap_inr)}
        </Typography>
      </Box>
      {budgetsOver && (
        <Typography variant="body2" color="warning.main" sx={{ mt: 1 }}>
          The daily budgets in Google Ads ({inr(budget.daily_budgets)} a day) allow up to {inr(budget.budgets_allow)} a month. The agent has proposed cuts in Recommendations.
        </Typography>
      )}
    </Paper>
  );
}

/**
 * Enabled campaigns with no impressions for 3 days (rule R0). On this account
 * that has meant an exhausted prepaid balance, which only a person can fix in
 * Google Ads billing. Stays until the campaign shows ads again.
 */
function NotServingBanner({ campaigns }: { campaigns: Array<{ campaign_id: string; name: string | null; reasons: string[] }> }) {
  return (
    <Alert
      severity="error"
      role="alert"
      sx={{ mb: 2 }}
      action={
        <Button color="inherit" size="small" href="https://ads.google.com/aw/billing/summary" target="_blank" rel="noopener noreferrer" endIcon={<OpenInNewIcon fontSize="small" />} sx={TARGET_44}>
          Open billing
        </Button>
      }
    >
      <Typography variant="subtitle2" component="p" fontWeight={700}>
        Ads are not showing
      </Typography>
      <Typography variant="body2" component="div">
        {campaigns.map((c) => (
          <Box key={c.campaign_id}>
            &quot;{c.name ?? c.campaign_id}&quot; has had no impressions for 3 days{c.reasons.length ? ` (Google: ${c.reasons.join(', ').toLowerCase().replace(/_/g, ' ')})` : ''}.
          </Box>
        ))}
        Usually the prepaid balance has run out: add funds in Google Ads billing. Until then the agent makes no changes based on these campaigns.
      </Typography>
    </Alert>
  );
}

const PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;
const PRIORITY_TONE = { critical: 'error', high: 'warning', medium: 'info', low: 'neutral' } as const;
const JOBS = [
  { kind: 'ingest', label: 'Fetch Google Ads data' },
  { kind: 'analyze', label: 'Analyse and recommend' },
  { kind: 'conversions', label: 'Send conversions to Google' },
] as const;

export default function MarketingAiOverviewPage() {
  const theme = useTheme();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);
  const [period, setPeriod] = useState<7 | 30>(7);
  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const load = useCallback(() => {
    let cancelled = false;
    setError(null);
    api('/api/marketing-ai/overview')
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError({ message: e.message, status: e.status }));
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => load(), [load]);

  const runAudit = async () => {
    setRunning(true);
    try {
      const r = await api('/api/marketing-ai/runs', { method: 'POST', body: JSON.stringify({ kind: 'audit' }) });
      const s = r.analyze?.stats ?? {};
      setToast(`Audit done: ${s.created ?? 0} new, ${s.refreshed ?? 0} updated recommendations.`);
      load();
    } catch (e: any) {
      setToast(e.message);
    } finally {
      setRunning(false);
    }
  };

  // Last season's history: rules use it for suggestions that need approval, and the season benchmark.
  const historyStart: string | null = data?.settings?.targets?.proxy_history_since ?? null;
  const needsHistory = !!data?.hasData && !!historyStart && (!data.historyFrom || data.historyFrom > historyStart);
  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const r = await api('/api/marketing-ai/runs', { method: 'POST', body: JSON.stringify({ kind: 'ingest', from: historyStart }) });
      setToast(`History loaded from ${shortDate(historyStart!)}: ${num(r.ingest?.stats?.keyword ?? 0)} keyword days, ${num(r.ingest?.stats?.search_term ?? 0)} search term days.`);
      load();
    } catch (e: any) {
      setToast(e.message);
    } finally {
      setLoadingHistory(false);
    }
  };

  if (error?.status === 403) return <AdminOnly />;

  const cmp = data ? (period === 7 ? data.last7 : data.last30) : null;
  const pending = data ? PRIORITIES.reduce((s, p) => s + (data.recommendations.pendingByPriority[p] ?? 0), 0) : 0;

  return (
    <Box>
      <OpsPageHeader
        icon={AutoGraphIcon}
        title="Marketing Intelligence"
        subtitle={data?.hasData ? `Google Ads performance and the agent's recommendations. Data up to ${shortDate(data.endDate)}.` : "Google Ads performance and the agent's recommendations."}
        actions={
          <>
            <Button component={Link} href="/marketing-ai/recommendations" variant="contained" sx={TARGET_44} disabled={!data}>
              Review recommendations{pending ? ` (${pending})` : ''}
            </Button>
            <Button onClick={runAudit} disabled={running || !data} startIcon={running ? <CircularProgress size={16} /> : <PlayArrowIcon />} sx={TARGET_44}>
              {running ? 'Running audit' : 'Run audit now'}
            </Button>
          </>
        }
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error.message}</Alert>}
      {data && <ModeBanner mode={data.connection.mode} mutationsAllowed={data.connection.mutationsAllowed} missing={data.connection.missing} />}
      {data?.notServing?.length > 0 && <NotServingBanner campaigns={data.notServing} />}
      {data && ((data.connection.mode === 'live' && !data.connection.missing.length) || needsHistory) && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', mb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {data.connection.mode === 'live' && !data.connection.missing.length && (
              <>
                Connected to Google Ads account {String(data.connection.customerId).replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3')}, API {data.connection.apiVersion}.
                {data.connection.mutationsAllowed ? ' Changes go live.' : ' Changes are dry runs only.'}{' '}
              </>
            )}
            {data.historyFrom && `History from ${shortDate(data.historyFrom)}.`}
          </Typography>
          {needsHistory && (
            <Button
              variant="outlined"
              onClick={loadHistory}
              disabled={loadingHistory || running}
              startIcon={loadingHistory ? <CircularProgress size={16} /> : <HistoryIcon />}
              sx={TARGET_44}
            >
              {loadingHistory ? 'Loading history' : `Load history since ${shortDate(historyStart!)}`}
            </Button>
          )}
        </Box>
      )}

      {!data && !error && (
        <Box sx={{ display: 'grid', gap: 2 }}>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <OpsSkeleton key={i} variant="rounded" height={112} />
            ))}
          </Box>
          <OpsSkeleton variant="rounded" height={300} />
        </Box>
      )}

      {data && !data.hasData && (
        <EmptyState
          icon={AutoGraphIcon}
          title="No Google Ads data yet"
          body="The agent fetches data every morning at 6:00. Run an audit now to fetch the last 35 days and get the first recommendations."
          action={
            <Button variant="contained" onClick={runAudit} disabled={running} sx={TARGET_44}>
              {running ? 'Running audit' : 'Run audit now'}
            </Button>
          }
        />
      )}

      {data?.hasData && cmp && (
        <Box sx={{ display: 'grid', gap: 2 }}>
          <BudgetCard budget={data.budget} />

          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 2fr) minmax(0, 3fr)' } }}>
            <SignupsCard signups={data.signups} />
            <ActivityFeed
              items={data.activity}
              onChanged={(m) => {
                setToast(m);
                load();
              }}
            />
          </Box>
          <WeeklyReportCard report={data.report} />

          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="h6" component="h2" fontWeight={700}>
              Account health
            </Typography>
            <ToggleButtonGroup exclusive size="small" value={period} onChange={(_, v) => v && setPeriod(v)} aria-label="Compare period">
              <ToggleButton value={7} sx={TARGET_44}>Last 7 days</ToggleButton>
              <ToggleButton value={30} sx={TARGET_44}>Last 30 days</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            <KpiCard label="Spend" value={inr(cmp.current.cost)} previous={inr(cmp.previous.cost)} change={cmp.change.cost} goodWhen="none" />
            <KpiCard label="Conversions" value={num(cmp.current.conversions, 1)} previous={num(cmp.previous.conversions, 1)} change={cmp.change.conversions} goodWhen="up" />
            <KpiCard label="Cost per conversion" value={inr(cmp.current.cpa)} previous={inr(cmp.previous.cpa)} change={cmp.change.cpa} goodWhen="down" />
            <KpiCard label="Conversion rate" value={pct(cmp.current.convRate)} previous={pct(cmp.previous.convRate)} change={cmp.change.convRate} goodWhen="up" />
            <KpiCard label="Click-through rate" value={pct(cmp.current.ctr)} previous={pct(cmp.previous.ctr)} change={cmp.change.ctr} goodWhen="up" />
            <KpiCard label="Cost per click" value={inr(cmp.current.cpc, 2)} previous={inr(cmp.previous.cpc, 2)} change={cmp.change.cpc} goodWhen="down" />
          </Box>

          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <Typography variant="subtitle1" component="h2" fontWeight={700}>
              Daily spend and conversions, last 30 days
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {inr(data.last30.current.cost)} spent for {num(data.last30.current.conversions, 1)} conversions, {inr(data.last30.current.cpa)} each.
            </Typography>
            <Box sx={{ height: 280 }} role="img" aria-label="Bar chart of daily spend with a line of daily conversions over the last 30 days">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data.trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
                  <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 12 }} minTickGap={24} />
                  <YAxis yAxisId="cost" tick={{ fontSize: 12 }} tickFormatter={(v) => `₹${Math.round(v / 100) / 10}k`} width={48} />
                  <YAxis yAxisId="conv" orientation="right" tick={{ fontSize: 12 }} width={32} allowDecimals={false} />
                  <RTooltip formatter={(v: any, name: any) => (name === 'Spend' ? inr(Number(v)) : num(Number(v), 1))} labelFormatter={(l: any) => shortDate(String(l))} />
                  <Legend />
                  <Bar yAxisId="cost" dataKey="cost" name="Spend" fill={theme.palette.primary.main} fillOpacity={0.35} isAnimationActive={false} />
                  <Line yAxisId="conv" dataKey="conversions" name="Conversions" stroke={theme.palette.success.main} strokeWidth={2} dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </Box>
          </Paper>

          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' } }}>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Typography variant="subtitle1" component="h2" fontWeight={700}>
                Waiting for you
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                {pending ? `${pending} recommendation${pending > 1 ? 's' : ''} need a decision.` : 'Nothing waiting. The agent checks again tomorrow morning.'}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {PRIORITIES.map((p) => (
                  <StatusChip key={p} icon={p === 'critical' ? ErrorOutlineIcon : ScheduleIcon} tone={(data.recommendations.pendingByPriority[p] ?? 0) ? PRIORITY_TONE[p] : 'neutral'} label={`${data.recommendations.pendingByPriority[p] ?? 0} ${p}`} />
                ))}
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                Last 90 days: {data.recommendations.byStatus.executed ?? 0} applied, {data.recommendations.byStatus.measured ?? 0} measured, {data.recommendations.byStatus.rejected ?? 0} rejected, {data.recommendations.byStatus.failed ?? 0} failed.
              </Typography>
            </Paper>

            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                <Typography variant="subtitle1" component="h2" fontWeight={700}>
                  Autopilot
                </Typography>
                {data.settings.autonomy.kill_switch ? (
                  <StatusChip icon={BlockIcon} tone="error" label="Stopped" />
                ) : data.settings.autonomy.level >= 2 ? (
                  <StatusChip icon={SmartToyOutlinedIcon} tone="success" label={`Level ${data.settings.autonomy.level}`} />
                ) : (
                  <StatusChip icon={PanToolOutlinedIcon} tone="neutral" label="Approve everything" />
                )}
              </Box>
              <Box component="ul" sx={{ pl: 2, my: 1.5, '& li': { mb: 0.5 } }}>
                {data.eligibility.map((e: any) => (
                  <Typography component="li" variant="body2" key={e.category}>
                    {CATEGORY_LABEL[e.category]}: {data.settings.autonomy.categories[e.category] === 'auto' ? 'automatic' : 'needs approval'}
                    {data.settings.autonomy.categories[e.category] !== 'auto' && ` (${e.decided} of 15 decisions${e.eligible ? ', can go automatic' : ''})`}
                  </Typography>
                ))}
              </Box>
              <Typography variant="body2" color="text.secondary">
                {data.autopilot.actions7d} automatic change{data.autopilot.actions7d === 1 ? '' : 's'} in the last 7 days.
              </Typography>
              <Button component={Link} href="/marketing-ai/settings" size="small" sx={{ ...TARGET_44, mt: 1 }}>
                Autonomy settings
              </Button>
            </Paper>

            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Typography variant="subtitle1" component="h2" fontWeight={700} sx={{ mb: 1 }}>
                Nightly jobs
              </Typography>
              <Box sx={{ display: 'grid', gap: 1 }}>
                {JOBS.map((j) => {
                  const r = data.runs[j.kind];
                  return (
                    <Box key={j.kind} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600}>{j.label}</Typography>
                        <Typography variant="caption" color="text.secondary">{r ? `${when(r.finished_at || r.started_at)}, ${r.trigger}` : 'not run yet'}</Typography>
                        {r?.error && <Typography variant="caption" color="error" sx={{ display: 'block', wordBreak: 'break-word' }}>{r.error}</Typography>}
                      </Box>
                      {r && <StatusChip icon={r.status === 'failed' ? ErrorOutlineIcon : r.status === 'running' ? ScheduleIcon : CheckCircleOutlineIcon} tone={r.status === 'failed' ? 'error' : r.status === 'running' ? 'info' : 'success'} label={r.status} />}
                    </Box>
                  );
                })}
              </Box>
            </Paper>

            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Typography variant="subtitle1" component="h2" fontWeight={700}>
                Sign-ups sent to Google, last 30 days
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                OTP-verified sign-ups (the conversion Google bids for), sent every 6 hours with the ad click id and hashed phone and email.
              </Typography>
              {[
                ['phone_verified', 'Phone verified', data.connection.conversionActions.phone],
                ['demo_booked', 'Demo booked', data.connection.conversionActions.demo],
                ['admission_paid', 'Admission paid', data.connection.conversionActions.paid],
              ].map(([type, label, configured]) => {
                const c = data.conversions[type as string] ?? {};
                return (
                  <Typography variant="body2" key={type as string}>
                    <strong>{label as string}:</strong> {c.uploaded ?? 0} sent{c.validated ? `, ${c.validated} checked only` : ''}{c.failed ? `, ${c.failed} failed` : ''}
                    {!configured && ' (conversion action not set up yet)'}
                  </Typography>
                );
              })}
            </Paper>
          </Box>
        </Box>
      )}

      <Snackbar open={!!toast} autoHideDuration={6000} onClose={() => setToast(null)} message={toast} />
    </Box>
  );
}

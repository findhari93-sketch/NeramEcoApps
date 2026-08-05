'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
  alpha,
  useTheme,
} from '@neram/ui';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import { useRouter } from 'next/navigation';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useAuthSWR } from '@/lib/nexus-swr';
/**
 * Imported from the deep path, not the package barrel.
 *
 * The barrel re-exports the Gemini client and the budget guard, which pull in
 * Node's `crypto` and the Supabase admin client. Reaching them from a 'use
 * client' component would drag both into the browser bundle: `crypto` does not
 * resolve there at all, and the rest is weight nobody asked for. features.ts is
 * a plain registry with no runtime dependencies, which is exactly what a client
 * needs from this package.
 */
import { AI_CONTROLS_KEY, type AiMode } from '@neram/ai/features';

/**
 * What the AI cost this month, which feature spent it, and the switches to
 * spend less.
 *
 * Built because nothing anywhere recorded a Gemini call. The key is on a paid
 * tier, so every token is charged from the first request, and the first sign of
 * a problem would otherwise have been the invoice.
 *
 * The layout answers three questions in order, because that is the order they
 * get asked in: how much so far, is it going to hold, and who is spending it.
 * The mode selector sits in the same row as each feature's cost so the decision
 * and the evidence for it are never on separate screens.
 */

interface FeatureRow {
  featureId: string;
  label: string;
  app: string;
  group: string;
  trigger: string;
  tier: string;
  supportsManual: boolean;
  mode: AiMode;
  calls: number;
  blockedCalls: number;
  tokens: number;
  costUsd: number;
  avgCostUsd: number;
}

interface UsageResponse {
  controls: {
    masterEnabled: boolean;
    monthlyCapUsd: number;
    dailyCapUsd: number;
    usdToInr: number;
    modes: Record<string, AiMode>;
  };
  today: { calls: number; blockedCalls: number; tokens: number; costUsd: number };
  month: {
    calls: number;
    blockedCalls: number;
    tokens: number;
    costUsd: number;
    projectedUsd: number;
    daysElapsed: number;
    daysInMonth: number;
  };
  byFeature: FeatureRow[];
  orphans: Array<{ featureId: string; label: string; calls: number; costUsd: number }>;
  byModel: Array<{ model: string; calls: number; costUsd: number }>;
  recent: Array<{
    id: string;
    label: string;
    app: string;
    model: string | null;
    keyTier: string;
    tokens: number;
    costUsd: number | null;
    latencyMs: number | null;
    status: string;
    error: string | null;
    createdAt: string;
  }>;
  priceCheck: { unpricedModels: string[] };
}

const APP_ICON: Record<string, typeof PublicOutlinedIcon> = {
  marketing: PublicOutlinedIcon,
  nexus: SchoolOutlinedIcon,
  admin: AdminPanelSettingsOutlinedIcon,
};

const STATUS_COLOR: Record<string, 'success' | 'error' | 'warning' | 'default'> = {
  ok: 'success',
  error: 'error',
  rate_limited: 'warning',
  blocked_budget: 'warning',
  manual: 'default',
};

function usd(n: number | null): string {
  if (n === null) return 'unpriced';
  if (n === 0) return '$0';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function inr(n: number, rate: number): string {
  const value = n * rate;
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: value < 100 ? 2 : 0 })}`;
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export default function AiUsagePage() {
  const { isAdmin, loading, getToken } = useNexusAuthContext();
  const router = useRouter();
  const theme = useTheme();

  const { data, error, isLoading, mutate } = useAuthSWR<UsageResponse>('/api/admin/ai-usage');

  const [modes, setModes] = useState<Record<string, AiMode>>({});
  const [caps, setCaps] = useState({ monthlyCapUsd: 0, dailyCapUsd: 0, usdToInr: 0 });
  const [masterEnabled, setMasterEnabled] = useState(true);
  const baselineRef = useRef<string>('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!loading && !isAdmin) router.replace('/teacher/dashboard');
  }, [isAdmin, loading, router]);

  /**
   * Seed the form from the server ONCE per load, never on a revalidation.
   *
   * SWR refetches on focus, and rehydrating the form from that would throw away
   * whatever the admin had half-typed the moment they tabbed back to the window.
   */
  useEffect(() => {
    if (!data || baselineRef.current) return;
    const next: Record<string, AiMode> = {};
    for (const f of data.byFeature) next[f.featureId] = f.mode;
    setModes(next);
    setCaps({
      monthlyCapUsd: data.controls.monthlyCapUsd,
      dailyCapUsd: data.controls.dailyCapUsd,
      usdToInr: data.controls.usdToInr,
    });
    setMasterEnabled(data.controls.masterEnabled);
    baselineRef.current = JSON.stringify({
      modes: next,
      caps: {
        monthlyCapUsd: data.controls.monthlyCapUsd,
        dailyCapUsd: data.controls.dailyCapUsd,
        usdToInr: data.controls.usdToInr,
      },
      masterEnabled: data.controls.masterEnabled,
    });
  }, [data]);

  const dirty = useMemo(
    () => baselineRef.current !== JSON.stringify({ modes, caps, masterEnabled }),
    [modes, caps, masterEnabled],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ key: AI_CONTROLS_KEY, value: { ...caps, masterEnabled, modes } }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to save');
      }
      baselineRef.current = JSON.stringify({ modes, caps, masterEnabled });
      setMessage({
        type: 'success',
        text: 'Saved. Every app picks this up within about fifteen seconds.',
      });
      mutate();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save.' });
    } finally {
      setSaving(false);
    }
  }, [caps, masterEnabled, modes, getToken, mutate]);

  /**
   * Grouped above the early return, because hooks cannot run conditionally.
   * `data` is undefined until the fetch lands, so this has to tolerate that
   * rather than being placed after the guard where it reads more naturally.
   */
  const groups = useMemo(() => {
    const out: Array<{ group: string; app: string; rows: FeatureRow[] }> = [];
    for (const row of data?.byFeature ?? []) {
      let bucket = out.find((g) => g.group === row.group);
      if (!bucket) {
        bucket = { group: row.group, app: row.app, rows: [] };
        out.push(bucket);
      }
      bucket.rows.push(row);
    }
    return out;
  }, [data]);

  if (loading || !isAdmin) return null;

  const rate = caps.usdToInr || 88;
  const monthPct = caps.monthlyCapUsd
    ? Math.min(100, ((data?.month.costUsd ?? 0) / caps.monthlyCapUsd) * 100)
    : 0;
  const dayPct = caps.dailyCapUsd
    ? Math.min(100, ((data?.today.costUsd ?? 0) / caps.dailyCapUsd) * 100)
    : 0;
  const projectedOver = (data?.month.projectedUsd ?? 0) > caps.monthlyCapUsd;

  return (
    <Box sx={{ pb: 14 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        AI usage
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Every Gemini call across the four apps, what it cost, and the switches to spend less. The
        key is on a paid tier, so there is no free monthly allowance absorbing any of this.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
          Could not load usage. {error.message}
        </Alert>
      )}

      {isLoading && !data ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <CircularProgress size={28} />
        </Box>
      ) : data ? (
        <Stack spacing={3}>
          {/* ── Money ──────────────────────────────────────────────────── */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
              gap: 2,
            }}
          >
            <StatCard
              title="This month"
              value={usd(data.month.costUsd)}
              sub={`${inr(data.month.costUsd, rate)} of a ${usd(caps.monthlyCapUsd)} cap, day ${data.month.daysElapsed} of ${data.month.daysInMonth}`}
              pct={monthPct}
              danger={monthPct >= 90}
            />
            <StatCard
              title="Today"
              value={usd(data.today.costUsd)}
              sub={`${data.today.calls} calls, ${compact(data.today.tokens)} tokens, cap ${usd(caps.dailyCapUsd)}`}
              pct={dayPct}
              danger={dayPct >= 90}
            />
          </Box>

          {projectedOver && (
            <Alert severity="warning" sx={{ borderRadius: 2 }}>
              At today&apos;s pace this month lands near <strong>{usd(data.month.projectedUsd)}</strong>{' '}
              ({inr(data.month.projectedUsd, rate)}), over the {usd(caps.monthlyCapUsd)} cap. The cap
              will start refusing calls before that happens. Switch the most expensive features below
              to Manual, or raise the cap deliberately.
            </Alert>
          )}

          {data.priceCheck.unpricedModels.length > 0 && (
            <Alert severity="warning" sx={{ borderRadius: 2 }}>
              No price on record for {data.priceCheck.unpricedModels.join(', ')}, so those calls are
              missing from the totals above and the cap is under-counting. Add them to
              packages/ai/src/pricing.ts.
            </Alert>
          )}

          {data.today.blockedCalls > 0 && (
            <Alert severity="info" sx={{ borderRadius: 2 }}>
              {data.today.blockedCalls} call{data.today.blockedCalls === 1 ? ' was' : 's were'} held
              back today by a cap or a Manual switch. That is the controls working, not an error.
            </Alert>
          )}

          {/* ── Per feature, with its switch ────────────────────────────── */}
          <Paper
            elevation={0}
            sx={{
              borderRadius: 3,
              border: `1px solid ${theme.palette.divider}`,
              overflow: 'hidden',
            }}
          >
            <Box sx={{ p: { xs: 2, sm: 2.5 }, bgcolor: alpha(theme.palette.primary.main, 0.04) }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Where the money goes
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Sorted by spend this month. Auto calls Gemini. Manual hands whoever pressed the
                button the prompt to run themselves, and costs nothing. Off refuses.
              </Typography>
            </Box>
            <Divider />

            {groups.map((g, gi) => {
              const Icon = APP_ICON[g.app] ?? SchoolOutlinedIcon;
              return (
                <Box key={g.group}>
                  {gi > 0 && <Divider />}
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    sx={{ px: { xs: 2, sm: 2.5 }, pt: 2, pb: 0.5 }}
                  >
                    <Icon fontSize="small" color="primary" />
                    <Typography
                      variant="overline"
                      sx={{ fontWeight: 700, color: 'text.secondary', letterSpacing: 0.6 }}
                    >
                      {g.group}
                    </Typography>
                  </Stack>

                  {g.rows.map((row) => (
                    <FeatureUsageRow
                      key={row.featureId}
                      row={row}
                      mode={modes[row.featureId] ?? row.mode}
                      rate={rate}
                      onMode={(mode) => {
                        setModes((prev) => ({ ...prev, [row.featureId]: mode }));
                        setMessage(null);
                      }}
                    />
                  ))}
                </Box>
              );
            })}
          </Paper>

          {data.orphans.length > 0 && (
            <Paper
              elevation={0}
              sx={{ borderRadius: 3, border: `1px solid ${theme.palette.divider}`, p: 2.5 }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                Spent by features no longer in the registry
              </Typography>
              <Typography variant="caption" color="text.secondary">
                These ids were logged but are not in packages/ai/src/features.ts any more, usually a
                rename. Their spend still counts towards the caps above.
              </Typography>
              <Stack spacing={0.5} sx={{ mt: 1.5 }}>
                {data.orphans.map((o) => (
                  <Typography key={o.featureId} variant="body2">
                    {o.featureId}: {o.calls} calls, {usd(o.costUsd)}
                  </Typography>
                ))}
              </Stack>
            </Paper>
          )}

          {/* ── Models ─────────────────────────────────────────────────── */}
          {data.byModel.length > 0 && (
            <Paper
              elevation={0}
              sx={{ borderRadius: 3, border: `1px solid ${theme.palette.divider}`, p: 2.5 }}
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
                By model
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Which model actually answered. A fallback can cost more than the model asked for, so
                an unexpected name here is worth chasing.
              </Typography>
              <Stack spacing={1} sx={{ mt: 2 }}>
                {data.byModel.map((m) => (
                  <Stack
                    key={m.model}
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{ minHeight: 36 }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {m.model}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {m.calls} calls, {usd(m.costUsd)}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            </Paper>
          )}

          {/* ── Recent calls ───────────────────────────────────────────── */}
          <Paper
            elevation={0}
            sx={{
              borderRadius: 3,
              border: `1px solid ${theme.palette.divider}`,
              overflow: 'hidden',
            }}
          >
            <Box sx={{ p: { xs: 2, sm: 2.5 } }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Last 50 calls
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Including the ones a cap refused.
              </Typography>
            </Box>
            <Divider />
            {/* Wide content scrolls inside its own box so the page never does. */}
            <Box sx={{ overflowX: 'auto' }}>
              <Box sx={{ minWidth: 640 }}>
                {data.recent.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ p: 2.5 }}>
                    Nothing logged yet. The first AI call anywhere in the four apps will appear here.
                  </Typography>
                ) : (
                  data.recent.map((e) => (
                    <Stack
                      key={e.id}
                      direction="row"
                      alignItems="center"
                      spacing={2}
                      sx={{
                        px: { xs: 2, sm: 2.5 },
                        py: 1,
                        minHeight: 48,
                        borderTop: `1px solid ${theme.palette.divider}`,
                      }}
                    >
                      <Typography variant="body2" sx={{ flex: 1, fontWeight: 600 }}>
                        {e.label}
                      </Typography>
                      <Chip
                        size="small"
                        label={e.status}
                        color={STATUS_COLOR[e.status] ?? 'default'}
                        variant="outlined"
                        sx={{ fontWeight: 600 }}
                      />
                      <Typography variant="caption" color="text.secondary" sx={{ width: 150 }}>
                        {e.model ?? '-'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ width: 70 }}>
                        {compact(e.tokens)} tok
                      </Typography>
                      <Typography variant="caption" sx={{ width: 80, fontWeight: 600 }}>
                        {usd(e.costUsd)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ width: 120 }}>
                        {new Date(e.createdAt).toLocaleString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Typography>
                    </Stack>
                  ))
                )}
              </Box>
            </Box>
          </Paper>

          {/* ── Caps ───────────────────────────────────────────────────── */}
          <Paper
            elevation={0}
            sx={{ borderRadius: 3, border: `1px solid ${theme.palette.divider}`, p: { xs: 2, sm: 2.5 } }}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
              Limits
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Checked before every AI call in every app. Set a project spend cap in the Google
              console too: that one still holds if this code has a bug.
            </Typography>

            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={2}
              sx={{ mt: 2.5, mb: 2 }}
            >
              <TextField
                label="Monthly cap (USD)"
                type="number"
                size="small"
                fullWidth
                value={caps.monthlyCapUsd}
                onChange={(e) => {
                  setCaps((p) => ({ ...p, monthlyCapUsd: Number(e.target.value) }));
                  setMessage(null);
                }}
                inputProps={{ min: 0, step: 1, 'aria-label': 'Monthly cap in US dollars' }}
              />
              <TextField
                label="Daily cap (USD)"
                type="number"
                size="small"
                fullWidth
                value={caps.dailyCapUsd}
                onChange={(e) => {
                  setCaps((p) => ({ ...p, dailyCapUsd: Number(e.target.value) }));
                  setMessage(null);
                }}
                inputProps={{ min: 0, step: 0.5, 'aria-label': 'Daily cap in US dollars' }}
              />
              <TextField
                label="Rupees per dollar"
                type="number"
                size="small"
                fullWidth
                value={caps.usdToInr}
                onChange={(e) => {
                  setCaps((p) => ({ ...p, usdToInr: Number(e.target.value) }));
                  setMessage(null);
                }}
                helperText="Display only"
                inputProps={{ min: 1, step: 1, 'aria-label': 'Rupees per US dollar' }}
              />
            </Stack>

            <Divider sx={{ my: 2 }} />

            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ minHeight: 48 }}>
              <Box sx={{ pr: 2 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  AI enabled
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  The kill switch. Off stops every AI call in all four apps at once.
                </Typography>
              </Box>
              <Switch
                checked={masterEnabled}
                onChange={(e) => {
                  setMasterEnabled(e.target.checked);
                  setMessage(null);
                }}
                inputProps={{ 'aria-label': 'Enable AI across all apps' }}
              />
            </Stack>
          </Paper>
        </Stack>
      ) : null}

      {/* Sticky save bar, same as the Features page. */}
      {data && (
        <Paper
          elevation={3}
          sx={{
            position: 'fixed',
            bottom: { xs: 72, sm: 16 },
            left: { xs: 12, sm: 'auto' },
            right: { xs: 12, sm: 24 },
            p: 1.5,
            borderRadius: 3,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            border: `1px solid ${theme.palette.divider}`,
            zIndex: 10,
          }}
        >
          {message ? (
            <Alert severity={message.type} sx={{ flex: 1, py: 0, borderRadius: 2 }}>
              {message.text}
            </Alert>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ flex: 1, pl: 1 }}>
              {dirty ? 'You have unsaved changes.' : 'All changes saved.'}
            </Typography>
          )}
          <Button
            variant="contained"
            disabled={saving || !dirty}
            onClick={handleSave}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveOutlinedIcon />}
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, minHeight: 44, px: 3 }}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </Paper>
      )}
    </Box>
  );
}

function StatCard({
  title,
  value,
  sub,
  pct,
  danger,
}: {
  title: string;
  value: string;
  sub: string;
  pct: number;
  danger: boolean;
}) {
  const theme = useTheme();
  return (
    <Paper
      elevation={0}
      sx={{ borderRadius: 3, border: `1px solid ${theme.palette.divider}`, p: 2.5 }}
    >
      <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
      <Typography variant="h5" sx={{ fontWeight: 700, my: 0.5 }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        {sub}
      </Typography>
      <LinearProgress
        variant="determinate"
        value={pct}
        color={danger ? 'error' : 'primary'}
        sx={{ height: 6, borderRadius: 3 }}
        aria-label={`${title}: ${Math.round(pct)} percent of cap used`}
      />
    </Paper>
  );
}

function FeatureUsageRow({
  row,
  mode,
  rate,
  onMode,
}: {
  row: FeatureRow;
  mode: AiMode;
  rate: number;
  onMode: (mode: AiMode) => void;
}) {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      alignItems={{ xs: 'stretch', sm: 'center' }}
      spacing={{ xs: 1, sm: 2 }}
      sx={{ px: { xs: 2, sm: 2.5 }, py: 1.25, minHeight: 48 }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {row.label}
          </Typography>
          {row.trigger === 'public' && (
            <Chip size="small" label="public" variant="outlined" sx={{ height: 20, fontSize: 11 }} />
          )}
          {row.trigger === 'cron' && (
            <Chip size="small" label="cron" variant="outlined" sx={{ height: 20, fontSize: 11 }} />
          )}
        </Stack>
        <Typography variant="caption" color="text.secondary">
          {row.calls === 0
            ? 'No calls this month'
            : `${row.calls} calls, ${compact(row.tokens)} tokens, ${usd(row.avgCostUsd)} each`}
          {row.blockedCalls > 0 ? `, ${row.blockedCalls} held back` : ''}
        </Typography>
      </Box>

      <Box sx={{ textAlign: { xs: 'left', sm: 'right' }, minWidth: 96 }}>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          {usd(row.costUsd)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {inr(row.costUsd, rate)}
        </Typography>
      </Box>

      <Select
        size="small"
        value={mode}
        onChange={(e) => onMode(e.target.value as AiMode)}
        inputProps={{ 'aria-label': `Mode for ${row.label}` }}
        sx={{ minWidth: 116, minHeight: 48 }}
      >
        <MenuItem value="auto">Auto</MenuItem>
        {/* A visitor cannot be handed a prompt to run, so public chatbots have
            no Manual state. Offering one would produce a dead end. */}
        {row.supportsManual && <MenuItem value="manual">Manual</MenuItem>}
        <MenuItem value="off">Off</MenuItem>
      </Select>
    </Stack>
  );
}

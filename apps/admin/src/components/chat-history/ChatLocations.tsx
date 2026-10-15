'use client';

/**
 * Chat History > Locations: where Aintra's chatters are.
 *
 * Counts chat sessions (one visitor), not messages. Places come from
 * Cloudflare's location headers at chat time, or for older chats by signed-in
 * students, from their application form. Older guest chats have no place, and
 * the "No location" row says so instead of hiding them.
 */

import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Chip, Grid, Paper, Stack, Tooltip, Typography } from '@neram/ui';
import PublicIcon from '@mui/icons-material/Public';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ClearIcon from '@mui/icons-material/Clear';
import IndiaStateMap from './IndiaStateMap';
import { EmptyState, FOCUS_RING, OpsSkeleton, TARGET_44 } from '@/components/ops/OpsUi';
import type { ChatGeoSummary } from '@/lib/chat-geo';

export type LocationRange = '30d' | '6m' | 'all';

const RANGES: { key: LocationRange; label: string }[] = [
  { key: '30d', label: 'Last 30 days' },
  { key: '6m', label: 'Last 6 months' },
  { key: 'all', label: 'Lifetime' },
];

const IST = '+05:30';

/** The [from, to) window for a preset, or for the page's own From/To dates when set. */
export function locationWindow(
  range: LocationRange,
  dateFrom: string,
  dateTo: string,
  now = new Date()
): { from: string | null; to: string | null } {
  if (dateFrom || dateTo) {
    let to: string | null = null;
    if (dateTo) {
      const end = new Date(`${dateTo}T00:00:00${IST}`);
      end.setUTCDate(end.getUTCDate() + 1);
      to = end.toISOString();
    }
    return { from: dateFrom ? new Date(`${dateFrom}T00:00:00${IST}`).toISOString() : null, to };
  }
  if (range === 'all') return { from: null, to: null };
  const from = new Date(now);
  if (range === '30d') from.setDate(from.getDate() - 30);
  else from.setMonth(from.getMonth() - 6);
  return { from: from.toISOString(), to: null };
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

interface RankRow {
  key: string;
  label: string;
  sublabel?: string | null;
  value: number;
  muted?: boolean;
  selected?: boolean;
  onClick?: () => void;
}

function RankedList({ rows, max, total, unit }: { rows: RankRow[]; max: number; total: number; unit: string }) {
  return (
    <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0 }}>
      {rows.map((r) => {
        const inner = (
          <>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, width: '100%' }}>
              <Typography
                variant="body2"
                fontWeight={r.muted ? 400 : 600}
                color={r.muted ? 'text.secondary' : 'text.primary'}
                noWrap
                sx={{ minWidth: 0 }}
              >
                {r.label}
              </Typography>
              {r.sublabel && (
                <Typography variant="caption" color="text.secondary" noWrap sx={{ minWidth: 0 }}>
                  {r.sublabel}
                </Typography>
              )}
              <Typography variant="body2" fontWeight={600} sx={{ ml: 'auto', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                {r.value}
                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.75 }}>
                  {pct(r.value, total)}%
                </Typography>
              </Typography>
            </Box>
            <Box sx={{ mt: 0.5, height: 6, borderRadius: 3, bgcolor: 'grey.100', overflow: 'hidden', width: '100%' }}>
              <Box
                sx={{
                  height: '100%',
                  width: `${max > 0 ? Math.max(2, (r.value / max) * 100) : 0}%`,
                  bgcolor: r.muted ? 'grey.400' : 'primary.main',
                  borderRadius: 3,
                }}
              />
            </Box>
          </>
        );
        return (
          <Box component="li" key={r.key}>
            {r.onClick ? (
              <Box
                component="button"
                type="button"
                onClick={r.onClick}
                aria-pressed={!!r.selected}
                aria-label={`${r.label}: ${r.value} ${unit}`}
                sx={{
                  ...TARGET_44,
                  ...FOCUS_RING,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  width: '100%',
                  px: 1,
                  py: 0.75,
                  border: 0,
                  borderRadius: 1,
                  font: 'inherit',
                  textAlign: 'left',
                  cursor: 'pointer',
                  bgcolor: r.selected ? 'action.selected' : 'transparent',
                  '&:hover': { bgcolor: r.selected ? 'action.selected' : 'action.hover' },
                }}
              >
                {inner}
              </Box>
            ) : (
              <Box sx={{ ...TARGET_44, display: 'flex', flexDirection: 'column', justifyContent: 'center', px: 1, py: 0.75 }}>
                {inner}
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

function Kpi({ label, value, hint, info }: { label: string; value: string; hint?: string; info?: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: 'uppercase', letterSpacing: 0.4 }}>
          {label}
        </Typography>
        {info && (
          <Tooltip title={info} arrow>
            <InfoOutlinedIcon tabIndex={0} aria-label={info} sx={{ fontSize: 16, color: 'text.secondary', ...FOCUS_RING }} />
          </Tooltip>
        )}
      </Box>
      <Typography variant="h5" fontWeight={700} sx={{ mt: 0.5, fontVariantNumeric: 'tabular-nums' }} noWrap>
        {value}
      </Typography>
      {hint && (
        <Typography variant="caption" color="text.secondary" noWrap component="p">
          {hint}
        </Typography>
      )}
    </Paper>
  );
}

const TOP = 10;

export default function ChatLocations({
  source,
  dateFrom,
  dateTo,
  onClearDates,
}: {
  source: string;
  dateFrom: string;
  dateTo: string;
  onClearDates: () => void;
}) {
  const [range, setRange] = useState<LocationRange>('6m');
  const [data, setData] = useState<ChatGeoSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [showAllStates, setShowAllStates] = useState(false);
  const [showAllCities, setShowAllCities] = useState(false);
  const custom = !!(dateFrom || dateTo);

  useEffect(() => {
    let cancelled = false;
    const { from, to } = locationWindow(range, dateFrom, dateTo);
    const params = new URLSearchParams({
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(source ? { source } : {}),
    });
    setData(null);
    setError(null);
    fetch(`/api/chatbot-logs/geo?${params}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((json: ChatGeoSummary) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load locations. Try again in a moment.');
      });
    return () => {
      cancelled = true;
    };
  }, [range, dateFrom, dateTo, source]);

  const mapValues = useMemo(() => {
    const v: Record<string, number> = {};
    for (const s of data?.states ?? []) if (s.slug) v[s.slug] = s.sessions;
    return v;
  }, [data]);
  const mapNames = useMemo(() => {
    const n: Record<string, string> = {};
    for (const s of data?.states ?? []) if (s.slug) n[s.slug] = s.name;
    return n;
  }, [data]);

  const t = data?.totals;
  const topState = data?.states[0];
  const selectedName = selectedState ? (mapNames[selectedState] ?? selectedState) : null;

  const stateRows: RankRow[] = (data?.states ?? []).map((s) => ({
    key: s.slug ?? s.name,
    label: s.name,
    value: s.sessions,
    selected: !!s.slug && s.slug === selectedState,
    onClick: s.slug ? () => setSelectedState((cur) => (cur === s.slug ? null : s.slug)) : undefined,
  }));
  const visibleStates = showAllStates ? stateRows : stateRows.slice(0, TOP);
  const tailRows: RankRow[] = [];
  if (t?.indiaNoState) tailRows.push({ key: 'in-no-state', label: 'India, state unknown', value: t.indiaNoState, muted: true });
  if (t?.abroad) {
    const countries = (data?.countries ?? []).filter((c) => c.code !== 'IN').map((c) => `${c.name} ${c.sessions}`).join(', ');
    tailRows.push({ key: 'abroad', label: 'Outside India', sublabel: countries, value: t.abroad, muted: true });
  }
  if (t?.unknown) tailRows.push({ key: 'unknown', label: 'No location', sublabel: 'older guest chats', value: t.unknown, muted: true });

  const cityRows: RankRow[] = (data?.cities ?? [])
    .filter((c) => !selectedState || c.stateSlug === selectedState)
    .map((c) => ({ key: `${c.city}|${c.region}`, label: c.city, sublabel: c.region, value: c.sessions }));
  const visibleCities = showAllCities ? cityRows : cityRows.slice(0, TOP);

  const stateMax = Math.max(0, ...stateRows.map((r) => r.value), ...tailRows.map((r) => r.value));
  const cityMax = Math.max(0, ...cityRows.map((r) => r.value));
  const total = t?.sessions ?? 0;

  const trackingNote = data?.trackingSince
    ? `Live locations are recorded from ${fmtDate(data.trackingSince)}. Earlier places come from signed-in students' application forms; older guest chats have none.`
    : 'Live locations start with the next chat after this release. Places shown so far come from signed-in students’ application forms.';

  return (
    <Box>
      {/* Range */}
      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', rowGap: 1 }} role="group" aria-label="Date range">
        {RANGES.map((r) => (
          <Chip
            key={r.key}
            label={r.label}
            clickable
            color={!custom && range === r.key ? 'primary' : 'default'}
            variant={!custom && range === r.key ? 'filled' : 'outlined'}
            aria-pressed={!custom && range === r.key}
            onClick={() => {
              setRange(r.key);
              if (custom) onClearDates();
            }}
            sx={{ ...TARGET_44, px: 0.5, borderRadius: 999 }}
          />
        ))}
        {custom && (
          <Chip
            label={`Custom: ${dateFrom || 'start'} to ${dateTo || 'today'}`}
            color="primary"
            onDelete={onClearDates}
            deleteIcon={<ClearIcon aria-label="Clear custom dates" />}
            sx={{ ...TARGET_44, borderRadius: 999 }}
          />
        )}
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* KPIs */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        {!data && !error
          ? [0, 1, 2, 3].map((i) => (
              <Grid item xs={12} sm={6} md={3} key={i}>
                <OpsSkeleton variant="rounded" height={96} />
              </Grid>
            ))
          : t && (
              <>
                <Grid item xs={12} sm={6} md={3}>
                  <Kpi label="Chatters" value={String(t.sessions)} hint={`${t.messages} messages`} />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Kpi
                    label="With a location"
                    value={`${pct(t.located, t.sessions)}%`}
                    hint={`${t.located} of ${t.sessions} chatters`}
                    info={trackingNote}
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Kpi label="India / abroad" value={`${t.india} / ${t.abroad}`} hint="located chatters" />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Kpi
                    label="Top state"
                    value={topState ? topState.name : 'None yet'}
                    hint={topState ? `${topState.sessions} chatters, ${pct(topState.sessions, t.located)}% of located` : undefined}
                  />
                </Grid>
              </>
            )}
      </Grid>

      {!data && !error && (
        <Grid container spacing={2}>
          <Grid item xs={12} md={7}>
            <OpsSkeleton variant="rounded" height={520} />
          </Grid>
          <Grid item xs={12} md={5}>
            <OpsSkeleton variant="rounded" height={520} />
          </Grid>
        </Grid>
      )}

      {data && t && t.located === 0 && (
        <EmptyState
          icon={PlaceOutlinedIcon}
          title="No located chats in this range yet"
          body={`${t.sessions} chatters in this range, none with a place. ${trackingNote}`}
        />
      )}

      {data && t && t.located > 0 && (
        <Grid container spacing={2}>
          <Grid item xs={12} md={7}>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, minHeight: 32 }}>
                <Typography variant="subtitle1" fontWeight={700} component="h2">
                  Chatters by state
                </Typography>
                {selectedName && (
                  <Chip
                    size="small"
                    label={selectedName}
                    onDelete={() => setSelectedState(null)}
                    deleteIcon={<ClearIcon aria-label="Show all states" />}
                    sx={{ ml: 'auto' }}
                  />
                )}
              </Box>
              <IndiaStateMap values={mapValues} names={mapNames} selected={selectedState} onSelect={setSelectedState} />
              <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
                Select a state to see its cities. Boundaries: DataMeet India, CC BY 4.0.
              </Typography>
            </Paper>
          </Grid>

          <Grid item xs={12} md={5}>
            <Stack spacing={2}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Typography variant="subtitle1" fontWeight={700} component="h2" sx={{ mb: 0.5 }}>
                  Top states
                </Typography>
                <RankedList rows={[...visibleStates, ...tailRows]} max={stateMax} total={total} unit="chatters" />
                {stateRows.length > TOP && (
                  <Button size="small" onClick={() => setShowAllStates((v) => !v)} sx={{ mt: 0.5, ...TARGET_44 }}>
                    {showAllStates ? 'Show top 10' : `Show all ${stateRows.length}`}
                  </Button>
                )}
              </Paper>

              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <PublicIcon fontSize="small" color="action" aria-hidden />
                  <Typography variant="subtitle1" fontWeight={700} component="h2">
                    {selectedName ? `Cities in ${selectedName}` : 'Top cities'}
                  </Typography>
                </Box>
                {cityRows.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                    {selectedName ? `No city recorded for ${selectedName} in this range.` : 'No city recorded in this range.'}
                  </Typography>
                ) : (
                  <RankedList rows={visibleCities} max={cityMax} total={total} unit="chatters" />
                )}
                {cityRows.length > TOP && (
                  <Button size="small" onClick={() => setShowAllCities((v) => !v)} sx={{ mt: 0.5, ...TARGET_44 }}>
                    {showAllCities ? 'Show top 10' : `Show all ${cityRows.length}`}
                  </Button>
                )}
              </Paper>
            </Stack>
          </Grid>
        </Grid>
      )}
    </Box>
  );
}

'use client';

/**
 * Marketing Intelligence: Campaigns. The Google Ads data the agent reasons
 * over, by campaign, ad group, keyword, search term, ad, device, time of day
 * and city. Search terms
 * carry the AI's intent label. One tab level; ?tab= keeps it linkable.
 * Desktop first. Entered from the sidebar; Back goes to the Overview.
 */
import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Alert, Box, Button, Paper, Tab, Tabs, ToggleButton, ToggleButtonGroup, Typography } from '@neram/ui';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import { OpsPageHeader, OpsSkeleton, StatusChip, TARGET_44 } from '@/components/ops/OpsUi';
import { AdminOnly } from '@/components/marketing-ai/Parts';
import HoursGrid from '@/components/marketing-ai/HoursGrid';
import { api, inr, INTENT_LABEL, num, pct } from '@/components/marketing-ai/format';

const TABS = [
  { value: 'campaign', label: 'Campaigns' },
  { value: 'ad_group', label: 'Ad groups' },
  { value: 'keyword', label: 'Keywords' },
  { value: 'search_term', label: 'Search terms' },
  { value: 'ad', label: 'Ads' },
  { value: 'hour', label: 'Hours' },
  { value: 'geo', label: 'Areas' },
  { value: 'device', label: 'Devices' },
] as const;
type TabValue = (typeof TABS)[number]['value'];

const metricCols: GridColDef[] = [
  { field: 'impressions', headerName: 'Impr.', type: 'number', width: 90, valueFormatter: ({ value }) => num(value) },
  { field: 'clicks', headerName: 'Clicks', type: 'number', width: 80, valueFormatter: ({ value }) => num(value) },
  { field: 'ctr', headerName: 'CTR', type: 'number', width: 80, valueFormatter: ({ value }) => pct(value) },
  { field: 'cost', headerName: 'Cost', type: 'number', width: 100, valueFormatter: ({ value }) => inr(value) },
  { field: 'cpc', headerName: 'CPC', type: 'number', width: 80, valueFormatter: ({ value }) => inr(value) },
  { field: 'conversions', headerName: 'Conv.', type: 'number', width: 80, valueFormatter: ({ value }) => num(value, 1) },
  { field: 'cpa', headerName: 'Cost / conv.', type: 'number', width: 110, valueFormatter: ({ value }) => (value === null ? 'none' : inr(value)) },
  { field: 'convRate', headerName: 'Conv. rate', type: 'number', width: 100, valueFormatter: ({ value }) => pct(value) },
];

const STATUS_COL: GridColDef = { field: 'status', headerName: 'Status', width: 110, valueFormatter: ({ value }) => (value ? String(value).toLowerCase() : '') };

const COLUMNS: Record<TabValue, GridColDef[]> = {
  campaign: [
    { field: 'campaign_name', headerName: 'Campaign', flex: 1, minWidth: 200 },
    STATUS_COL,
    { field: 'budget_micros', headerName: 'Budget / day', type: 'number', width: 120, valueFormatter: ({ value }) => (value ? inr(value / 1e6) : '') },
    { field: 'primary_status', headerName: 'Google says', width: 200, valueFormatter: ({ value }) => (value ? String(value).replace(/\|/g, ', ').replace(/_/g, ' ').toLowerCase() : '') },
    ...metricCols,
  ],
  ad_group: [{ field: 'ad_group_name', headerName: 'Ad group', flex: 1, minWidth: 180 }, { field: 'campaign_name', headerName: 'Campaign', width: 180 }, STATUS_COL, ...metricCols],
  keyword: [
    { field: 'text', headerName: 'Keyword', flex: 1, minWidth: 200 },
    { field: 'match_type', headerName: 'Match', width: 90, valueFormatter: ({ value }) => (value ? String(value).toLowerCase() : '') },
    { field: 'ad_group_name', headerName: 'Ad group', width: 150 },
    STATUS_COL,
    ...metricCols,
  ],
  search_term: [
    { field: 'text', headerName: 'Search term', flex: 1, minWidth: 220 },
    {
      field: 'intent',
      headerName: 'AI intent',
      width: 170,
      sortable: false,
      valueGetter: ({ value }) => value?.intent ?? '',
      renderCell: ({ row }) => {
        const i = row.intent && INTENT_LABEL[row.intent.intent];
        return i ? <StatusChip icon={PsychologyOutlinedIcon} tone={i.tone} label={i.label} /> : <Typography variant="caption" color="text.secondary">not classified</Typography>;
      },
    },
    { field: 'ad_group_name', headerName: 'Ad group', width: 150 },
    ...metricCols,
  ],
  ad: [
    { field: 'text', headerName: 'Ad (first headline)', flex: 1, minWidth: 220 },
    { field: 'ad_group_name', headerName: 'Ad group', width: 150 },
    STATUS_COL,
    { field: 'strength', headerName: 'Ad strength', width: 120, valueGetter: ({ row }) => String(row.attributes?.ad_strength ?? '').toLowerCase().replace(/_/g, ' ') },
    { field: 'approval', headerName: 'Google review', width: 140, valueGetter: ({ row }) => String(row.attributes?.approval ?? '').toLowerCase().replace(/_/g, ' ') },
    ...metricCols,
  ],
  hour: [],
  geo: [{ field: 'text', headerName: 'City', flex: 1, minWidth: 180 }, { field: 'campaign_name', headerName: 'Campaign', width: 200 }, ...metricCols],
  device: [{ field: 'text', headerName: 'Device', width: 140, valueFormatter: ({ value }) => (value ? String(value).toLowerCase() : '') }, { field: 'campaign_name', headerName: 'Campaign', flex: 1, minWidth: 200 }, ...metricCols],
};

export default function CampaignsPage() {
  return (
    <Suspense fallback={<OpsSkeleton variant="rounded" height={400} />}>
      <CampaignsInner />
    </Suspense>
  );
}

function CampaignsInner() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = (TABS.find((t) => t.value === params.get('tab'))?.value ?? 'campaign') as TabValue;
  const [days, setDays] = useState(30);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    api(`/api/marketing-ai/entities?level=${tab}&days=${days}`)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError({ message: e.message, status: e.status }));
    return () => {
      cancelled = true;
    };
  }, [tab, days]);

  const rows = useMemo(() => (data?.items ?? []).map((r: any) => ({ id: r.key, ...r })), [data]);

  if (error?.status === 403) return <AdminOnly />;

  return (
    <Box>
      <OpsPageHeader
        icon={CampaignOutlinedIcon}
        title="Campaigns"
        subtitle={data ? `Google Ads data from ${data.window.from} to ${data.window.to}, as the agent sees it. Sorted by cost.` : 'Google Ads data, as the agent sees it.'}
        actions={
          <>
            <ToggleButtonGroup exclusive size="small" value={days} onChange={(_, v) => v && setDays(v)} aria-label="Time range">
              {[7, 14, 30].map((d) => (
                <ToggleButton key={d} value={d} sx={TARGET_44}>
                  {d} days
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <Button component={Link} href="/marketing-ai" sx={TARGET_44}>
              Back to overview
            </Button>
          </>
        }
      />

      <Tabs value={tab} onChange={(_, v) => router.replace(`${pathname}?tab=${v}`, { scroll: false })} variant="scrollable" allowScrollButtonsMobile sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }} aria-label="Level">
        {TABS.map((t) => (
          <Tab key={t.value} value={t.value} label={t.label} sx={TARGET_44} />
        ))}
      </Tabs>

      {tab === 'hour' && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          When ads spend, and when that turns into sign-ups. The agent suggests leaving out times that spend without results.
        </Typography>
      )}
      {tab === 'geo' && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Where the people who click are. Cities outside the area a campaign is meant for, with spend and no sign-ups, are worth excluding.
        </Typography>
      )}
      {tab === 'search_term' && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          The AI labels the costliest non-converting searches each morning. Labels are an interpretation; the numbers are from Google Ads.
        </Typography>
      )}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error.message}</Alert>}
      {!data && !error && <OpsSkeleton variant="rounded" height={480} />}
      {data && tab === 'hour' && <HoursGrid items={data.items} />}
      {data && tab !== 'hour' && (
        <Paper variant="outlined" sx={{ width: '100%', overflow: 'hidden' }}>
          <DataGrid
            rows={rows}
            columns={COLUMNS[tab]}
            autoHeight
            density="compact"
            disableRowSelectionOnClick
            pageSizeOptions={[25, 50, 100]}
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            localeText={{ noRowsLabel: 'No data for this period. Run an audit from the Overview.' }}
            sx={{ border: 0 }}
          />
        </Paper>
      )}
    </Box>
  );
}

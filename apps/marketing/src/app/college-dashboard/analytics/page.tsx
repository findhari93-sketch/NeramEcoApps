'use client';

import { useEffect, useState } from 'react';
import { Alert, Box, Skeleton, Stack, Typography } from '@mui/material';
import { useCollegeDashboard } from '../context';
import { Card, PageHeader } from '../ui';
import { LEAD_STATUSES } from '@/lib/college-dashboard/leads';

interface Analytics {
  page_views_7d: number;
  page_views_30d: number;
  page_views_90d: number;
  lead_count: number;
  leads_30d: number;
  leads_by_status: Record<string, number>;
  review_count: number;
  search_impressions_90d: number;
  top_queries: Array<{ query: string; impressions: number; clicks: number }>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Box sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
      <Typography sx={{ fontWeight: 700, fontSize: 24, lineHeight: 1.2 }}>{value.toLocaleString('en-IN')}</Typography>
      <Typography sx={{ fontSize: 13.5, color: 'text.secondary' }}>{label}</Typography>
    </Box>
  );
}

export default function CollegeAnalyticsPage() {
  const { api } = useCollegeDashboard();
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void api<Analytics>('/api/college-dashboard/analytics').then((r) => (r.ok ? setData(r.data) : setError(r.data.error ?? 'Could not load insights.')));
  }, [api]);

  const funnel = LEAD_STATUSES.map((s) => ({ ...s, count: data?.leads_by_status[s.value] ?? 0 }));
  const maxFunnel = Math.max(1, ...funnel.map((f) => f.count));

  return (
    <Stack gap={2.5}>
      <PageHeader title="Insights" intro="How students find your college page on Neram Classes and what happens with their enquiries." />
      {error && <Alert severity="error">{error}</Alert>}
      {!data && !error && <Skeleton variant="rounded" height={260} />}
      {data && (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5 }}>
            <Stat label="Page views, 7 days" value={data.page_views_7d} />
            <Stat label="Page views, 30 days" value={data.page_views_30d} />
            <Stat label="Page views, 90 days" value={data.page_views_90d} />
            <Stat label="Times shown on Google, 90 days" value={data.search_impressions_90d} />
          </Box>

          <Card>
            <Typography component="h2" sx={{ fontWeight: 700, fontSize: 18, mb: 0.5 }}>Enquiries and what happened</Typography>
            <Typography sx={{ fontSize: 14, color: 'text.secondary', mb: 2 }}>
              {data.lead_count} in total. Mark each enquiry on the Enquiries page so you can see how many students joined through Neram Classes.
            </Typography>
            <Stack gap={1.25}>
              {funnel.map((f) => (
                <Box key={f.value} sx={{ display: 'grid', gridTemplateColumns: '130px 1fr 40px', alignItems: 'center', gap: 1.5 }}>
                  <Typography sx={{ fontSize: 14 }}>{f.label}</Typography>
                  <Box sx={{ height: 10, borderRadius: 5, bgcolor: 'grey.100', overflow: 'hidden' }} aria-hidden>
                    <Box sx={{ height: '100%', width: `${(f.count / maxFunnel) * 100}%`, bgcolor: 'primary.main', borderRadius: 5 }} />
                  </Box>
                  <Typography sx={{ fontSize: 14, fontWeight: 700, textAlign: 'right' }}>{f.count}</Typography>
                </Box>
              ))}
            </Stack>
          </Card>

          <Card>
            <Typography component="h2" sx={{ fontWeight: 700, fontSize: 18, mb: 0.5 }}>What students searched on Google</Typography>
            <Typography sx={{ fontSize: 14, color: 'text.secondary', mb: 1.5 }}>
              Searches that showed your Neram Classes page in the last 90 days. Make sure your page answers them: fees, cutoffs, hostel and admission dates.
            </Typography>
            {data.top_queries.length === 0 ? (
              <Typography sx={{ fontSize: 14.5, color: 'text.secondary' }}>Not enough search data yet. It builds up as Google shows your page more often.</Typography>
            ) : (
              <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: 14.5 }}>
                <thead>
                  <tr>
                    <Box component="th" sx={{ textAlign: 'left', fontWeight: 600, py: 1, color: 'text.secondary' }}>Search</Box>
                    <Box component="th" sx={{ textAlign: 'right', fontWeight: 600, py: 1, color: 'text.secondary' }}>Shown</Box>
                    <Box component="th" sx={{ textAlign: 'right', fontWeight: 600, py: 1, color: 'text.secondary' }}>Clicks</Box>
                  </tr>
                </thead>
                <tbody>
                  {data.top_queries.map((q) => (
                    <Box component="tr" key={q.query} sx={{ borderTop: '1px solid', borderColor: 'divider' }}>
                      <Box component="td" sx={{ py: 1, pr: 1, overflowWrap: 'anywhere' }}>{q.query}</Box>
                      <Box component="td" sx={{ py: 1, textAlign: 'right' }}>{q.impressions}</Box>
                      <Box component="td" sx={{ py: 1, textAlign: 'right' }}>{q.clicks}</Box>
                    </Box>
                  ))}
                </tbody>
              </Box>
            )}
          </Card>
        </>
      )}
    </Stack>
  );
}

'use client';

/**
 * Leads by channel: which sources (Google, ChatGPT, WhatsApp ...) and which
 * city pages bring demo, callback, study-plan and visit leads. Desktop first.
 * Entered from the sidebar (People & CRM); Back goes to Leads.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, Box, Button, ToggleButton, ToggleButtonGroup, Typography, Paper, Table, TableBody, TableCell, TableHead, TableRow } from '@neram/ui';
import InsightsIcon from '@mui/icons-material/Insights';
import { OpsPageHeader, OpsSkeleton, EmptyState, TARGET_44 } from '@/components/ops/OpsUi';
import { LEAD_TABLES, type ChannelReport, type LeadTable } from '@/lib/lead-channels';

interface Response {
  days: number;
  missingColumns: LeadTable[];
  report: ChannelReport;
}

const TABLES = Object.keys(LEAD_TABLES) as LeadTable[];

export default function LeadChannelsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    fetch(`/api/leads/channels?days=${days}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Could not load the report');
        if (!cancelled) setData(body);
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [days]);

  const r = data?.report;

  return (
    <Box>
      <OpsPageHeader
        icon={InsightsIcon}
        title="Leads by channel"
        subtitle="Where demo, callback, study plan and centre visit leads came from, and the page they landed on."
        actions={
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <ToggleButtonGroup exclusive size="small" value={days} onChange={(_, v) => v && setDays(v)} aria-label="Time range">
              {[7, 30, 90].map((d) => (
                <ToggleButton key={d} value={d} sx={TARGET_44}>
                  {d} days
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <Button component={Link} href="/leads" sx={TARGET_44}>
              Back to leads
            </Button>
          </Box>
        }
      />

      {error && <Alert severity="error">{error}</Alert>}
      {data && data.missingColumns.length > 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Channel columns are not on this database yet for: {data.missingColumns.map((t) => LEAD_TABLES[t]).join(', ')}. Apply migration
          20261029090000.
        </Alert>
      )}

      {!data && !error && <OpsSkeleton variant="rounded" height={320} />}

      {r && r.total === 0 && (
        <EmptyState icon={InsightsIcon} title="No leads in this period" body="Leads record their channel from the day the new marketing build is live." />
      )}

      {r && r.total > 0 && (
        <Box sx={{ display: 'grid', gap: 2 }}>
          <Typography>
            {r.total} leads in the last {data!.days} days. AI assistants (ChatGPT, Perplexity, Claude, Gemini, Copilot) brought {r.aiShare}%.
          </Typography>

          <Paper variant="outlined">
            <Table size="small" aria-label="Leads by channel">
              <TableHead>
                <TableRow>
                  <TableCell>Channel</TableCell>
                  {TABLES.map((t) => (
                    <TableCell key={t} align="right">
                      {LEAD_TABLES[t]}
                    </TableCell>
                  ))}
                  <TableCell align="right">Total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {r.byChannel.map((c) => (
                  <TableRow key={c.channel}>
                    <TableCell>{c.label}</TableCell>
                    {TABLES.map((t) => (
                      <TableCell key={t} align="right">
                        {c.byTable[t] || ''}
                      </TableCell>
                    ))}
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      {c.total}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>

          <Paper variant="outlined">
            <Table size="small" aria-label="Leads by landing page">
              <TableHead>
                <TableRow>
                  <TableCell>Landing page</TableCell>
                  <TableCell align="right">Leads</TableCell>
                  <TableCell>Main channel</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {r.byPage.slice(0, 50).map((p) => (
                  <TableRow key={p.page}>
                    <TableCell>{p.page}</TableCell>
                    <TableCell align="right">{p.total}</TableCell>
                    <TableCell>{p.topChannel}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        </Box>
      )}
    </Box>
  );
}

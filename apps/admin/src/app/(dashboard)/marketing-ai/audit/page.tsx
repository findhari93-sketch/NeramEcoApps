'use client';

/**
 * Marketing Intelligence: Audit log. Every approval, rejection, change sent
 * to Google, undo, automatic action and settings change, newest first.
 * Desktop first. Entered from the sidebar; Back goes to the Overview.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, Box, Button, Paper, ToggleButton, ToggleButtonGroup } from '@neram/ui';
import { DataGrid, type GridColDef, type GridPaginationModel } from '@mui/x-data-grid';
import HistoryIcon from '@mui/icons-material/History';
import { OpsPageHeader, TARGET_44 } from '@/components/ops/OpsUi';
import { AdminOnly } from '@/components/marketing-ai/Parts';
import { api, when } from '@/components/marketing-ai/format';

const COLUMNS: GridColDef[] = [
  { field: 'created_at', headerName: 'When', width: 150, valueFormatter: ({ value }) => when(value) },
  { field: 'actor_name', headerName: 'Who', width: 170, valueGetter: ({ row }) => row.actor_name ?? (row.actor_type === 'admin' ? 'an admin' : row.actor_type) },
  { field: 'event', headerName: 'What', width: 210, valueFormatter: ({ value }) => String(value).replace(/[._]/g, ' ') },
  { field: 'entity', headerName: 'On', width: 180, valueGetter: ({ row }) => [row.entity_type, row.entity_id].filter(Boolean).join(': ') },
  { field: 'reason', headerName: 'Detail', flex: 1, minWidth: 260 },
  { field: 'result', headerName: 'Result', width: 100 },
];

export default function MarketingAiAuditPage() {
  const [actorType, setActorType] = useState('');
  const [page, setPage] = useState<GridPaginationModel>({ page: 0, pageSize: 50 });
  const [data, setData] = useState<{ items: any[]; total: number } | null>(null);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api(`/api/marketing-ai/audit-log?limit=${page.pageSize}&offset=${page.page * page.pageSize}${actorType ? `&actor_type=${actorType}` : ''}`)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError({ message: e.message, status: e.status }));
    return () => {
      cancelled = true;
    };
  }, [actorType, page]);

  if (error?.status === 403) return <AdminOnly />;

  return (
    <Box>
      <OpsPageHeader
        icon={HistoryIcon}
        title="Audit log"
        subtitle="Everything the agent and the admins did: decisions, changes sent to Google Ads, undos, automatic actions and settings."
        actions={
          <>
            <ToggleButtonGroup exclusive size="small" value={actorType} onChange={(_, v) => { if (v !== null) { setActorType(v); setPage((p) => ({ ...p, page: 0 })); } }} aria-label="Who">
              <ToggleButton value="" sx={TARGET_44}>Everyone</ToggleButton>
              <ToggleButton value="admin" sx={TARGET_44}>Admins</ToggleButton>
              <ToggleButton value="autopilot" sx={TARGET_44}>Autopilot</ToggleButton>
              <ToggleButton value="cron" sx={TARGET_44}>Nightly jobs</ToggleButton>
            </ToggleButtonGroup>
            <Button component={Link} href="/marketing-ai" sx={TARGET_44}>
              Back to overview
            </Button>
          </>
        }
      />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error.message}</Alert>}
      <Paper variant="outlined" sx={{ width: '100%', overflow: 'hidden' }}>
        <DataGrid
          rows={data?.items ?? []}
          columns={COLUMNS}
          loading={!data && !error}
          rowCount={data?.total ?? 0}
          paginationMode="server"
          paginationModel={page}
          onPaginationModelChange={setPage}
          pageSizeOptions={[50, 100]}
          autoHeight
          density="compact"
          disableRowSelectionOnClick
          getRowHeight={() => 'auto'}
          localeText={{ noRowsLabel: 'Nothing recorded yet.' }}
          sx={{ border: 0, '& .MuiDataGrid-cell': { py: 1, alignItems: 'flex-start', whiteSpace: 'normal', wordBreak: 'break-word' } }}
        />
      </Paper>
    </Box>
  );
}

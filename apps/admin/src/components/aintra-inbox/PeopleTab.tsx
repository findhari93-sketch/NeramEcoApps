'use client';

/**
 * People & leads: everyone who chatted with Aintra, one row each, with what
 * they asked about and how close they are to joining. "Open chat" jumps to
 * their latest conversation.
 */
import { useMemo } from 'react';
import { Box, Button, Chip, Typography } from '@neram/ui';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { INTENT_LABELS } from '@/lib/aintra-inbox/intents';
import { ACTIONABLE_STAGES, isRecent } from '@/lib/aintra-inbox/stage';
import type { InboxPerson } from '@/lib/aintra-inbox/types';
import type { Segment } from './ConversationList';
import { matchesSegment } from './ConversationList';
import { fmtDate, fmtTime, Pill, sourceLabelOf, STAGE_TONE, StatCard } from './ui';

export default function PeopleTab({
  people,
  loading,
  segment,
  onSegment,
  onOpenChat,
  now,
}: {
  people: InboxPerson[];
  loading: boolean;
  segment: Segment;
  onSegment: (s: Segment) => void;
  onOpenChat: (conversationId: string) => void;
  now: Date;
}) {
  const signedIn = people.filter((p) => !p.isGuest).length;
  const guests = people.length - signedIn;
  const hot = people.filter((p) => ACTIONABLE_STAGES.has(p.stage) && isRecent(p.lastAt, now)).length;
  const rows = useMemo(() => people.filter((p) => matchesSegment(p, segment)), [people, segment]);

  const columns: GridColDef<InboxPerson>[] = [
    {
      field: 'name',
      headerName: 'Person',
      flex: 1.2,
      minWidth: 180,
      renderCell: ({ row }) => (
        <Box sx={{ minWidth: 0, py: 1 }}>
          <Typography noWrap sx={{ fontSize: 14, fontWeight: row.isGuest ? 400 : 600, color: row.isGuest ? 'text.secondary' : 'text.primary' }}>
            {row.isGuest ? `Guest ${row.guestTag}` : row.name}
          </Typography>
          <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary' }}>
            {row.isGuest ? row.device ?? 'Device not recorded' : row.phone ?? row.email ?? 'No contact on file'}
          </Typography>
        </Box>
      ),
    },
    {
      field: 'isGuest',
      headerName: 'Account',
      width: 110,
      renderCell: ({ row }) => (row.isGuest ? <Pill>Guest</Pill> : <Pill tone="primary">Signed in</Pill>),
    },
    { field: 'place', headerName: 'Location', flex: 1, minWidth: 140, valueGetter: ({ row }) => row.place ?? 'Unknown' },
    { field: 'channel', headerName: 'Source', flex: 0.8, minWidth: 120, valueGetter: ({ row }) => sourceLabelOf(row.channel) },
    {
      field: 'lastAt',
      headerName: 'Last asked',
      flex: 1.6,
      minWidth: 220,
      renderCell: ({ row }) => (
        <Box sx={{ minWidth: 0, py: 1 }}>
          <Typography noWrap sx={{ fontSize: 14 }}>
            {row.lastQuestion}
          </Typography>
          <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary' }}>
            {fmtDate(row.lastAt)}, {fmtTime(row.lastAt)}
          </Typography>
        </Box>
      ),
    },
    {
      field: 'intents',
      headerName: 'Intent',
      flex: 1,
      minWidth: 140,
      sortable: false,
      valueGetter: ({ row }) => row.intents.slice(0, 3).map((i) => INTENT_LABELS[i]).join(', ') || 'None yet',
    },
    {
      field: 'stage',
      headerName: 'Stage',
      width: 120,
      renderCell: ({ row }) => <Typography sx={{ fontSize: 14, fontWeight: 600, ...STAGE_TONE[row.stage] }}>{row.stage}</Typography>,
    },
    {
      field: 'open',
      headerName: '',
      width: 120,
      sortable: false,
      filterable: false,
      renderCell: ({ row }) => (
        <Button size="small" onClick={() => onOpenChat(row.lastConversationId)} sx={{ minHeight: 44 }}>
          Open chat
        </Button>
      ),
    },
  ];

  const chips: { key: Segment; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: people.length },
    { key: 'user', label: 'Signed in', count: signedIn },
    { key: 'guest', label: 'Guests', count: guests },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
        <StatCard label="Signed-in users" value={loading ? '·' : signedIn} note="Full profile · can be called" />
        <StatCard label="Guests" value={loading ? '·' : guests} note="Anonymous · location and device only" />
        <StatCard label="Hot leads this week" value={loading ? '·' : hot} tone="primary" note="Asked fees, timings or booked a demo" />
      </Box>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }} role="group" aria-label="Who">
        {chips.map((c) => (
          <Chip
            key={c.key}
            label={`${c.label} · ${c.count}`}
            clickable
            onClick={() => onSegment(c.key)}
            color={segment === c.key ? 'primary' : 'default'}
            variant={segment === c.key ? 'filled' : 'outlined'}
            aria-pressed={segment === c.key}
            sx={{ minHeight: 36, fontWeight: 500 }}
          />
        ))}
      </Box>

      <Box sx={{ height: 640, bgcolor: 'background.paper', borderRadius: 3 }}>
        <DataGrid
          rows={rows}
          columns={columns}
          getRowId={(r) => r.key}
          loading={loading}
          getRowHeight={() => 'auto'}
          density="compact"
          pageSizeOptions={[25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 50 } } }}
          disableRowSelectionOnClick
          localeText={{ noRowsLabel: 'Nobody has chatted with Aintra in this group yet.' }}
          sx={{ borderRadius: 3, '& .MuiDataGrid-columnHeaderTitle': { fontWeight: 600 } }}
        />
      </Box>
    </Box>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Chip,
  CircularProgress,
  Alert,
  InputAdornment,
} from '@neram/ui';
import { DataGrid, GridColDef, GridToolbarExport, GridToolbarContainer } from '@mui/x-data-grid';
import SearchIcon from '@mui/icons-material/Search';
import PeopleIcon from '@mui/icons-material/People';
import ScoreboardIcon from '@mui/icons-material/Scoreboard';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import EventIcon from '@mui/icons-material/Event';

interface Registration {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string | null;
  state: string | null;
  nata_attempts: number;
  nata_score_1: number;
  nata_score_2: number | null;
  board_score: number;
  final_cutoff: number;
  college_preferences: string[];
  registered_at: string;
}

interface Stats {
  total: number;
  avg_cutoff: number;
  top_state: string | null;
  states: Record<string, number>;
}

interface EventData {
  id: string;
  year: number;
  title: string;
  status: string;
  event_date: string | null;
}

function ExportToolbar() {
  return (
    <GridToolbarContainer>
      <GridToolbarExport csvOptions={{ fileName: 'ask-seniors-registrations' }} />
    </GridToolbarContainer>
  );
}

const columns: GridColDef<Registration>[] = [
  {
    field: 'name',
    headerName: 'Name',
    width: 180,
  },
  {
    field: 'phone',
    headerName: 'Phone',
    width: 130,
  },
  {
    field: 'email',
    headerName: 'Email',
    width: 220,
  },
  {
    field: 'final_cutoff',
    headerName: 'Best NATA',
    width: 110,
    renderCell: ({ value }) => (
      <Box sx={{ fontWeight: 700, color: value >= 120 ? '#22c55e' : value >= 90 ? '#f59e0b' : '#ef4444' }}>
        {value}
      </Box>
    ),
  },
  {
    field: 'board_score',
    headerName: 'Board %',
    width: 90,
    renderCell: ({ value }) => `${value}%`,
  },
  {
    field: 'nata_attempts',
    headerName: 'Attempts',
    width: 90,
    renderCell: ({ value }) => (
      <Chip label={value} size="small" sx={{ fontSize: 11 }} />
    ),
  },
  {
    field: 'college_preferences',
    headerName: 'Colleges',
    width: 80,
    renderCell: ({ value }) => (
      <Chip label={Array.isArray(value) ? value.length : 0} size="small" color="primary" sx={{ fontSize: 11 }} />
    ),
  },
  {
    field: 'state',
    headerName: 'State',
    width: 150,
    renderCell: ({ value }) => value || '—',
  },
  {
    field: 'city',
    headerName: 'City',
    width: 130,
    renderCell: ({ value }) => value || '—',
  },
  {
    field: 'registered_at',
    headerName: 'Registered',
    width: 160,
    renderCell: ({ value }) =>
      value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '—',
  },
];

export default function AskSeniorsRegistrationsPage() {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (stateFilter) params.set('state', stateFilter);
      const res = await fetch(`/api/ask-seniors/registrations?${params}`);
      if (!res.ok) throw new Error('Failed to fetch registrations');
      const json = await res.json();
      setRegistrations(json.registrations ?? []);
      setStats(json.stats ?? null);
      setEvent(json.event ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [search, stateFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const topStates = stats
    ? Object.entries(stats.states)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
    : [];

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            #AskSeniors Registrations
          </Typography>
          {event && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
              <EventIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
              <Typography variant="body2" color="text.secondary">
                {event.title} ({event.year})
              </Typography>
              <Chip
                label={event.status}
                size="small"
                color={event.status === 'active' ? 'success' : event.status === 'upcoming' ? 'warning' : 'default'}
                sx={{ textTransform: 'capitalize' }}
              />
            </Box>
          )}
        </Box>
        <Button variant="outlined" size="small" onClick={fetchData} disabled={loading}>
          Refresh
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      {/* Stats cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 2, mb: 3 }}>
        <StatCard
          icon={<PeopleIcon />}
          label="Total Registered"
          value={stats?.total ?? 0}
          color="#2563eb"
        />
        <StatCard
          icon={<ScoreboardIcon />}
          label="Avg NATA Score"
          value={stats?.avg_cutoff ?? 0}
          color="#16a34a"
        />
        <StatCard
          icon={<LocationOnIcon />}
          label="Top State"
          value={stats?.top_state ?? '—'}
          color="#9333ea"
          isText
        />
      </Box>

      {/* Top states breakdown */}
      {topStates.length > 0 && (
        <Box sx={{ display: 'flex', gap: 1, mb: 3, flexWrap: 'wrap' }}>
          <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center', mr: 1 }}>
            States:
          </Typography>
          {topStates.map(([st, count]) => (
            <Chip
              key={st}
              label={`${st}: ${count}`}
              size="small"
              variant={stateFilter === st ? 'filled' : 'outlined'}
              color={stateFilter === st ? 'primary' : 'default'}
              onClick={() => setStateFilter(stateFilter === st ? '' : st)}
              sx={{ cursor: 'pointer' }}
            />
          ))}
        </Box>
      )}

      {/* Search */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
        <TextField
          placeholder="Search by name, email, or phone"
          size="small"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
          sx={{ width: 320 }}
        />
        {(search || stateFilter) && (
          <Button
            size="small"
            variant="text"
            onClick={() => { setSearch(''); setStateFilter(''); }}
          >
            Clear filters
          </Button>
        )}
      </Box>

      {/* Table */}
      <Box sx={{ height: 600, width: '100%' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <CircularProgress />
          </Box>
        ) : (
          <DataGrid
            rows={registrations}
            columns={columns}
            pageSizeOptions={[25, 50, 100]}
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            slots={{ toolbar: ExportToolbar }}
            disableRowSelectionOnClick
            sx={{
              '& .MuiDataGrid-row:hover': { bgcolor: 'action.hover' },
            }}
          />
        )}
      </Box>
    </Box>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
  isText = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  color: string;
  isText?: boolean;
}) {
  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, color }}>
        {icon}
        <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase" letterSpacing={0.5}>
          {label}
        </Typography>
      </Box>
      <Typography variant={isText ? 'h6' : 'h4'} fontWeight={800}>
        {value}
      </Typography>
    </Box>
  );
}

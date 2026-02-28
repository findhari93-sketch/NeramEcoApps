'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  Chip,
  Card,
  CardContent,
  Grid,
  Tabs,
  Tab,
  CircularProgress,
  Alert,
  TextField,
  IconButton,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import EventIcon from '@mui/icons-material/Event';
import PeopleIcon from '@mui/icons-material/People';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SaveIcon from '@mui/icons-material/Save';
import DataTable from '@/components/DataTable';
import type { DemoClassSlot, DemoSlotStatus } from '@neram/database';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div hidden={value !== index} {...other}>
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

export default function DemoClassesPage() {
  const router = useRouter();
  const [tabValue, setTabValue] = useState(0);
  const [slots, setSlots] = useState<DemoClassSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalSlots: 0,
    upcomingSlots: 0,
    totalRegistrations: 0,
    pendingApprovals: 0,
  });
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    fetchDemoSlots();
  }, [tabValue]);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings/demo-class');
      const data = await res.json();
      setYoutubeUrl(data.settings?.youtube_video_url || '');
    } catch {
      // ignore
    }
  };

  const saveYoutubeUrl = async () => {
    try {
      setSavingSettings(true);
      await fetch('/api/settings/demo-class', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtube_video_url: youtubeUrl }),
      });
    } catch {
      // ignore
    } finally {
      setSavingSettings(false);
    }
  };

  const fetchDemoSlots = async () => {
    try {
      setLoading(true);
      setError(null);

      const statusFilter = tabValue === 0
        ? 'scheduled,confirmed'
        : tabValue === 1
        ? 'conducted'
        : 'cancelled';

      const response = await fetch(`/api/demo-classes?status=${statusFilter}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch demo classes');
      }

      setSlots(data.slots || []);
      if (data.stats) {
        setStats(data.stats);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: DemoSlotStatus) => {
    switch (status) {
      case 'scheduled':
        return 'info';
      case 'confirmed':
        return 'success';
      case 'conducted':
        return 'default';
      case 'cancelled':
        return 'error';
      default:
        return 'default';
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  const columns = [
    {
      field: 'slot_date',
      headerName: 'Date',
      width: 150,
      renderCell: (params: { value: string }) => formatDate(params.value),
    },
    {
      field: 'slot_time',
      headerName: 'Time',
      width: 100,
      renderCell: (params: { value: string }) => formatTime(params.value),
    },
    { field: 'title', headerName: 'Title', width: 180 },
    {
      field: 'current_registrations',
      headerName: 'Registrations',
      width: 130,
      renderCell: (params: { row: DemoClassSlot }) => (
        <Typography variant="body2">
          {params.row.current_registrations} / {params.row.max_registrations}
        </Typography>
      ),
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 120,
      renderCell: (params: { value: DemoSlotStatus }) => (
        <Chip
          label={params.value}
          color={getStatusColor(params.value)}
          size="small"
        />
      ),
    },
    {
      field: 'demo_mode',
      headerName: 'Mode',
      width: 100,
      renderCell: (params: { value: string }) => (
        <Chip
          label={params.value}
          variant="outlined"
          size="small"
        />
      ),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 120,
      renderCell: (params: { row: DemoClassSlot }) => (
        <Button
          size="small"
          variant="outlined"
          onClick={() => router.push(`/demo-classes/${params.row.id}`)}
        >
          View
        </Button>
      ),
    },
  ];

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" component="h1" gutterBottom fontWeight="bold">
            Demo Classes
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage demo class slots and registrations
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => router.push('/demo-classes/create')}
        >
          Create Slot
        </Button>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <EventIcon color="primary" sx={{ fontSize: 40 }} />
              <Box>
                <Typography variant="h4" fontWeight="bold">
                  {stats.upcomingSlots}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Upcoming Slots
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <PeopleIcon color="info" sx={{ fontSize: 40 }} />
              <Box>
                <Typography variant="h4" fontWeight="bold">
                  {stats.totalRegistrations}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Total Registrations
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <CheckCircleIcon color="warning" sx={{ fontSize: 40 }} />
              <Box>
                <Typography variant="h4" fontWeight="bold">
                  {stats.pendingApprovals}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Pending Approvals
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <EventIcon color="success" sx={{ fontSize: 40 }} />
              <Box>
                <Typography variant="h4" fontWeight="bold">
                  {stats.totalSlots}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Total Slots
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* YouTube Video Setting */}
      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Typography variant="subtitle2" gutterBottom>
            Sample YouTube Video (shown on demo class booking page)
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <TextField
              size="small"
              fullWidth
              placeholder="https://www.youtube.com/watch?v=..."
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
            />
            <IconButton
              color="primary"
              onClick={saveYoutubeUrl}
              disabled={savingSettings}
            >
              {savingSettings ? <CircularProgress size={20} /> : <SaveIcon />}
            </IconButton>
          </Box>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
          <Tab label="Upcoming" />
          <Tab label="Completed" />
          <Tab label="Cancelled" />
        </Tabs>
      </Box>

      {/* Tab Panels */}
      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <TabPanel value={tabValue} index={0}>
            <DataTable
              rows={slots}
              columns={columns}
              onRowClick={(row) => router.push(`/demo-classes/${row.id}`)}
            />
            {slots.length === 0 && (
              <Box sx={{ textAlign: 'center', py: 8 }}>
                <Typography variant="body1" color="text.secondary" gutterBottom>
                  No upcoming demo classes
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => router.push('/demo-classes/create')}
                  sx={{ mt: 2 }}
                >
                  Create Your First Slot
                </Button>
              </Box>
            )}
          </TabPanel>

          <TabPanel value={tabValue} index={1}>
            <DataTable
              rows={slots}
              columns={columns}
              onRowClick={(row) => router.push(`/demo-classes/${row.id}`)}
            />
            {slots.length === 0 && (
              <Box sx={{ textAlign: 'center', py: 8 }}>
                <Typography variant="body1" color="text.secondary">
                  No completed demo classes yet
                </Typography>
              </Box>
            )}
          </TabPanel>

          <TabPanel value={tabValue} index={2}>
            <DataTable
              rows={slots}
              columns={columns}
              onRowClick={(row) => router.push(`/demo-classes/${row.id}`)}
            />
            {slots.length === 0 && (
              <Box sx={{ textAlign: 'center', py: 8 }}>
                <Typography variant="body1" color="text.secondary">
                  No cancelled demo classes
                </Typography>
              </Box>
            )}
          </TabPanel>
        </>
      )}
    </Box>
  );
}

'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  Chip,
  Tabs,
  Tab,
  Alert,
  CircularProgress,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Checkbox,
  Stack,
  Divider,
  Rating,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import SendIcon from '@mui/icons-material/Send';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import LinkIcon from '@mui/icons-material/Link';
import DataTable from '@/components/DataTable';
import type { DemoClassSlot, DemoClassRegistration, DemoSlotStats } from '@neram/database';

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

export default function DemoSlotDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [tabValue, setTabValue] = useState(0);
  const [slot, setSlot] = useState<DemoClassSlot | null>(null);
  const [registrations, setRegistrations] = useState<DemoClassRegistration[]>([]);
  const [stats, setStats] = useState<DemoSlotStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Dialogs
  const [confirmDialog, setConfirmDialog] = useState(false);
  const [meetingLink, setMeetingLink] = useState('');
  const [selectedRegistrations, setSelectedRegistrations] = useState<string[]>([]);

  useEffect(() => {
    fetchSlotData();
  }, [id]);

  const fetchSlotData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [slotRes, regRes, statsRes] = await Promise.all([
        fetch(`/api/demo-classes/${id}`),
        fetch(`/api/demo-classes/${id}/registrations`),
        fetch(`/api/demo-classes/${id}/stats`),
      ]);

      const slotData = await slotRes.json();
      const regData = await regRes.json();
      const statsData = await statsRes.json();

      if (!slotRes.ok) throw new Error(slotData.error);

      setSlot(slotData.slot);
      setRegistrations(regData.registrations || []);
      setStats(statsData.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (registrationId: string) => {
    try {
      setActionLoading(true);
      const response = await fetch(`/api/demo-classes/${id}/registrations/${registrationId}/approve`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error);
      }

      await fetchSlotData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve');
    } finally {
      setActionLoading(false);
    }
  };

  const handleBulkApprove = async () => {
    if (selectedRegistrations.length === 0) return;

    try {
      setActionLoading(true);
      const response = await fetch(`/api/demo-classes/${id}/registrations/bulk/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationIds: selectedRegistrations }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error);
      }

      setSelectedRegistrations([]);
      await fetchSlotData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmSlot = async () => {
    try {
      setActionLoading(true);
      const response = await fetch(`/api/demo-classes/${id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meeting_link: meetingLink }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error);
      }

      setConfirmDialog(false);
      await fetchSlotData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm slot');
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkAttendance = async (registrationId: string, attended: boolean) => {
    try {
      setActionLoading(true);
      const response = await fetch(`/api/demo-classes/${id}/registrations/${registrationId}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attended }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error);
      }

      await fetchSlotData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark attendance');
    } finally {
      setActionLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const formatTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'info';
      case 'confirmed': return 'success';
      case 'conducted': return 'default';
      case 'cancelled': return 'error';
      case 'pending': return 'warning';
      case 'approved': return 'success';
      case 'rejected': return 'error';
      case 'attended': return 'success';
      case 'no_show': return 'error';
      default: return 'default';
    }
  };

  const registrationColumns = [
    {
      field: 'select',
      headerName: '',
      width: 50,
      renderCell: (params: { row: DemoClassRegistration }) => (
        params.row.status === 'pending' ? (
          <Checkbox
            checked={selectedRegistrations.includes(params.row.id)}
            onChange={(e) => {
              if (e.target.checked) {
                setSelectedRegistrations([...selectedRegistrations, params.row.id]);
              } else {
                setSelectedRegistrations(selectedRegistrations.filter(id => id !== params.row.id));
              }
            }}
          />
        ) : null
      ),
    },
    { field: 'name', headerName: 'Name', width: 150 },
    { field: 'phone', headerName: 'Phone', width: 130 },
    { field: 'email', headerName: 'Email', width: 180 },
    { field: 'current_class', headerName: 'Class', width: 100 },
    { field: 'interest_course', headerName: 'Interest', width: 100 },
    {
      field: 'status',
      headerName: 'Status',
      width: 120,
      renderCell: (params: { value: string }) => (
        <Chip label={params.value} color={getStatusColor(params.value)} size="small" />
      ),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 150,
      renderCell: (params: { row: DemoClassRegistration }) => (
        <Stack direction="row" spacing={1}>
          {params.row.status === 'pending' && (
            <>
              <Button
                size="small"
                color="success"
                onClick={() => handleApprove(params.row.id)}
                disabled={actionLoading}
              >
                Approve
              </Button>
            </>
          )}
        </Stack>
      ),
    },
  ];

  const attendanceColumns = [
    { field: 'name', headerName: 'Name', width: 150 },
    { field: 'phone', headerName: 'Phone', width: 130 },
    {
      field: 'status',
      headerName: 'Status',
      width: 120,
      renderCell: (params: { value: string }) => (
        <Chip label={params.value} color={getStatusColor(params.value)} size="small" />
      ),
    },
    {
      field: 'attended',
      headerName: 'Attendance',
      width: 200,
      renderCell: (params: { row: DemoClassRegistration }) => {
        if (params.row.status !== 'approved' && params.row.status !== 'attended' && params.row.status !== 'no_show') {
          return <Typography variant="body2" color="text.secondary">-</Typography>;
        }
        return (
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              variant={params.row.attended === true ? 'contained' : 'outlined'}
              color="success"
              startIcon={<CheckCircleIcon />}
              onClick={() => handleMarkAttendance(params.row.id, true)}
              disabled={actionLoading}
            >
              Attended
            </Button>
            <Button
              size="small"
              variant={params.row.attended === false ? 'contained' : 'outlined'}
              color="error"
              startIcon={<CancelIcon />}
              onClick={() => handleMarkAttendance(params.row.id, false)}
              disabled={actionLoading}
            >
              No Show
            </Button>
          </Stack>
        );
      },
    },
    {
      field: 'survey_completed',
      headerName: 'Survey',
      width: 100,
      renderCell: (params: { row: DemoClassRegistration }) => (
        params.row.survey_completed ? (
          <Chip label="Completed" color="success" size="small" />
        ) : (
          <Chip label="Pending" variant="outlined" size="small" />
        )
      ),
    },
  ];

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!slot) {
    return (
      <Box>
        <Alert severity="error">Demo slot not found</Alert>
        <Button onClick={() => router.back()} sx={{ mt: 2 }}>
          Go Back
        </Button>
      </Box>
    );
  }

  const approvedRegistrations = registrations.filter(r => ['approved', 'attended', 'no_show'].includes(r.status));
  const pendingRegistrations = registrations.filter(r => r.status === 'pending');

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => router.back()}>
          Back
        </Button>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h4" component="h1" fontWeight="bold">
            {slot.title}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {formatDate(slot.slot_date)} at {formatTime(slot.slot_time)}
          </Typography>
        </Box>
        <Chip label={slot.status} color={getStatusColor(slot.status)} />
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography variant="h4" fontWeight="bold">
                {slot.current_registrations}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Registrations ({slot.min_registrations} min)
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography variant="h4" fontWeight="bold">
                {stats?.pending_count || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Pending Approvals
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography variant="h4" fontWeight="bold">
                {stats?.attended_count || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Attended
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              {stats?.avg_overall_rating ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="h4" fontWeight="bold">
                    {stats.avg_overall_rating.toFixed(1)}
                  </Typography>
                  <Rating value={stats.avg_overall_rating} readOnly precision={0.1} size="small" />
                </Box>
              ) : (
                <Typography variant="h4" fontWeight="bold">-</Typography>
              )}
              <Typography variant="body2" color="text.secondary">
                Avg Rating ({stats?.survey_count || 0} surveys)
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Action Buttons */}
      <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
        {slot.status === 'scheduled' && slot.current_registrations >= slot.min_registrations && (
          <Button
            variant="contained"
            color="success"
            startIcon={<LinkIcon />}
            onClick={() => setConfirmDialog(true)}
          >
            Confirm & Add Meeting Link
          </Button>
        )}
        {selectedRegistrations.length > 0 && (
          <Button
            variant="contained"
            onClick={handleBulkApprove}
            disabled={actionLoading}
          >
            Approve Selected ({selectedRegistrations.length})
          </Button>
        )}
        {pendingRegistrations.length > 0 && (
          <Button
            variant="outlined"
            onClick={() => setSelectedRegistrations(pendingRegistrations.map(r => r.id))}
          >
            Select All Pending
          </Button>
        )}
      </Stack>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
          <Tab label={`Registrations (${registrations.length})`} />
          <Tab label={`Attendance (${approvedRegistrations.length})`} />
          <Tab label={`Surveys (${stats?.survey_count || 0})`} />
          <Tab label="Details" />
        </Tabs>
      </Box>

      {/* Tab Panels */}
      <TabPanel value={tabValue} index={0}>
        <DataTable
          rows={registrations}
          columns={registrationColumns}
        />
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        <DataTable
          rows={approvedRegistrations}
          columns={attendanceColumns}
        />
      </TabPanel>

      <TabPanel value={tabValue} index={2}>
        {stats && stats.survey_count > 0 ? (
          <Grid container spacing={3}>
            <Grid item xs={12} md={4}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>Rating Summary</Typography>
                  <Stack spacing={2}>
                    <Box>
                      <Typography variant="body2" color="text.secondary">Overall Experience</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Rating value={stats.avg_overall_rating || 0} readOnly precision={0.1} />
                        <Typography variant="body2">{stats.avg_overall_rating?.toFixed(1) || '-'}</Typography>
                      </Box>
                    </Box>
                    <Box>
                      <Typography variant="body2" color="text.secondary">Teaching Quality</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Rating value={stats.avg_teaching_rating || 0} readOnly precision={0.1} />
                        <Typography variant="body2">{stats.avg_teaching_rating?.toFixed(1) || '-'}</Typography>
                      </Box>
                    </Box>
                    <Box>
                      <Typography variant="body2" color="text.secondary">NPS Score</Typography>
                      <Typography variant="h5">{stats.avg_nps_score?.toFixed(1) || '-'} / 5</Typography>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={4}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>Enrollment Interest</Typography>
                  <Stack spacing={1}>
                    <Chip
                      label={`Yes, definitely: ${stats.enrollment_interest_breakdown.yes}`}
                      color="success"
                    />
                    <Chip
                      label={`Maybe: ${stats.enrollment_interest_breakdown.maybe}`}
                      color="warning"
                    />
                    <Chip
                      label={`Not now: ${stats.enrollment_interest_breakdown.no}`}
                      color="default"
                    />
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        ) : (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="body1" color="text.secondary">
              No survey responses yet
            </Typography>
          </Box>
        )}
      </TabPanel>

      <TabPanel value={tabValue} index={3}>
        <Card>
          <CardContent>
            <Grid container spacing={3}>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2" color="text.secondary">Mode</Typography>
                <Typography variant="body1">{slot.demo_mode}</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2" color="text.secondary">Duration</Typography>
                <Typography variant="body1">{slot.duration_minutes} minutes</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2" color="text.secondary">Instructor</Typography>
                <Typography variant="body1">{slot.instructor_name || 'Not assigned'}</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2" color="text.secondary">Capacity</Typography>
                <Typography variant="body1">{slot.current_registrations} / {slot.max_registrations}</Typography>
              </Grid>
              {slot.meeting_link && (
                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="text.secondary">Meeting Link</Typography>
                  <Typography variant="body1">
                    <a href={slot.meeting_link} target="_blank" rel="noopener noreferrer">
                      {slot.meeting_link}
                    </a>
                  </Typography>
                </Grid>
              )}
              {slot.description && (
                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="text.secondary">Description</Typography>
                  <Typography variant="body1">{slot.description}</Typography>
                </Grid>
              )}
            </Grid>
          </CardContent>
        </Card>
      </TabPanel>

      {/* Confirm Dialog */}
      <Dialog open={confirmDialog} onClose={() => setConfirmDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Confirm Demo Class</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Add a meeting link to confirm this demo class. All approved registrations will receive a confirmation email.
          </Typography>
          <TextField
            fullWidth
            label="Meeting Link (Zoom/Teams/Google Meet)"
            value={meetingLink}
            onChange={(e) => setMeetingLink(e.target.value)}
            placeholder="https://zoom.us/j/..."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleConfirmSlot}
            disabled={actionLoading || !meetingLink}
          >
            {actionLoading ? <CircularProgress size={24} /> : 'Confirm Slot'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

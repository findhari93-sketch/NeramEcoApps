'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Button,
  Chip,
  IconButton,
  Skeleton,
  Avatar,
  Snackbar,
  Alert,
  LinearProgress,
  TextField,
  Tooltip,
  useTheme,
  alpha,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import PersonAddOutlinedIcon from '@mui/icons-material/PersonAddOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import PendingOutlinedIcon from '@mui/icons-material/PendingOutlined';
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  target_city: string | null;
  platforms: string[];
  channels: string[];
  status: string;
  created_at: string;
}

interface CampaignStudent {
  id: string;
  student_id: string;
  platform: string;
  status: string;
  sent_at: string | null;
  completed_at: string | null;
  screenshot_url: string | null;
  reminder_count: number;
  student_name: string;
  student_email: string | null;
  student_phone: string | null;
  student_avatar: string | null;
  student_city: string | null;
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending: <PendingOutlinedIcon sx={{ fontSize: 16 }} />,
  sent: <MarkEmailReadOutlinedIcon sx={{ fontSize: 16 }} />,
  clicked: <MarkEmailReadOutlinedIcon sx={{ fontSize: 16, color: 'info.main' }} />,
  completed: <CheckCircleOutlineIcon sx={{ fontSize: 16, color: 'success.main' }} />,
};

const STATUS_COLORS: Record<string, 'default' | 'info' | 'warning' | 'success' | 'error'> = {
  pending: 'default',
  sent: 'info',
  clicked: 'warning',
  completed: 'success',
  skipped: 'error',
};

const PLATFORM_COLORS: Record<string, string> = {
  google: '#4285F4',
  sulekha: '#E91E63',
  justdial: '#FF9800',
};

export default function CampaignDetailPage() {
  const theme = useTheme();
  const router = useRouter();
  const params = useParams();
  const campaignId = params.id as string;
  const { getToken } = useNexusAuthContext();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [students, setStudents] = useState<CampaignStudent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [addingStudents, setAddingStudents] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [platformFilter, setPlatformFilter] = useState<string>('');
  const [snackbar, setSnackbar] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const [campaignRes, studentsRes] = await Promise.all([
        fetch(`/api/review-campaigns/${campaignId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(
          `/api/review-campaigns/${campaignId}/students?limit=200${statusFilter ? `&status=${statusFilter}` : ''}${platformFilter ? `&platform=${platformFilter}` : ''}`,
          { headers: { Authorization: `Bearer ${token}` } }
        ),
      ]);

      if (campaignRes.ok) {
        const data = await campaignRes.json();
        setCampaign(data.campaign);
      }

      if (studentsRes.ok) {
        const data = await studentsRes.json();
        setStudents(data.students || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error('Failed to load campaign:', err);
    } finally {
      setLoading(false);
    }
  }, [getToken, campaignId, statusFilter, platformFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSend = async () => {
    setSending(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/review-campaigns/${campaignId}/send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setSnackbar({ message: `Sent to ${data.sent} students`, severity: 'success' });
        fetchData();
      } else {
        setSnackbar({ message: data.error || 'Failed to send', severity: 'error' });
      }
    } catch {
      setSnackbar({ message: 'Failed to send', severity: 'error' });
    } finally {
      setSending(false);
    }
  };

  const handleRemind = async () => {
    setReminding(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/review-campaigns/${campaignId}/remind`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setSnackbar({ message: `Reminded ${data.reminded} students`, severity: 'success' });
        fetchData();
      } else {
        setSnackbar({ message: data.error || 'No students to remind', severity: 'error' });
      }
    } catch {
      setSnackbar({ message: 'Failed to send reminders', severity: 'error' });
    } finally {
      setReminding(false);
    }
  };

  const handleAddFromCity = async () => {
    if (!campaign) return;
    setAddingStudents(true);
    try {
      const token = await getToken();

      // Fetch students from target city
      const cityParam = campaign.target_city || '';
      const url = cityParam
        ? `/api/students/city-wise/${encodeURIComponent(cityParam)}?limit=500`
        : '/api/students/city-wise';

      let studentIds: string[] = [];

      if (cityParam) {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          studentIds = (data.students || []).map((s: any) => s.id);
        }
      }

      if (studentIds.length === 0) {
        setSnackbar({ message: 'No students found to add', severity: 'error' });
        return;
      }

      // Add to campaign
      const addRes = await fetch(`/api/review-campaigns/${campaignId}/students`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          student_ids: studentIds,
          platforms: campaign.platforms,
        }),
      });

      if (addRes.ok) {
        const data = await addRes.json();
        setSnackbar({ message: `Added ${data.added} student entries`, severity: 'success' });
        fetchData();
      } else {
        setSnackbar({ message: 'Failed to add students', severity: 'error' });
      }
    } catch {
      setSnackbar({ message: 'Failed to add students', severity: 'error' });
    } finally {
      setAddingStudents(false);
    }
  };

  // Stats
  const stats = {
    pending: students.filter((s) => s.status === 'pending').length,
    sent: students.filter((s) => s.status === 'sent').length,
    clicked: students.filter((s) => s.status === 'clicked').length,
    completed: students.filter((s) => s.status === 'completed').length,
  };
  const completionPct = total > 0 ? Math.round((stats.completed / total) * 100) : 0;

  function getInitials(name: string) {
    return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  }

  if (loading && !campaign) {
    return (
      <Box>
        <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 2, mb: 2 }} />
        <Skeleton variant="rectangular" height={400} sx={{ borderRadius: 2 }} />
      </Box>
    );
  }

  if (!campaign) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="error">Campaign not found</Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton onClick={() => router.push('/teacher/reviews')} size="small" sx={{ minWidth: 40, minHeight: 40 }}>
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
            {campaign.name}
          </Typography>
          {campaign.description && (
            <Typography variant="body2" color="text.secondary">
              {campaign.description}
            </Typography>
          )}
        </Box>
        <Chip
          label={campaign.status}
          size="small"
          color={STATUS_COLORS[campaign.status] || 'default'}
          sx={{ textTransform: 'capitalize', fontWeight: 600 }}
        />
      </Box>

      {/* Stats Cards */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' },
          gap: 1.5,
          mb: 2,
        }}
      >
        {[
          { label: 'Pending', value: stats.pending, color: theme.palette.grey[500] },
          { label: 'Sent', value: stats.sent, color: theme.palette.info.main },
          { label: 'Clicked', value: stats.clicked, color: theme.palette.warning.main },
          { label: 'Completed', value: stats.completed, color: theme.palette.success.main },
        ].map((stat) => (
          <Paper
            key={stat.label}
            variant="outlined"
            sx={{ p: 1.5, textAlign: 'center', borderRadius: 2 }}
          >
            <Typography variant="h4" sx={{ fontWeight: 800, color: stat.color, lineHeight: 1 }}>
              {stat.value}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {stat.label}
            </Typography>
          </Paper>
        ))}
      </Box>

      {/* Progress bar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <LinearProgress
          variant="determinate"
          value={completionPct}
          sx={{
            flex: 1,
            height: 8,
            borderRadius: 4,
            bgcolor: alpha(theme.palette.success.main, 0.1),
            '& .MuiLinearProgress-bar': { bgcolor: 'success.main', borderRadius: 4 },
          }}
        />
        <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 40 }}>
          {completionPct}%
        </Typography>
      </Box>

      {/* Action buttons */}
      <Box sx={{ display: 'flex', gap: 1, mb: 3, flexWrap: 'wrap' }}>
        <Button
          variant="contained"
          startIcon={<PersonAddOutlinedIcon />}
          onClick={handleAddFromCity}
          disabled={addingStudents}
          size="small"
        >
          {addingStudents ? 'Adding...' : `Add ${campaign.target_city || 'All'} Students`}
        </Button>
        <Button
          variant="contained"
          color="success"
          startIcon={<SendOutlinedIcon />}
          onClick={handleSend}
          disabled={sending || stats.pending === 0}
          size="small"
        >
          {sending ? 'Sending...' : `Send to ${stats.pending} Pending`}
        </Button>
        <Button
          variant="outlined"
          color="warning"
          startIcon={<NotificationsActiveOutlinedIcon />}
          onClick={handleRemind}
          disabled={reminding || (stats.sent + stats.clicked) === 0}
          size="small"
        >
          {reminding ? 'Reminding...' : `Remind ${stats.sent + stats.clicked}`}
        </Button>
      </Box>

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Status</InputLabel>
          <Select
            value={statusFilter}
            label="Status"
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="pending">Pending</MenuItem>
            <MenuItem value="sent">Sent</MenuItem>
            <MenuItem value="clicked">Clicked</MenuItem>
            <MenuItem value="completed">Completed</MenuItem>
            <MenuItem value="skipped">Skipped</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Platform</InputLabel>
          <Select
            value={platformFilter}
            label="Platform"
            onChange={(e) => setPlatformFilter(e.target.value)}
          >
            <MenuItem value="">All</MenuItem>
            {campaign.platforms.map((p) => (
              <MenuItem key={p} value={p}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {/* Student list */}
      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="rectangular" height={64} sx={{ borderRadius: 1 }} />
          ))}
        </Box>
      ) : students.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">
            {total === 0
              ? 'No students added yet. Click "Add Students" to populate from city list.'
              : 'No students match the current filters.'}
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {students.map((s) => (
            <Paper
              key={s.id}
              variant="outlined"
              sx={{
                p: 1.5,
                borderRadius: 1.5,
                borderLeft: `3px solid ${PLATFORM_COLORS[s.platform] || '#666'}`,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Avatar
                  src={s.student_avatar || undefined}
                  sx={{
                    width: 36,
                    height: 36,
                    bgcolor: alpha(theme.palette.primary.main, 0.1),
                    color: 'primary.main',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                  }}
                >
                  {getInitials(s.student_name)}
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                      {s.student_name}
                    </Typography>
                    <Chip
                      label={s.platform}
                      size="small"
                      sx={{
                        height: 18,
                        fontSize: '0.6rem',
                        fontWeight: 600,
                        bgcolor: alpha(PLATFORM_COLORS[s.platform] || '#666', 0.1),
                        color: PLATFORM_COLORS[s.platform] || '#666',
                      }}
                    />
                  </Box>
                  <Typography variant="caption" color="text.disabled" noWrap>
                    {s.student_email || s.student_phone || ''}
                    {s.student_city ? ` · ${s.student_city}` : ''}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                  {s.screenshot_url && (
                    <Tooltip title="Has screenshot proof">
                      <ImageOutlinedIcon sx={{ fontSize: 16, color: 'success.main' }} />
                    </Tooltip>
                  )}
                  {s.reminder_count > 0 && (
                    <Chip
                      label={`${s.reminder_count}x`}
                      size="small"
                      variant="outlined"
                      sx={{ height: 20, fontSize: '0.6rem' }}
                    />
                  )}
                  <Chip
                    icon={STATUS_ICONS[s.status]}
                    label={s.status}
                    size="small"
                    color={STATUS_COLORS[s.status] || 'default'}
                    variant="outlined"
                    sx={{ height: 24, fontSize: '0.7rem', fontWeight: 600, textTransform: 'capitalize' }}
                  />
                </Box>
              </Box>
            </Paper>
          ))}
        </Box>
      )}

      <Snackbar
        open={!!snackbar}
        autoHideDuration={3000}
        onClose={() => setSnackbar(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {snackbar ? (
          <Alert severity={snackbar.severity} onClose={() => setSnackbar(null)} variant="filled">
            {snackbar.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}

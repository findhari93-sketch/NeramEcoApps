'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  Chip,
  Tabs,
  Tab,
  Skeleton,
  Card,
  CardContent,
  CardActionArea,
  Grid,
  LinearProgress,
  IconButton,
  Snackbar,
  Alert,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import DrillManagerTable from '@/components/course-plan/DrillManagerTable';
import ResourceList from '@/components/course-plan/ResourceList';

const STATUS_COLORS: Record<string, 'default' | 'success' | 'info' | 'warning'> = {
  draft: 'default',
  active: 'success',
  completed: 'info',
  paused: 'warning',
};

interface WeekData {
  id: string;
  week_number: number;
  title: string;
  goal?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  sessions: Array<{
    id: string;
    status: string;
    scheduled_class_id?: string | null;
  }>;
}

interface PlanData {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  duration_weeks: number;
  days_per_week: string[];
  sessions_per_day: Array<{ slot: string; label?: string }>;
  weeks: WeekData[];
  tests: any[];
  drill_count: number;
}

function WeekCard({ week, planId }: { week: WeekData; planId: string }) {
  const router = useRouter();
  const totalSessions = week.sessions?.length || 0;
  const scheduledSessions = week.sessions?.filter(
    (s) => s.status === 'scheduled' || s.status === 'completed'
  ).length || 0;
  const progress = totalSessions > 0 ? (scheduledSessions / totalSessions) * 100 : 0;

  return (
    <Card
      elevation={0}
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        transition: 'box-shadow 200ms ease, transform 200ms ease',
        '&:hover': {
          boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
          transform: 'translateY(-2px)',
        },
        '&:active': { transform: 'scale(0.99)' },
      }}
    >
      <CardActionArea
        onClick={() => router.push(`/teacher/course-plans/${planId}/weeks/${week.id}`)}
        sx={{ p: 0 }}
      >
        <CardContent sx={{ p: { xs: 2, sm: 2.5 }, '&:last-child': { pb: { xs: 2, sm: 2.5 } } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, fontSize: { xs: '0.95rem', sm: '1.05rem' } }}>
              {week.title || `Week ${week.week_number}`}
            </Typography>
            <Chip
              label={`W${week.week_number}`}
              size="small"
              color="primary"
              variant="outlined"
              sx={{ fontWeight: 700, fontSize: '0.7rem', height: 22 }}
            />
          </Box>

          {week.goal && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                mb: 1.5,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {week.goal}
            </Typography>
          )}

          {week.start_date && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
              <CalendarTodayIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
              <Typography variant="caption" color="text.secondary">
                {week.start_date}{week.end_date ? ` - ${week.end_date}` : ''}
              </Typography>
            </Box>
          )}

          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="caption" color="text.secondary">
                Sessions
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {scheduledSessions}/{totalSessions} scheduled
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={progress}
              sx={{
                height: 6,
                borderRadius: 3,
                bgcolor: 'action.hover',
                '& .MuiLinearProgress-bar': { borderRadius: 3 },
              }}
            />
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

export default function CoursePlanDashboard() {
  const params = useParams();
  const router = useRouter();
  const planId = params.planId as string;
  const { getToken } = useNexusAuthContext();

  const [plan, setPlan] = useState<PlanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const fetchPlan = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/course-plans/${planId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setPlan(data.plan);
      }
    } catch (err) {
      console.error('Failed to load plan:', err);
    } finally {
      setLoading(false);
    }
  }, [planId, getToken]);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  const handleActivate = async () => {
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/course-plans/${planId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: 'active' }),
      });

      if (res.ok) {
        setSnackbar({ open: true, message: 'Plan activated', severity: 'success' });
        fetchPlan();
      } else {
        const data = await res.json().catch(() => ({}));
        setSnackbar({ open: true, message: data.error || 'Failed to activate', severity: 'error' });
      }
    } catch {
      setSnackbar({ open: true, message: 'Failed to activate plan', severity: 'error' });
    }
  };

  if (loading) {
    return (
      <Box>
        <Skeleton variant="text" width={200} height={40} sx={{ mb: 2 }} />
        <Skeleton variant="rounded" height={48} sx={{ mb: 3 }} />
        <Grid container spacing={2}>
          {[0, 1, 2, 3].map((i) => (
            <Grid item xs={12} sm={6} md={4} key={i}>
              <Skeleton variant="rounded" height={150} sx={{ borderRadius: 2 }} />
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  }

  if (!plan) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography variant="h6" color="text.secondary">
          Plan not found
        </Typography>
        <Button onClick={() => router.push('/teacher/course-plans')} sx={{ mt: 2, minHeight: 48 }}>
          Back to Plans
        </Button>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <IconButton
          onClick={() => router.push('/teacher/course-plans')}
          sx={{ width: 40, height: 40 }}
        >
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {plan.name}
        </Typography>
        <Chip
          label={plan.status}
          color={STATUS_COLORS[plan.status] || 'default'}
          sx={{ textTransform: 'capitalize', fontWeight: 600 }}
        />
      </Box>

      {plan.description && (
        <Typography variant="body2" color="text.secondary" sx={{ ml: 6.5, mb: 2 }}>
          {plan.description}
        </Typography>
      )}

      {/* Action buttons */}
      <Box sx={{ ml: 6.5, mb: 2, display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
        {plan.status === 'draft' && (
          <Button
            variant="contained"
            color="success"
            startIcon={<PlayArrowIcon />}
            onClick={handleActivate}
            sx={{ textTransform: 'none', minHeight: 48 }}
          >
            Activate Plan
          </Button>
        )}
        <Button
          variant="outlined"
          startIcon={<UploadFileOutlinedIcon />}
          onClick={() => router.push(`/teacher/course-plans/${planId}/csv-upload`)}
          sx={{ textTransform: 'none', minHeight: 48 }}
        >
          Import CSV
        </Button>
      </Box>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        sx={{
          mb: 3,
          '& .MuiTab-root': { textTransform: 'none', minHeight: 48, fontWeight: 600 },
        }}
        variant="scrollable"
        scrollButtons="auto"
      >
        <Tab label="Overview" />
        <Tab label="Homework" />
        <Tab label="Tests" />
        <Tab label="Drill" />
        <Tab label="Resources" />
      </Tabs>

      {/* Tab Panels */}
      {activeTab === 0 && (
        <Grid container spacing={2}>
          {(plan.weeks || []).map((week) => (
            <Grid item xs={12} sm={6} md={4} key={week.id}>
              <WeekCard week={week} planId={plan.id} />
            </Grid>
          ))}
          {(plan.weeks || []).length === 0 && (
            <Grid item xs={12}>
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                No weeks in this plan.
              </Typography>
            </Grid>
          )}
        </Grid>
      )}

      {activeTab === 1 && (
        <Box sx={{ py: 4, textAlign: 'center' }}>
          <Button
            variant="outlined"
            onClick={() => router.push(`/teacher/course-plans/${planId}/homework`)}
            sx={{ textTransform: 'none', minHeight: 48 }}
          >
            Open Homework Manager
          </Button>
        </Box>
      )}

      {activeTab === 2 && (
        <Box sx={{ py: 4, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            Coming in Task 15
          </Typography>
        </Box>
      )}

      {activeTab === 3 && (
        <DrillManagerTable planId={planId} />
      )}

      {activeTab === 4 && (
        <ResourceList planId={planId} />
      )}

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

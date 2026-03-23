'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Button,
  Chip,
  Skeleton,
  Snackbar,
  Alert,
  Stack,
  Card,
  CardContent,
  MenuItem,
  TextField,
  Divider,
  Avatar,
  alpha,
  useTheme,
  IconButton,
  Tooltip,
} from '@neram/ui';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import PendingActionsOutlinedIcon from '@mui/icons-material/PendingActionsOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import DoNotDisturbAltOutlinedIcon from '@mui/icons-material/DoNotDisturbAltOutlined';
import ThumbUpAltOutlinedIcon from '@mui/icons-material/ThumbUpAltOutlined';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { ThreadCard } from '@/components/exam-recall';
import type {
  ExamRecallDashboardStats,
  ExamRecallThreadListItem,
  ExamRecallSessionSummary,
  ExamRecallTopicCategory,
} from '@neram/database';

// --- Topic labels for heatmap ---
const TOPIC_LABELS: Record<ExamRecallTopicCategory, string> = {
  visual_reasoning: 'Visual Reasoning',
  logical_derivation: 'Logical Derivation',
  gk_architecture: 'GK / Architecture',
  language: 'Language',
  design_sensitivity: 'Design Sensitivity',
  numerical_ability: 'Numerical Ability',
  drawing: 'Drawing',
};

const ALL_TOPICS = Object.keys(TOPIC_LABELS) as ExamRecallTopicCategory[];

export default function ExamRecallModerationDashboard() {
  const router = useRouter();
  const theme = useTheme();
  const { getToken, activeClassroom } = useNexusAuthContext();

  // --- State ---
  const [stats, setStats] = useState<ExamRecallDashboardStats | null>(null);
  const [threads, setThreads] = useState<ExamRecallThreadListItem[]>([]);
  const [threadsTotal, setThreadsTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  // Session filter
  const [selectedSession, setSelectedSession] = useState<string>('all');

  // --- Fetch dashboard stats ---
  const fetchStats = useCallback(async () => {
    if (!activeClassroom) return;
    try {
      setLoading(true);
      const token = await getToken();
      const res = await fetch(
        `/api/exam-recall/dashboard?classroom_id=${activeClassroom.id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error('Failed to fetch dashboard stats');
      const data: ExamRecallDashboardStats = await res.json();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  }, [activeClassroom, getToken]);

  // --- Fetch pending threads ---
  const fetchPendingThreads = useCallback(async () => {
    if (!activeClassroom) return;
    try {
      setThreadsLoading(true);
      const token = await getToken();
      const params = new URLSearchParams({
        classroom_id: activeClassroom.id,
        status: 'raw',
        pageSize: '50',
      });
      // If a specific session is selected, parse exam_date + session_number
      if (selectedSession !== 'all') {
        const [date, session] = selectedSession.split('|');
        params.set('exam_date', date);
        params.set('session_number', session);
      }

      const res = await fetch(`/api/exam-recall/threads?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch threads');
      const data = await res.json();

      // Also fetch under_review threads
      const params2 = new URLSearchParams({
        classroom_id: activeClassroom.id,
        status: 'under_review',
        pageSize: '50',
      });
      if (selectedSession !== 'all') {
        const [date, session] = selectedSession.split('|');
        params2.set('exam_date', date);
        params2.set('session_number', session);
      }
      const res2 = await fetch(`/api/exam-recall/threads?${params2.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res2.ok) throw new Error('Failed to fetch under-review threads');
      const data2 = await res2.json();

      // Merge and sort by confirm_count desc
      const merged = [...(data.threads || []), ...(data2.threads || [])];
      merged.sort((a: ExamRecallThreadListItem, b: ExamRecallThreadListItem) => b.confirm_count - a.confirm_count);
      setThreads(merged);
      setThreadsTotal(merged.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load threads');
    } finally {
      setThreadsLoading(false);
    }
  }, [activeClassroom, getToken, selectedSession]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchPendingThreads();
  }, [fetchPendingThreads]);

  // --- Quick actions ---
  const handleStatusChange = async (threadId: string, newStatus: string) => {
    try {
      const token = await getToken();
      const res = await fetch(`/api/exam-recall/threads/${threadId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed to update status');
      setSnackbar({ open: true, message: `Thread marked as ${newStatus}`, severity: 'success' });
      // Refresh data
      fetchStats();
      fetchPendingThreads();
    } catch (err) {
      setSnackbar({ open: true, message: err instanceof Error ? err.message : 'Failed', severity: 'error' });
    }
  };

  // --- Build session options from stats ---
  const sessionOptions = stats?.sessions?.map((s: ExamRecallSessionSummary) => ({
    value: `${s.exam_date}|${s.session_number}`,
    label: `${s.exam_date} - Session ${s.session_number} (${s.thread_count} threads)`,
  })) || [];

  // --- Topic coverage for selected session ---
  const getTopicCoverageForSession = () => {
    // Build a set of topic_categories present in the current threads
    const covered = new Set<string>();
    threads.forEach((t) => {
      if (t.topic_category) covered.add(t.topic_category);
    });
    return ALL_TOPICS.map((topic) => ({
      topic,
      label: TOPIC_LABELS[topic],
      covered: covered.has(topic),
    }));
  };

  if (!activeClassroom) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography variant="h6" color="text.secondary">
          Please select a classroom to view the Exam Recall dashboard.
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* Page Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            NATA Exam Recall - Moderation
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Review and moderate student-submitted exam questions
          </Typography>
        </Box>
        <Tooltip title="Refresh data">
          <IconButton
            onClick={() => { fetchStats(); fetchPendingThreads(); }}
            color="primary"
          >
            <RefreshOutlinedIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      {/* Stats Cards Row */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
          gap: 2,
          mb: 3,
        }}
      >
        <StatsCard
          title="Total Threads"
          value={stats?.total_threads}
          loading={loading}
          icon={<DashboardOutlinedIcon />}
          color={theme.palette.primary.main}
        />
        <StatsCard
          title="Pending Review"
          value={stats?.pending_review}
          loading={loading}
          icon={<PendingActionsOutlinedIcon />}
          color="#ed6c02"
          badgeColor="#fff3e0"
        />
        <StatsCard
          title="Published"
          value={stats?.published}
          loading={loading}
          icon={<CheckCircleOutlineIcon />}
          color="#2e7d32"
          badgeColor="#e8f5e9"
        />
        <StatsCard
          title="Active Contributors"
          value={stats?.total_contributors}
          loading={loading}
          icon={<GroupOutlinedIcon />}
          color="#7b1fa2"
        />
      </Box>

      {/* Session Selector + Pending Review Queue */}
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, mb: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={2} sx={{ mb: 2 }}>
          <Typography variant="h6" fontWeight={600}>
            Pending Review Queue
            {threadsTotal > 0 && (
              <Chip
                label={threadsTotal}
                size="small"
                sx={{ ml: 1, bgcolor: '#fff3e0', color: '#e65100', fontWeight: 700 }}
              />
            )}
          </Typography>
          <TextField
            select
            size="small"
            value={selectedSession}
            onChange={(e) => setSelectedSession(e.target.value)}
            sx={{ minWidth: 260 }}
            label="Filter by Session"
          >
            <MenuItem value="all">All Sessions</MenuItem>
            {sessionOptions.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </TextField>
        </Stack>

        {threadsLoading ? (
          <Stack spacing={2}>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} variant="rounded" height={120} />
            ))}
          </Stack>
        ) : threads.length === 0 ? (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <Typography variant="body1" color="text.secondary">
              No pending threads to review. All caught up!
            </Typography>
          </Box>
        ) : (
          <Stack spacing={2}>
            {threads.map((thread) => (
              <Box key={thread.id} sx={{ position: 'relative' }}>
                <ThreadCard
                  thread={thread}
                  compact
                  onThreadClick={() => router.push(`/teacher/exam-recall/thread/${thread.id}`)}
                />
                {/* Quick action buttons overlay */}
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    zIndex: 1,
                  }}
                >
                  <Button
                    size="small"
                    variant="outlined"
                    color="primary"
                    startIcon={<RateReviewOutlinedIcon sx={{ fontSize: '1rem' }} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/teacher/exam-recall/thread/${thread.id}`);
                    }}
                    sx={{ fontSize: '0.75rem', py: 0.25, px: 1, minWidth: 0 }}
                  >
                    Review
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    startIcon={<DoNotDisturbAltOutlinedIcon sx={{ fontSize: '1rem' }} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStatusChange(thread.id, 'dismissed');
                    }}
                    sx={{ fontSize: '0.75rem', py: 0.25, px: 1, minWidth: 0 }}
                  >
                    Dismiss
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    color="success"
                    startIcon={<ThumbUpAltOutlinedIcon sx={{ fontSize: '1rem' }} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStatusChange(thread.id, 'published');
                    }}
                    sx={{ fontSize: '0.75rem', py: 0.25, px: 1, minWidth: 0 }}
                  >
                    Approve
                  </Button>
                </Stack>
              </Box>
            ))}
          </Stack>
        )}
      </Paper>

      {/* Sessions Overview */}
      {stats && stats.sessions && stats.sessions.length > 0 && (
        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, mb: 3 }}>
          <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
            Sessions Overview
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
              gap: 2,
            }}
          >
            {stats.sessions.map((session) => (
              <Card
                key={`${session.exam_date}-${session.session_number}`}
                variant="outlined"
                sx={{
                  cursor: 'pointer',
                  '&:hover': { boxShadow: theme.shadows[2] },
                  transition: 'box-shadow 0.2s',
                }}
                onClick={() => setSelectedSession(`${session.exam_date}|${session.session_number}`)}
              >
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Typography variant="subtitle2" fontWeight={600}>
                    {session.exam_date} - Session {session.session_number}
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap">
                    <Chip label={`${session.thread_count} threads`} size="small" />
                    <Chip
                      label={`${session.raw_count + session.under_review_count} pending`}
                      size="small"
                      sx={{
                        bgcolor: session.raw_count + session.under_review_count > 0 ? '#fff3e0' : undefined,
                        color: session.raw_count + session.under_review_count > 0 ? '#e65100' : undefined,
                      }}
                    />
                    <Chip
                      label={`${session.published_count} published`}
                      size="small"
                      sx={{
                        bgcolor: session.published_count > 0 ? '#e8f5e9' : undefined,
                        color: session.published_count > 0 ? '#2e7d32' : undefined,
                      }}
                    />
                    <Chip
                      label={`${session.contributor_count} contributors`}
                      size="small"
                      variant="outlined"
                    />
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Box>
        </Paper>
      )}

      {/* Topic Coverage Heatmap */}
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, mb: 3 }}>
        <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
          Topic Coverage
          {selectedSession !== 'all' && (
            <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
              (filtered session)
            </Typography>
          )}
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)' },
            gap: 1.5,
          }}
        >
          {getTopicCoverageForSession().map(({ topic, label, covered }) => (
            <Box
              key={topic}
              sx={{
                p: 1.5,
                borderRadius: 2,
                border: '1px solid',
                borderColor: covered ? alpha('#2e7d32', 0.3) : alpha('#d32f2f', 0.2),
                bgcolor: covered ? alpha('#2e7d32', 0.06) : alpha('#d32f2f', 0.04),
                textAlign: 'center',
              }}
            >
              <Typography variant="body2" fontWeight={600} sx={{ color: covered ? '#2e7d32' : '#d32f2f' }}>
                {label}
              </Typography>
              <Typography variant="caption" sx={{ color: covered ? '#2e7d32' : '#d32f2f' }}>
                {covered ? 'Covered' : 'No questions yet'}
              </Typography>
            </Box>
          ))}
        </Box>
      </Paper>

      {/* Recent Activity Timeline */}
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
        <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
          Recent Activity
        </Typography>
        {threadsLoading ? (
          <Stack spacing={1.5}>
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} variant="rounded" height={40} />
            ))}
          </Stack>
        ) : threads.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
            No recent activity.
          </Typography>
        ) : (
          <Stack spacing={1} divider={<Divider flexItem />}>
            {threads.slice(0, 10).map((thread) => (
              <Stack
                key={thread.id}
                direction="row"
                spacing={1.5}
                alignItems="center"
                sx={{
                  py: 0.75,
                  cursor: 'pointer',
                  '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04) },
                  borderRadius: 1,
                  px: 1,
                }}
                onClick={() => router.push(`/teacher/exam-recall/thread/${thread.id}`)}
              >
                {thread.contributors[0] && (
                  <Avatar
                    src={thread.contributors[0].avatar_url || undefined}
                    alt={thread.contributors[0].name || 'User'}
                    sx={{ width: 32, height: 32, fontSize: '0.8rem' }}
                  >
                    {thread.contributors[0].name?.[0] || '?'}
                  </Avatar>
                )}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" noWrap>
                    {thread.latest_version?.recall_text || 'No text'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {thread.confirm_count} confirms, {thread.vouch_count} vouches, {thread.version_count} versions
                  </Typography>
                </Box>
                <Chip
                  label={thread.status === 'raw' ? 'Raw' : 'Under Review'}
                  size="small"
                  sx={{
                    bgcolor: thread.status === 'raw' ? '#fff3e0' : '#e3f2fd',
                    color: thread.status === 'raw' ? '#e65100' : '#1565c0',
                    fontWeight: 600,
                    fontSize: '0.7rem',
                    height: 22,
                    flexShrink: 0,
                  }}
                />
              </Stack>
            ))}
          </Stack>
        )}
      </Paper>

      {/* Error display */}
      {error && (
        <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

// --- Stats Card Component ---
function StatsCard({
  title,
  value,
  loading,
  icon,
  color,
  badgeColor,
}: {
  title: string;
  value: number | undefined;
  loading: boolean;
  icon: React.ReactNode;
  color: string;
  badgeColor?: string;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: { xs: 2, md: 2.5 },
        display: 'flex',
        alignItems: 'center',
        gap: 2,
      }}
    >
      <Box
        sx={{
          width: 48,
          height: 48,
          borderRadius: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: alpha(color, 0.1),
          color,
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Box>
        {loading ? (
          <Skeleton width={60} height={36} />
        ) : (
          <Typography variant="h5" fontWeight={700} sx={{ color: badgeColor ? color : 'text.primary' }}>
            {value ?? 0}
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary" fontWeight={500}>
          {title}
        </Typography>
      </Box>
    </Paper>
  );
}

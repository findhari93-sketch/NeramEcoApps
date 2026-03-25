'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Chip,
  Skeleton,
  Snackbar,
  Alert,
  useTheme,
  alpha,
} from '@neram/ui';
import GoogleIcon from '@mui/icons-material/Google';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface ReviewTask {
  id: string;
  campaign_id: string;
  platform: string;
  status: string;
  campaign_name: string;
  review_url: string | null;
  reminder_count: number;
}

const PLATFORM_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode; instructions: string }> = {
  google: {
    label: 'Google',
    color: '#4285F4',
    icon: <GoogleIcon sx={{ fontSize: 24 }} />,
    instructions: 'Click the link below to open Google Reviews. Sign in with your Google account and leave a star rating + a few words about your experience.',
  },
  sulekha: {
    label: 'Sulekha',
    color: '#E91E63',
    icon: <StorefrontOutlinedIcon sx={{ fontSize: 24 }} />,
    instructions: 'Click the link to visit our Sulekha page. You may need to create a free account, then leave a rating and review.',
  },
  justdial: {
    label: 'JustDial',
    color: '#FF9800',
    icon: <StorefrontOutlinedIcon sx={{ fontSize: 24 }} />,
    instructions: 'Click the link to visit our JustDial listing. Rate us and share your experience as a student.',
  },
};

export default function StudentReviewsPage() {
  const theme = useTheme();
  const { getToken } = useNexusAuthContext();
  const [tasks, setTasks] = useState<ReviewTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/student/review-tasks', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
      }
    } catch (err) {
      console.error('Failed to load review tasks:', err);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleComplete = async (taskId: string) => {
    setCompleting(taskId);
    try {
      const token = await getToken();
      const res = await fetch('/api/student/review-tasks/complete', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ task_id: taskId }),
      });

      if (res.ok) {
        setSnackbar({ message: 'Thank you for your review!', severity: 'success' });
        // Remove from list
        setTasks((prev) => prev.filter((t) => t.id !== taskId));
      } else {
        setSnackbar({ message: 'Failed to mark as complete', severity: 'error' });
      }
    } catch {
      setSnackbar({ message: 'Something went wrong', severity: 'error' });
    } finally {
      setCompleting(null);
    }
  };

  const pendingTasks = tasks.filter((t) => t.status !== 'completed');
  const completedTasks = tasks.filter((t) => t.status === 'completed');

  return (
    <Box>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mb: 0.5 }}>
        Review Requests
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
        Help us grow by leaving reviews on these platforms
      </Typography>

      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[1, 2].map((i) => (
            <Skeleton key={i} variant="rectangular" height={160} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
      ) : pendingTasks.length === 0 && completedTasks.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <RateReviewOutlinedIcon sx={{ fontSize: 56, color: 'text.disabled', mb: 1 }} />
          <Typography variant="h6" color="text.secondary">
            No review requests right now
          </Typography>
          <Typography variant="body2" color="text.disabled" sx={{ mt: 0.5 }}>
            When your teachers send review requests, they will appear here.
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Pending tasks */}
          {pendingTasks.map((task) => {
            const config = PLATFORM_CONFIG[task.platform] || PLATFORM_CONFIG.google;
            return (
              <Paper
                key={task.id}
                variant="outlined"
                sx={{
                  p: 2.5,
                  borderRadius: 2,
                  borderLeft: `4px solid ${config.color}`,
                }}
              >
                {/* Header */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                  <Box
                    sx={{
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: alpha(config.color, 0.1),
                      color: config.color,
                    }}
                  >
                    {config.icon}
                  </Box>
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                      Review on {config.label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {task.campaign_name}
                    </Typography>
                  </Box>
                </Box>

                {/* Instructions */}
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {config.instructions}
                </Typography>

                {/* Actions */}
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                  {task.review_url && (
                    <Button
                      variant="contained"
                      startIcon={<OpenInNewIcon />}
                      href={task.review_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      sx={{
                        bgcolor: config.color,
                        '&:hover': { bgcolor: alpha(config.color, 0.85) },
                        minHeight: 44,
                      }}
                    >
                      Open {config.label}
                    </Button>
                  )}
                  <Button
                    variant="outlined"
                    startIcon={<CheckCircleOutlineIcon />}
                    onClick={() => handleComplete(task.id)}
                    disabled={completing === task.id}
                    color="success"
                    sx={{ minHeight: 44 }}
                  >
                    {completing === task.id ? 'Marking...' : "I've Reviewed"}
                  </Button>
                </Box>

                {task.reminder_count > 0 && (
                  <Typography variant="caption" color="text.disabled" sx={{ mt: 1, display: 'block' }}>
                    Reminder sent {task.reminder_count} time{task.reminder_count > 1 ? 's' : ''}
                  </Typography>
                )}
              </Paper>
            );
          })}

          {/* Completed section */}
          {completedTasks.length > 0 && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                Completed
              </Typography>
              {completedTasks.map((task) => {
                const config = PLATFORM_CONFIG[task.platform] || PLATFORM_CONFIG.google;
                return (
                  <Paper
                    key={task.id}
                    variant="outlined"
                    sx={{
                      p: 1.5,
                      borderRadius: 1.5,
                      opacity: 0.6,
                      mb: 1,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CheckCircleOutlineIcon sx={{ color: 'success.main', fontSize: 20 }} />
                      <Typography variant="body2">
                        {config.label} review completed
                      </Typography>
                      <Chip
                        label="Done"
                        size="small"
                        color="success"
                        sx={{ height: 20, fontSize: '0.65rem', ml: 'auto' }}
                      />
                    </Box>
                  </Paper>
                );
              })}
            </Box>
          )}
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

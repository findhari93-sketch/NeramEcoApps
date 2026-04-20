'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box, Typography, Chip, Paper, Skeleton, IconButton, Tabs, Tab,
  useTheme, useMediaQuery,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import CategoryBadge from '@/components/drawings/CategoryBadge';
import type { DrawingSubmissionWithQuestion } from '@neram/database/types';

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'submitted', label: 'Pending' },
  { value: 'redo', label: 'Redo' },
  { value: 'completed', label: 'Completed' },
];

const STATUS_LABEL: Record<string, string> = {
  submitted: 'Pending',
  under_review: 'Reviewing',
  redo: 'Redo',
  reviewed: 'Reviewed',
  completed: 'Completed',
  published: 'Completed',
};

const STATUS_COLOR: Record<string, 'default' | 'warning' | 'success' | 'info' | 'error'> = {
  submitted: 'default',
  under_review: 'info',
  redo: 'warning',
  reviewed: 'success',
  completed: 'success',
  published: 'success',
};

interface DrawingNotification {
  id: string;
  submission_id: string;
  message: string;
  created_at: string;
}

export default function MySubmissionsPage() {
  const router = useRouter();
  const { getToken } = useNexusAuthContext();
  const [submissions, setSubmissions] = useState<DrawingSubmissionWithQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [notifications, setNotifications] = useState<DrawingNotification[]>([]);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const fetchSubmissions = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      const res = await fetch(`/api/drawing/submissions/my?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setSubmissions(data.submissions || []);
    } catch {
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
  }, [getToken, status]);

  const fetchNotifications = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch('/api/drawing/notifications', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch {
      // Non-critical: notifications silently fail
    }
  }, [getToken]);

  const markNotificationRead = useCallback(async (notificationId: string) => {
    try {
      const token = await getToken();
      await fetch('/api/drawing/notifications', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notification_id: notificationId }),
      });
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
    } catch {
      // Non-critical
    }
  }, [getToken]);

  useEffect(() => { fetchSubmissions(); }, [fetchSubmissions]);
  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  return (
    <Box sx={{
      px: isMobile ? 0 : { sm: 3 },
      py: isMobile ? 0 : 2,
      maxWidth: 800,
      mx: 'auto',
      ...(isMobile && { mx: { xs: -2, sm: -3 }, mt: -2 }),
    }}>
      {/* Header */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1,
        px: isMobile ? 1 : 0,
        py: isMobile ? 0.75 : 0,
        mb: isMobile ? 0 : 2,
        ...(isMobile && {
          bgcolor: '#fff',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }),
      }}>
        <IconButton onClick={() => router.push('/student/drawings')} size="small" sx={{ p: 0.5 }}>
          <ArrowBackIcon fontSize="small" />
        </IconButton>
        <Typography
          variant={isMobile ? 'subtitle1' : 'h6'}
          fontWeight={700}
          sx={{ fontSize: isMobile ? '0.95rem' : undefined }}
        >
          My Submissions
        </Typography>
      </Box>

      {/* Status tabs */}
      <Tabs
        value={status}
        onChange={(_, v) => setStatus(v)}
        variant={isMobile ? 'fullWidth' : 'standard'}
        sx={{
          mb: isMobile ? 0.75 : 2,
          minHeight: isMobile ? 32 : 36,
          '& .MuiTab-root': {
            minHeight: isMobile ? 32 : 36,
            py: 0.25,
            px: isMobile ? 0.5 : 2,
            textTransform: 'none',
            fontSize: isMobile ? '0.78rem' : undefined,
            minWidth: 0,
          },
          ...(isMobile && { px: 0.5 }),
        }}
      >
        {STATUS_TABS.map((t) => (
          <Tab key={t.value} value={t.value} label={t.label} />
        ))}
      </Tabs>

      {/* List */}
      <Box sx={{ px: isMobile ? 1 : 0 }}>
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={70} sx={{ mb: 0.75 }} />)
        ) : submissions.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography color="text.secondary" variant="body2">No submissions yet</Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 0.75 : 1.5 }}>
            {submissions.map((s) => {
              const unreadNotification = notifications.find((n) => n.submission_id === s.id);
              return (
              <Paper
                key={s.id}
                variant="outlined"
                sx={{
                  p: isMobile ? 1 : 1.5, cursor: 'pointer',
                  ...(unreadNotification ? { borderColor: 'primary.main', borderWidth: 2 } : {}),
                }}
                onClick={() => {
                  if (unreadNotification) markNotificationRead(unreadNotification.id);
                  router.push(`/student/drawings/submissions/${s.id}`);
                }}
              >
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Box
                    component="img"
                    src={s.original_image_url}
                    alt="Drawing"
                    sx={{ width: isMobile ? 56 : 70, height: isMobile ? 56 : 70, objectFit: 'cover', borderRadius: 1 }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', gap: 0.5, mb: 0.25, flexWrap: 'wrap', alignItems: 'center' }}>
                      {s.question && <CategoryBadge category={s.question.category} />}
                      <Chip
                        label={STATUS_LABEL[s.status] || s.status}
                        size="small"
                        color={STATUS_COLOR[s.status] || 'default'}
                        sx={isMobile ? { height: 20, fontSize: '0.65rem' } : undefined}
                      />
                      {(s as any).is_gallery_visible && (
                        <Chip
                          icon={<EmojiEventsOutlinedIcon sx={{ fontSize: '0.85rem !important' }} />}
                          label="Gallery"
                          size="small"
                          sx={{
                            height: isMobile ? 20 : 24,
                            fontSize: isMobile ? '0.65rem' : '0.75rem',
                            bgcolor: '#fff8e1',
                            color: '#f57f17',
                            border: '1px solid #ffe082',
                            fontWeight: 700,
                            '& .MuiChip-icon': { color: '#f57f17' },
                          }}
                        />
                      )}
                      {unreadNotification && (
                        <Chip
                          label="New feedback"
                          size="small"
                          color="primary"
                          sx={isMobile ? { height: 20, fontSize: '0.65rem' } : undefined}
                        />
                      )}
                    </Box>
                    <Typography variant="body2" noWrap sx={{ fontSize: isMobile ? '0.8rem' : '0.82rem' }}>
                      {s.question?.question_text || 'Free Practice'}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {s.tutor_rating && (
                        <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>
                          {'★'.repeat(s.tutor_rating)}{'☆'.repeat(5 - s.tutor_rating)}
                        </Typography>
                      )}
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                        {new Date(s.submitted_at).toLocaleDateString()}
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              </Paper>
              );
            })}
          </Box>
        )}
      </Box>
    </Box>
  );
}

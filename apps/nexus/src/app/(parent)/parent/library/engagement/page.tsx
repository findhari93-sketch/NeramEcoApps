'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Skeleton,
  LinearProgress,
  alpha,
  useTheme,
  Chip,
} from '@neram/ui';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import StreakBanner from '@/components/library/engagement/StreakBanner';
import WeeklyActivityDots from '@/components/library/engagement/WeeklyActivityDots';
import EngagementStatusDot from '@/components/library/engagement/EngagementStatusDot';

interface ChildActivityData {
  streak: {
    current_streak_days: number;
    best_streak_days: number;
    engagement_status: 'active' | 'moderate' | 'inactive' | 'new';
    engagement_score: number;
    total_active_days: number;
  };
  total_videos_available: number;
  videos_watched_count: number;
  videos_completed_count: number;
  weekly_activity: { date: string; watched: boolean; watch_seconds: number }[];
  watch_time_this_week: number;
  continue_watching: {
    video_id: string;
    total_watched_seconds: number;
    completed: boolean;
    video: {
      approved_title: string | null;
      suggested_title: string | null;
      duration_seconds: number | null;
    } | null;
  }[];
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export default function ParentLibraryEngagementPage() {
  const theme = useTheme();
  const { getToken } = useNexusAuthContext();
  const [data, setData] = useState<ChildActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('/api/library/engagement/child', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const json = await res.json();
        setData(json.data);
      } else {
        const json = await res.json().catch(() => ({}));
        setError(json.error || 'Failed to load data');
      }
    } catch (err) {
      console.error('Failed to load child engagement:', err);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
          Video Activity
        </Typography>
        <Skeleton variant="rounded" height={80} sx={{ borderRadius: 2.5, mb: 2 }} />
        <Skeleton variant="rounded" height={60} sx={{ borderRadius: 2, mb: 2 }} />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rounded" height={60} sx={{ borderRadius: 2, mb: 1 }} />
        ))}
      </Box>
    );
  }

  if (error || !data) {
    return (
      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
          Video Activity
        </Typography>
        <Paper
          elevation={0}
          sx={{
            p: 3,
            borderRadius: 2,
            border: `1px solid ${theme.palette.divider}`,
            textAlign: 'center',
          }}
        >
          <Typography variant="body2" color="text.secondary">
            {error || 'No linked child found. Please contact the administrator.'}
          </Typography>
        </Paper>
      </Box>
    );
  }

  const { streak, total_videos_available, videos_watched_count, videos_completed_count, weekly_activity, watch_time_this_week, continue_watching } = data;

  // Recent watch history: show last 10 from continue_watching
  const recentHistory = continue_watching.slice(0, 10);

  return (
    <Box>
      {/* Header with status */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          Video Activity
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <EngagementStatusDot status={streak.engagement_status} showLabel />
        </Box>
      </Box>

      {/* Streak Banner */}
      <Box sx={{ mb: 2 }}>
        <StreakBanner
          currentStreak={streak.current_streak_days}
          bestStreak={streak.best_streak_days}
        />
      </Box>

      {/* Stats */}
      <Box
        sx={{
          display: 'flex',
          gap: 1.5,
          mb: 2,
          overflowX: 'auto',
          pb: 0.5,
          '&::-webkit-scrollbar': { display: 'none' },
        }}
      >
        {[
          {
            label: 'Videos Watched',
            value: `${videos_watched_count}`,
            icon: <VideocamOutlinedIcon sx={{ fontSize: '1rem', color: 'primary.main' }} />,
          },
          {
            label: 'This Week',
            value: formatDuration(watch_time_this_week),
            icon: <AccessTimeIcon sx={{ fontSize: '1rem', color: '#ff9800' }} />,
          },
          {
            label: 'Completed',
            value: `${videos_completed_count}`,
            icon: <CheckCircleOutlinedIcon sx={{ fontSize: '1rem', color: '#4caf50' }} />,
          },
        ].map((stat) => (
          <Paper
            key={stat.label}
            elevation={0}
            sx={{
              py: 1.5,
              px: 2,
              borderRadius: 2,
              border: `1px solid ${theme.palette.divider}`,
              textAlign: 'center',
              minWidth: 90,
              flexShrink: 0,
            }}
          >
            {stat.icon}
            <Typography variant="body2" sx={{ fontWeight: 700, mt: 0.25 }}>
              {stat.value}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6rem' }}>
              {stat.label}
            </Typography>
          </Paper>
        ))}
      </Box>

      {/* Weekly Activity */}
      <Paper
        elevation={0}
        sx={{ p: 2, borderRadius: 2, border: `1px solid ${theme.palette.divider}`, mb: 2.5 }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, fontSize: '0.8rem' }}>
          Weekly Activity
        </Typography>
        <WeeklyActivityDots data={weekly_activity} />
      </Paper>

      {/* Recent Watch History */}
      <Box sx={{ mb: 2.5 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, fontSize: '0.85rem' }}>
          Recent Watch History
        </Typography>
        {recentHistory.length === 0 ? (
          <Typography variant="caption" color="text.secondary">
            No videos watched yet
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {recentHistory.map((item) => {
              const videoTitle = item.video?.approved_title || item.video?.suggested_title || 'Untitled';
              const durationSec = item.video?.duration_seconds || 0;
              const progressPct = durationSec > 0 ? Math.min(100, (item.total_watched_seconds / durationSec) * 100) : 0;

              return (
                <Paper
                  key={item.video_id}
                  elevation={0}
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    border: `1px solid ${theme.palette.divider}`,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 600,
                        fontSize: '0.8rem',
                        flex: 1,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        mr: 1,
                      }}
                    >
                      {videoTitle}
                    </Typography>
                    {item.completed && (
                      <Chip
                        label="Done"
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: '0.6rem',
                          fontWeight: 600,
                          bgcolor: alpha('#4caf50', 0.1),
                          color: '#4caf50',
                        }}
                      />
                    )}
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ flex: 1 }}>
                      <LinearProgress
                        variant="determinate"
                        value={progressPct}
                        sx={{
                          height: 4,
                          borderRadius: 2,
                          bgcolor: theme.palette.grey[200],
                          '& .MuiLinearProgress-bar': {
                            borderRadius: 2,
                            bgcolor: item.completed ? '#4caf50' : theme.palette.primary.main,
                          },
                        }}
                      />
                    </Box>
                    <Typography variant="caption" sx={{ fontWeight: 500, fontSize: '0.65rem', flexShrink: 0 }}>
                      {Math.round(progressPct)}%
                    </Typography>
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

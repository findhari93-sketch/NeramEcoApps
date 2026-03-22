'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Skeleton,
  Avatar,
  Chip,
  IconButton,
  LinearProgress,
  alpha,
  useTheme,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import BookmarkOutlinedIcon from '@mui/icons-material/BookmarkOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import PeriodToggle from '@/components/library/engagement/PeriodToggle';
import EngagementStatusDot from '@/components/library/engagement/EngagementStatusDot';
import WatchTimeChart from '@/components/library/engagement/WatchTimeChart';
import StreakDisplay from '@/components/library/engagement/StreakDisplay';

interface StudentEngagement {
  student: {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  };
  streak: {
    current_streak_days: number;
    best_streak_days: number;
    total_active_days: number;
    engagement_status: 'active' | 'moderate' | 'inactive' | 'new';
    engagement_score: number;
  };
  daily_activity: {
    activity_date: string;
    total_watch_seconds: number;
    videos_watched: number;
  }[];
  videos_watched: {
    video_id: string;
    title: string;
    completion_pct: number;
    total_watched_seconds: number;
    watch_count: number;
    last_watched_at: string;
  }[];
  replay_patterns: {
    video_id: string;
    title: string;
    segments: { start: number; end: number; count: number }[];
  }[];
  bookmarks: {
    id: string;
    video_id: string;
    video_title: string;
    timestamp_seconds: number | null;
    note: string | null;
    created_at: string;
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

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function StudentEngagementDetailPage() {
  const params = useParams();
  const router = useRouter();
  const theme = useTheme();
  const { getToken } = useNexusAuthContext();

  const studentId = params.studentId as string;
  const [period, setPeriod] = useState('weekly');
  const [data, setData] = useState<StudentEngagement | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(
        `/api/library/engagement/student/${studentId}?period=${period}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.ok) {
        const json = await res.json();
        setData(json.data);
      }
    } catch (err) {
      console.error('Failed to load student engagement:', err);
    } finally {
      setLoading(false);
    }
  }, [getToken, studentId, period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <IconButton onClick={() => router.back()} size="small">
            <ArrowBackIcon />
          </IconButton>
          <Skeleton width={200} height={28} />
        </Box>
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} variant="rounded" height={80} sx={{ borderRadius: 2, mb: 1.5 }} />
        ))}
      </Box>
    );
  }

  if (!data) {
    return (
      <Box>
        <IconButton onClick={() => router.back()} size="small" sx={{ mb: 2 }}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="body2" color="text.secondary">Student not found</Typography>
      </Box>
    );
  }

  const { student, streak, daily_activity, videos_watched, replay_patterns, bookmarks } = data;

  // Prepare chart data from daily_activity
  const chartData = daily_activity.map((d) => ({
    label: new Date(d.activity_date + 'T00:00:00').toLocaleDateString('en-IN', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }),
    value: d.total_watch_seconds,
  }));

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
        <IconButton onClick={() => router.back()} size="small">
          <ArrowBackIcon />
        </IconButton>
        <Avatar
          src={student.avatar_url || undefined}
          sx={{ width: 40, height: 40 }}
        >
          {student.first_name?.[0]}{student.last_name?.[0]}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {student.first_name} {student.last_name}
            </Typography>
            <EngagementStatusDot status={streak.engagement_status} showLabel />
          </Box>
          <Typography variant="caption" color="text.secondary">
            Score: {streak.engagement_score}/100
          </Typography>
        </Box>
      </Box>

      {/* Period Toggle */}
      <Box sx={{ mb: 2.5 }}>
        <PeriodToggle value={period} onChange={setPeriod} />
      </Box>

      {/* Streak Display */}
      <Box sx={{ mb: 2.5 }}>
        <StreakDisplay
          currentStreak={streak.current_streak_days}
          bestStreak={streak.best_streak_days}
          totalDays={streak.total_active_days}
        />
      </Box>

      {/* Watch Time Chart */}
      {chartData.length > 0 && (
        <Paper
          elevation={0}
          sx={{ p: 2, borderRadius: 2, border: `1px solid ${theme.palette.divider}`, mb: 2.5 }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, fontSize: '0.85rem' }}>
            Watch Time
          </Typography>
          <WatchTimeChart data={chartData} />
        </Paper>
      )}

      {/* Videos Watched */}
      <Box sx={{ mb: 2.5 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, fontSize: '0.85rem' }}>
          Videos Watched ({videos_watched.length})
        </Typography>
        {videos_watched.length === 0 ? (
          <Typography variant="caption" color="text.secondary">
            No videos watched in this period
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {videos_watched.map((v) => (
              <Paper
                key={v.video_id}
                elevation={0}
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  border: `1px solid ${theme.palette.divider}`,
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem', mb: 0.5 }}>
                  {v.title}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.75 }}>
                  <Box sx={{ flex: 1 }}>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(v.completion_pct, 100)}
                      sx={{
                        height: 6,
                        borderRadius: 3,
                        bgcolor: theme.palette.grey[200],
                        '& .MuiLinearProgress-bar': {
                          borderRadius: 3,
                          bgcolor: v.completion_pct >= 90 ? '#4caf50' : theme.palette.primary.main,
                        },
                      }}
                    />
                  </Box>
                  <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.7rem', flexShrink: 0 }}>
                    {Math.round(v.completion_pct)}%
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1.5 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                    {v.watch_count}x watched
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                    {formatDuration(v.total_watched_seconds)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                    Last: {new Date(v.last_watched_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                  </Typography>
                </Box>
              </Paper>
            ))}
          </Box>
        )}
      </Box>

      {/* Replay Patterns */}
      {replay_patterns.length > 0 && (
        <Box sx={{ mb: 2.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, fontSize: '0.85rem' }}>
            Replay Patterns
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {replay_patterns.map((rp) => (
              <Paper
                key={rp.video_id}
                elevation={0}
                sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${theme.palette.divider}` }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem', mb: 0.75 }}>
                  {rp.title}
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {rp.segments.map((seg, idx) => (
                    <Chip
                      key={idx}
                      label={`${formatTimestamp(seg.start)} - ${formatTimestamp(seg.end)} (${seg.count}x)`}
                      size="small"
                      sx={{
                        height: 22,
                        fontSize: '0.65rem',
                        bgcolor: alpha(theme.palette.warning.main, 0.1),
                        color: theme.palette.warning.dark,
                      }}
                    />
                  ))}
                </Box>
              </Paper>
            ))}
          </Box>
        </Box>
      )}

      {/* Bookmarks */}
      {bookmarks.length > 0 && (
        <Box sx={{ mb: 2.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, fontSize: '0.85rem' }}>
            Bookmarks ({bookmarks.length})
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            {bookmarks.map((b) => (
              <Box
                key={b.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  p: 1,
                  borderRadius: 1.5,
                  bgcolor: alpha(theme.palette.primary.main, 0.04),
                }}
              >
                <BookmarkOutlinedIcon sx={{ fontSize: '1rem', color: 'primary.main' }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 600,
                      display: 'block',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      fontSize: '0.75rem',
                    }}
                  >
                    {b.video_title}
                  </Typography>
                  {b.note && (
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                      {b.note}
                    </Typography>
                  )}
                </Box>
                {b.timestamp_seconds !== null && (
                  <Typography variant="caption" sx={{ fontWeight: 500, color: 'text.secondary', fontSize: '0.65rem' }}>
                    at {formatTimestamp(b.timestamp_seconds)}
                  </Typography>
                )}
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}

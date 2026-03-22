'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Grid,
  Skeleton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import BarChartIcon from '@mui/icons-material/BarChart';
import PersonOffOutlinedIcon from '@mui/icons-material/PersonOffOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import StatCard from '@/components/StatCard';
import PeriodToggle from '@/components/library/engagement/PeriodToggle';
import StudentEngagementList from '@/components/library/engagement/StudentEngagementList';
import TopVideosWidget from '@/components/library/engagement/TopVideosWidget';

interface ClassAggregates {
  total_students: number;
  active_students: number;
  moderate_students: number;
  inactive_students: number;
  new_students: number;
  total_watch_hours: number;
  avg_completion_pct: number;
  videos_watched: number;
}

interface StudentData {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  engagement_status: 'active' | 'moderate' | 'inactive' | 'new';
  engagement_score: number;
  videos_watched: number;
  total_watch_hours: number;
  avg_completion_pct: number;
  current_streak: number;
  last_active: string | null;
  bookmark_count: number;
  rewind_ratio: number;
}

interface TopVideo {
  video_id: string;
  title: string;
  watch_count: number;
  avg_completion: number;
}

interface LeastVideo {
  video_id: string;
  title: string;
  watch_count: number;
}

interface DashboardData {
  class_aggregates: ClassAggregates;
  students: StudentData[];
  top_videos: TopVideo[];
  least_watched_videos: LeastVideo[];
}

function formatHours(hours: number): string {
  if (hours <= 0) return '0m';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export default function EngagementDashboardPage() {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const { getToken, activeClassroom, classrooms } = useNexusAuthContext();

  const [period, setPeriod] = useState('weekly');
  const [classroomId, setClassroomId] = useState(activeClassroom?.id || '');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const params = new URLSearchParams({ period });
      if (classroomId) params.set('classroom', classroomId);

      const res = await fetch(`/api/library/engagement/dashboard?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const json = await res.json();
        setData(json.data);
      }
    } catch (err) {
      console.error('Failed to load engagement dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, [getToken, period, classroomId]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  useEffect(() => {
    if (activeClassroom?.id && !classroomId) {
      setClassroomId(activeClassroom.id);
    }
  }, [activeClassroom, classroomId]);

  const agg = data?.class_aggregates;

  return (
    <Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
        Video Engagement
      </Typography>

      {/* Controls: Period toggle + Classroom filter */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexDirection: { xs: 'column', sm: 'row' }, alignItems: { sm: 'center' } }}>
        <Box sx={{ flex: 1 }}>
          <PeriodToggle value={period} onChange={setPeriod} />
        </Box>
        {classrooms.length > 1 && (
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel sx={{ fontSize: '0.8rem' }}>Classroom</InputLabel>
            <Select
              value={classroomId}
              onChange={(e) => setClassroomId(e.target.value as string)}
              label="Classroom"
              sx={{ fontSize: '0.8rem' }}
            >
              <MenuItem value="">All Classrooms</MenuItem>
              {classrooms
                .filter((c) => c.enrollmentRole === 'teacher')
                .map((c) => (
                  <MenuItem key={c.id} value={c.id} sx={{ fontSize: '0.8rem' }}>
                    {c.name}
                  </MenuItem>
                ))}
            </Select>
          </FormControl>
        )}
      </Box>

      {/* StatCards: 2x2 grid */}
      <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
        {loading ? (
          [1, 2, 3, 4].map((i) => (
            <Grid item xs={6} key={i}>
              <Skeleton variant="rounded" height={72} sx={{ borderRadius: 2 }} />
            </Grid>
          ))
        ) : (
          <>
            <Grid item xs={6}>
              <StatCard
                title="Active Students"
                value={agg?.active_students ?? 0}
                icon={<PeopleOutlinedIcon />}
                color="#4caf50"
                size="compact"
                variant="surface"
                subtitle={`of ${agg?.total_students ?? 0} total`}
              />
            </Grid>
            <Grid item xs={6}>
              <StatCard
                title="Watch Hours"
                value={formatHours(agg?.total_watch_hours ?? 0)}
                icon={<AccessTimeIcon />}
                size="compact"
                variant="surface"
              />
            </Grid>
            <Grid item xs={6}>
              <StatCard
                title="Avg Completion"
                value={`${agg?.avg_completion_pct ?? 0}%`}
                icon={<BarChartIcon />}
                size="compact"
                variant="surface"
              />
            </Grid>
            <Grid item xs={6}>
              <StatCard
                title="Inactive"
                value={agg?.inactive_students ?? 0}
                icon={<PersonOffOutlinedIcon />}
                color="#f44336"
                size="compact"
                variant="surface"
              />
            </Grid>
          </>
        )}
      </Grid>

      {/* Student Engagement List */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
          Students
        </Typography>
        {loading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} variant="rounded" height={80} sx={{ borderRadius: 2 }} />
            ))}
          </Box>
        ) : (
          <StudentEngagementList students={data?.students || []} />
        )}
      </Box>

      {/* Top/Least Videos - desktop only on larger layouts, always shown on this page */}
      {!loading && data && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
            Video Performance
          </Typography>
          <TopVideosWidget
            topVideos={data.top_videos}
            leastWatchedVideos={data.least_watched_videos}
          />
        </Box>
      )}
    </Box>
  );
}

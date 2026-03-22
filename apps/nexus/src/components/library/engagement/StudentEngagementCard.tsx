'use client';

import { Box, Typography, Paper, useTheme } from '@neram/ui';
import { useRouter } from 'next/navigation';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import EngagementStatusDot from './EngagementStatusDot';

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
}

interface StudentEngagementCardProps {
  student: StudentData;
}

function formatHours(hours: number): string {
  if (hours <= 0) return '0m';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function formatLastActive(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}

export default function StudentEngagementCard({ student }: StudentEngagementCardProps) {
  const router = useRouter();
  const theme = useTheme();

  return (
    <Paper
      elevation={0}
      onClick={() => router.push(`/teacher/library/engagement/${student.id}`)}
      sx={{
        p: 2,
        borderRadius: 2,
        border: `1px solid ${theme.palette.divider}`,
        cursor: 'pointer',
        transition: 'all 200ms ease',
        '&:active': { transform: 'scale(0.98)' },
        '&:hover': {
          borderColor: theme.palette.primary.light,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <EngagementStatusDot status={student.engagement_status} />
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {student.first_name} {student.last_name}
          </Typography>
        </Box>
        <Typography
          variant="caption"
          sx={{ fontWeight: 700, color: 'text.secondary', fontSize: '0.8rem' }}
        >
          {student.engagement_score}/100
        </Typography>
      </Box>

      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>
        {student.videos_watched} videos &middot; {formatHours(student.total_watch_hours)}
      </Typography>

      {student.current_streak > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
          <LocalFireDepartmentIcon sx={{ fontSize: '0.9rem', color: '#ff9800' }} />
          <Typography variant="caption" sx={{ fontWeight: 600, color: '#ff9800', fontSize: '0.7rem' }}>
            {student.current_streak} day streak
          </Typography>
        </Box>
      )}

      <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.65rem' }}>
        Last active: {formatLastActive(student.last_active)}
      </Typography>
    </Paper>
  );
}

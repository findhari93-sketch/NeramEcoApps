'use client';

import { useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardActionArea,
  Typography,
  Chip,
  LinearProgress,
  Box,
} from '@neram/ui';

interface CoursePlanCardProps {
  plan: {
    id: string;
    name: string;
    description?: string | null;
    status: string;
    duration_weeks: number;
    week_count: number;
    session_count: number;
    sessions_per_day?: Array<{ slot: string; label?: string }>;
    days_per_week?: string[];
  };
}

const STATUS_COLORS: Record<string, 'default' | 'success' | 'info' | 'warning'> = {
  draft: 'default',
  active: 'success',
  completed: 'info',
  paused: 'warning',
};

export default function CoursePlanCard({ plan }: CoursePlanCardProps) {
  const router = useRouter();

  const totalSessions = plan.session_count || 0;
  // We don't have completed count from the list endpoint, show 0 for now
  const scheduledSessions = 0;
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
        onClick={() => router.push(`/teacher/course-plans/${plan.id}`)}
        sx={{ p: 0 }}
      >
        <CardContent sx={{ p: { xs: 2, sm: 2.5 }, '&:last-child': { pb: { xs: 2, sm: 2.5 } } }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1, mb: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: { xs: '1rem', sm: '1.15rem' }, lineHeight: 1.3 }}>
              {plan.name}
            </Typography>
            <Chip
              label={plan.status}
              size="small"
              color={STATUS_COLORS[plan.status] || 'default'}
              sx={{ textTransform: 'capitalize', fontWeight: 600, fontSize: '0.7rem', height: 24 }}
            />
          </Box>

          {plan.description && (
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
              {plan.description}
            </Typography>
          )}

          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, fontWeight: 500 }}>
            {plan.week_count} week{plan.week_count !== 1 ? 's' : ''} &bull; {totalSessions} session{totalSessions !== 1 ? 's' : ''}
          </Typography>

          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="caption" color="text.secondary">
                Progress
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {scheduledSessions}/{totalSessions}
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

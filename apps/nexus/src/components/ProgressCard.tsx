'use client';

import { Card, CardContent, Typography, LinearProgress, Box } from '@neram/ui';

interface ProgressCardProps {
  title: string;
  completed: number;
  total: number;
  percentage: number;
  color?: string;
}

export default function ProgressCard({
  title,
  completed,
  total,
  percentage,
  color = '#1976d2',
}: ProgressCardProps) {
  return (
    <Card
      sx={{
        height: '100%',
        transition: 'transform 0.2s, box-shadow 0.2s',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: 4,
        },
      }}
    >
      <CardContent>
        <Typography
          variant="h6"
          component="h3"
          gutterBottom
          sx={{ fontWeight: 600, mb: 2 }}
        >
          {title}
        </Typography>

        <Box sx={{ mb: 1 }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              mb: 0.5,
            }}
          >
            <Typography variant="body2" color="text.secondary">
              Progress
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {completed}/{total}
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={percentage}
            sx={{
              height: 8,
              borderRadius: 1,
              backgroundColor: 'rgba(0, 0, 0, 0.08)',
              '& .MuiLinearProgress-bar': {
                backgroundColor: color,
                borderRadius: 1,
              },
            }}
          />
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, color }}>
            {percentage}%
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {total - completed} lessons left
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}

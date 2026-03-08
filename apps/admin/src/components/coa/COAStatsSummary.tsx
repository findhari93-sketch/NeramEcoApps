'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  LinearProgress,
  Skeleton,
  Divider,
} from '@neram/ui';
import SchoolIcon from '@mui/icons-material/School';
import EventSeatIcon from '@mui/icons-material/EventSeat';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import MapIcon from '@mui/icons-material/Map';
import type { CoaStatStat } from '@neram/database';
import { getCOAStats } from '@neram/database';

interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
}

function StatCard({ label, value, icon, color }: StatCardProps) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 2, flex: 1, minWidth: 140 }}>
      <CardContent sx={{ pb: '12px !important' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: 1,
              bgcolor: `${color}20`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {icon}
          </Box>
          <Typography variant="body2" color="text.secondary" fontWeight={500}>
            {label}
          </Typography>
        </Box>
        <Typography variant="h5" fontWeight={700} sx={{ color }}>
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}

export default function COAStatsSummary() {
  const [stats, setStats] = useState<CoaStatStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCOAStats()
      .then(setStats)
      .catch(() => setStats([]))
      .finally(() => setLoading(false));
  }, []);

  const totalColleges = stats.reduce((s, r) => s + r.college_count, 0);
  const totalSeats = stats.reduce((s, r) => s + r.total_seats, 0);
  const activeColleges = stats.reduce((s, r) => s + r.active_colleges, 0);
  const totalStates = stats.length;

  const top10 = stats.slice(0, 10);
  const maxSeats = top10[0]?.total_seats || 1;

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} variant="rectangular" height={88} sx={{ flex: 1, minWidth: 140, borderRadius: 2 }} />
          ))}
        </Box>
        <Skeleton variant="rectangular" height={280} sx={{ borderRadius: 2 }} />
      </Box>
    );
  }

  return (
    <Box>
      {/* Summary cards */}
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 3 }}>
        <StatCard
          label="Total Colleges"
          value={totalColleges}
          icon={<SchoolIcon sx={{ fontSize: 18, color: '#0277BD' }} />}
          color="#0277BD"
        />
        <StatCard
          label="Total Seats"
          value={totalSeats.toLocaleString()}
          icon={<EventSeatIcon sx={{ fontSize: 18, color: '#7B1FA2' }} />}
          color="#7B1FA2"
        />
        <StatCard
          label="Active (2025-26)"
          value={activeColleges}
          icon={<CheckCircleIcon sx={{ fontSize: 18, color: '#10B981' }} />}
          color="#10B981"
        />
        <StatCard
          label="States / UTs"
          value={totalStates}
          icon={<MapIcon sx={{ fontSize: 18, color: '#F59E0B' }} />}
          color="#F59E0B"
        />
      </Box>

      {/* Top states by seats */}
      <Card variant="outlined" sx={{ borderRadius: 2 }}>
        <CardContent>
          <Typography variant="subtitle2" fontWeight={700} gutterBottom>
            Top States by Total Seats
          </Typography>
          <Divider sx={{ mb: 1.5 }} />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {top10.map((row) => (
              <Box key={row.state}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
                  <Typography variant="caption" fontWeight={600}>
                    {row.state}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      {row.college_count} colleges
                    </Typography>
                    <Typography variant="caption" fontWeight={700}>
                      {row.total_seats} seats
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                  <Box sx={{ flex: 1 }}>
                    <LinearProgress
                      variant="determinate"
                      value={(row.active_seats / maxSeats) * 100}
                      color="success"
                      sx={{ height: 6, borderRadius: 1, bgcolor: 'action.hover' }}
                    />
                  </Box>
                  <Typography variant="caption" color="success.main" sx={{ width: 60, textAlign: 'right' }}>
                    {row.active_seats} active
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        </CardContent>
      </Card>

      {/* Status distribution */}
      <Card variant="outlined" sx={{ borderRadius: 2, mt: 2 }}>
        <CardContent>
          <Typography variant="subtitle2" fontWeight={700} gutterBottom>
            Approval Status Distribution
          </Typography>
          <Divider sx={{ mb: 1.5 }} />
          {[
            {
              label: 'Active (2025-26)',
              value: activeColleges,
              color: '#10B981',
            },
            {
              label: 'Valid till 2025',
              value: stats.reduce((s, r) => s + r.expiring_colleges, 0),
              color: '#F59E0B',
            },
            {
              label: 'Check with COA',
              value: totalColleges - activeColleges - stats.reduce((s, r) => s + r.expiring_colleges, 0),
              color: '#EF4444',
            },
          ].map((item) => (
            <Box key={item.label} sx={{ mb: 1.25 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
                <Typography variant="caption" fontWeight={500}>
                  {item.label}
                </Typography>
                <Typography variant="caption" fontWeight={700}>
                  {item.value} ({totalColleges ? Math.round((item.value / totalColleges) * 100) : 0}%)
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={totalColleges ? (item.value / totalColleges) * 100 : 0}
                sx={{
                  height: 8,
                  borderRadius: 1,
                  bgcolor: 'action.hover',
                  '& .MuiLinearProgress-bar': { bgcolor: item.color },
                }}
              />
            </Box>
          ))}
        </CardContent>
      </Card>
    </Box>
  );
}

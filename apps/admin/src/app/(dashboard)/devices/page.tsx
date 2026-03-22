'use client';

import { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Skeleton,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Chip,
  Avatar,
  Divider,
} from '@mui/material';
import DevicesIcon from '@mui/icons-material/Devices';
import LaptopIcon from '@mui/icons-material/Laptop';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import GroupIcon from '@mui/icons-material/Group';
import BlockIcon from '@mui/icons-material/Block';
import CloseIcon from '@mui/icons-material/Close';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import type { DeviceDistributionStats, StudentDeviceSummary } from '@neram/database';
import { DeviceDistributionChart } from '@/components/devices/DeviceDistributionChart';
import { StudentDeviceTable } from '@/components/devices/StudentDeviceTable';

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{ p: 2.5, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 2 }}
    >
      <Box
        sx={{
          width: 48,
          height: 48,
          borderRadius: 2,
          bgcolor: `${color}15`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </Box>
      <Box>
        <Typography variant="h5" fontWeight={700}>
          {value}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
      </Box>
    </Paper>
  );
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function StudentDetailDialog({
  userId,
  open,
  onClose,
}: {
  userId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<StudentDeviceSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId || !open) return;
    setLoading(true);
    fetch(`/api/devices?type=student-detail&userId=${userId}`)
      .then((r) => r.json())
      .then((d) => setDetail(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId, open]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <DevicesIcon />
          Student Device Details
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {loading ? (
          <Skeleton variant="rounded" height={200} />
        ) : detail ? (
          <Box>
            {/* Student info */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
              <Avatar src={detail.user_avatar || undefined} sx={{ width: 48, height: 48 }}>
                {detail.user_name?.[0]}
              </Avatar>
              <Box>
                <Typography variant="subtitle1" fontWeight={600}>
                  {detail.user_name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {detail.user_email}
                </Typography>
              </Box>
            </Box>

            <Divider sx={{ mb: 2 }} />

            {/* Devices */}
            {detail.devices.length === 0 ? (
              <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                No devices registered
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {detail.devices.map((device) => (
                  <Paper key={device.id} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                      {device.device_category === 'desktop' ? (
                        <LaptopIcon color="primary" />
                      ) : (
                        <PhoneAndroidIcon color="secondary" />
                      )}
                      <Typography variant="subtitle2" fontWeight={600}>
                        {device.device_name || device.device_category}
                      </Typography>
                      <Chip
                        label={device.device_category}
                        size="small"
                        color={device.device_category === 'desktop' ? 'primary' : 'secondary'}
                        sx={{ height: 22, fontSize: '0.7rem' }}
                      />
                    </Box>

                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      {device.os} {device.os_version} · {device.browser}
                      {device.screen_width ? ` · ${device.screen_width}×${device.screen_height}` : ''}
                      {device.is_pwa ? ' · PWA' : ''}
                    </Typography>

                    <Box sx={{ display: 'flex', gap: 3, mt: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <AccessTimeIcon sx={{ fontSize: 16 }} />
                        <Typography variant="body2">
                          {formatTime(device.total_active_seconds)} active
                        </Typography>
                      </Box>
                      <Typography variant="body2" color="text.secondary">
                        {device.session_count} sessions
                      </Typography>
                    </Box>

                    {device.last_city && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
                        <LocationOnIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                        <Typography variant="body2" color="text.secondary">
                          {[device.last_city, device.last_state, device.last_country]
                            .filter(Boolean)
                            .join(', ')}
                        </Typography>
                      </Box>
                    )}
                  </Paper>
                ))}
              </Box>
            )}
          </Box>
        ) : (
          <Typography color="text.secondary">Student not found</Typography>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function DevicesPage() {
  const [stats, setStats] = useState<DeviceDistributionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/devices?type=stats')
      .then((r) => r.json())
      .then((s) => setStats(s))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <DevicesIcon sx={{ fontSize: 28, color: 'primary.main' }} />
        <Typography variant="h5" fontWeight={700}>
          Student Devices
        </Typography>
      </Box>

      {/* Stat cards */}
      {loading ? (
        <Grid container spacing={2} sx={{ mb: 4 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Grid item xs={12} sm={6} md key={i}>
              <Skeleton variant="rounded" height={80} sx={{ borderRadius: 2 }} />
            </Grid>
          ))}
        </Grid>
      ) : stats ? (
        <Grid container spacing={2} sx={{ mb: 4 }}>
          <Grid item xs={12} sm={6} md>
            <StatCard
              label="Total Students"
              value={stats.total_students}
              icon={<GroupIcon sx={{ color: '#1976d2' }} />}
              color="#1976d2"
            />
          </Grid>
          <Grid item xs={12} sm={6} md>
            <StatCard
              label="Both Devices"
              value={stats.both_devices}
              icon={<DevicesIcon sx={{ color: '#2e7d32' }} />}
              color="#2e7d32"
            />
          </Grid>
          <Grid item xs={12} sm={6} md>
            <StatCard
              label="Desktop Only"
              value={stats.desktop_only}
              icon={<LaptopIcon sx={{ color: '#1976d2' }} />}
              color="#1976d2"
            />
          </Grid>
          <Grid item xs={12} sm={6} md>
            <StatCard
              label="Mobile Only"
              value={stats.mobile_only}
              icon={<PhoneAndroidIcon sx={{ color: '#ed6c02' }} />}
              color="#ed6c02"
            />
          </Grid>
          <Grid item xs={12} sm={6} md>
            <StatCard
              label="No Devices"
              value={stats.no_devices}
              icon={<BlockIcon sx={{ color: '#9e9e9e' }} />}
              color="#9e9e9e"
            />
          </Grid>
        </Grid>
      ) : null}

      {/* Distribution chart */}
      {stats && (
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, mb: 4 }}>
          <Typography variant="h6" fontWeight={600} gutterBottom>
            Device Distribution
          </Typography>
          <DeviceDistributionChart stats={stats} />
        </Paper>
      )}

      {/* Student device table */}
      <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
        <Typography variant="h6" fontWeight={600} gutterBottom>
          Student Device List
        </Typography>
        <StudentDeviceTable onViewStudent={(id) => setSelectedStudentId(id)} />
      </Paper>

      {/* Student detail dialog */}
      <StudentDetailDialog
        userId={selectedStudentId}
        open={!!selectedStudentId}
        onClose={() => setSelectedStudentId(null)}
      />
    </Box>
  );
}

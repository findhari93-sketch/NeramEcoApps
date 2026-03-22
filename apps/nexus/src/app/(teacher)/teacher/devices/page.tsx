'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Chip,
  Avatar,
  Skeleton,
  TextField,
  InputAdornment,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  Divider,
  Paper,
} from '@mui/material';
import DevicesIcon from '@mui/icons-material/Devices';
import LaptopIcon from '@mui/icons-material/Laptop';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import GroupIcon from '@mui/icons-material/Group';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import type { DeviceDistributionStats, StudentDeviceSummary } from '@neram/database';

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatLastActive(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 5) return 'Online';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

// Horizontal scroll stat cards (mobile-first, matching Nexus pattern)
function StatsRow({ stats }: { stats: DeviceDistributionStats }) {
  const items = [
    { label: 'Total', value: stats.total_students, color: '#1976d2', icon: <GroupIcon sx={{ fontSize: 20 }} /> },
    { label: 'Both', value: stats.both_devices, color: '#2e7d32', icon: <DevicesIcon sx={{ fontSize: 20 }} /> },
    { label: 'Desktop', value: stats.desktop_only, color: '#1565c0', icon: <LaptopIcon sx={{ fontSize: 20 }} /> },
    { label: 'Mobile', value: stats.mobile_only, color: '#e65100', icon: <PhoneAndroidIcon sx={{ fontSize: 20 }} /> },
    { label: 'None', value: stats.no_devices, color: '#9e9e9e', icon: <DevicesIcon sx={{ fontSize: 20, opacity: 0.5 }} /> },
  ];

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 1.5,
        overflowX: 'auto',
        pb: 1,
        px: 0.5,
        '&::-webkit-scrollbar': { display: 'none' },
        scrollbarWidth: 'none',
      }}
    >
      {items.map((item) => (
        <Card
          key={item.label}
          variant="outlined"
          sx={{
            minWidth: 100,
            flexShrink: 0,
            borderRadius: 2,
            borderColor: item.color,
            borderWidth: 1.5,
          }}
        >
          <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5, color: item.color }}>
              {item.icon}
            </Box>
            <Typography variant="h5" fontWeight={700} sx={{ color: item.color }}>
              {item.value}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {item.label}
            </Typography>
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}

// Student card for mobile layout
function StudentDeviceCard({
  student,
  onTap,
}: {
  student: StudentDeviceSummary;
  onTap: () => void;
}) {
  const statusColors: Record<string, string> = {
    both: '#2e7d32',
    desktop_only: '#1976d2',
    mobile_only: '#e65100',
    none: '#9e9e9e',
  };

  return (
    <Card
      variant="outlined"
      sx={{ borderRadius: 2, cursor: 'pointer' }}
      onClick={onTap}
    >
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Avatar
            src={student.user_avatar || undefined}
            sx={{ width: 40, height: 40, fontSize: 16 }}
          >
            {student.user_name?.[0]?.toUpperCase()}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" fontWeight={600} noWrap>
              {student.user_name}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              {student.devices.map((d) =>
                d.device_category === 'desktop' ? (
                  <LaptopIcon key={d.id} sx={{ fontSize: 16, color: 'primary.main' }} />
                ) : (
                  <PhoneAndroidIcon key={d.id} sx={{ fontSize: 16, color: 'secondary.main' }} />
                )
              )}
              {student.devices.length === 0 && (
                <Typography variant="caption" color="text.secondary">No devices</Typography>
              )}
              <Typography variant="caption" color="text.secondary">
                · {formatTime(student.total_active_time)}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ textAlign: 'right' }}>
            <Typography
              variant="caption"
              sx={{
                color: student.last_active && formatLastActive(student.last_active) === 'Online'
                  ? 'success.main'
                  : 'text.secondary',
                fontWeight: formatLastActive(student.last_active) === 'Online' ? 600 : 400,
              }}
            >
              {formatLastActive(student.last_active)}
            </Typography>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

// Student detail bottom sheet / dialog
function StudentDetailSheet({
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
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      PaperProps={{
        sx: {
          borderRadius: { xs: '16px 16px 0 0', sm: 3 },
          position: { xs: 'fixed', sm: 'relative' },
          bottom: { xs: 0, sm: 'auto' },
          m: { xs: 0, sm: 2 },
          maxHeight: { xs: '80vh', sm: '90vh' },
        },
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
        Device Details
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {loading ? (
          <Skeleton variant="rounded" height={160} />
        ) : detail ? (
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <Avatar src={detail.user_avatar || undefined} sx={{ width: 48, height: 48 }}>
                {detail.user_name?.[0]}
              </Avatar>
              <Box>
                <Typography variant="subtitle1" fontWeight={600}>{detail.user_name}</Typography>
                <Typography variant="caption" color="text.secondary">{detail.user_email}</Typography>
              </Box>
            </Box>

            <Divider sx={{ mb: 2 }} />

            {detail.devices.length === 0 ? (
              <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                No devices registered
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {detail.devices.map((device) => (
                  <Paper key={device.id} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      {device.device_category === 'desktop' ? (
                        <LaptopIcon color="primary" fontSize="small" />
                      ) : (
                        <PhoneAndroidIcon color="secondary" fontSize="small" />
                      )}
                      <Typography variant="subtitle2" fontWeight={600}>
                        {device.device_name || device.device_category}
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                      {device.os} {device.os_version} · {device.browser}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 2, mt: 1, flexWrap: 'wrap' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <AccessTimeIcon sx={{ fontSize: 14 }} />
                        <Typography variant="caption">{formatTime(device.total_active_seconds)}</Typography>
                      </Box>
                      <Typography variant="caption" color="text.secondary">
                        {device.session_count} sessions
                      </Typography>
                    </Box>
                    {device.last_city && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
                        <LocationOnIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                        <Typography variant="caption" color="text.secondary">
                          {[device.last_city, device.last_state].filter(Boolean).join(', ')}
                        </Typography>
                      </Box>
                    )}
                  </Paper>
                ))}
              </Box>
            )}
          </Box>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export default function TeacherDevicesPage() {
  const [stats, setStats] = useState<DeviceDistributionStats | null>(null);
  const [students, setStudents] = useState<StudentDeviceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    fetch('/api/devices?type=stats')
      .then((r) => r.json())
      .then((s) => setStats(s))
      .catch(() => {});
  }, []);

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ type: 'students', limit: '50' });
      if (search) params.set('search', search);
      const res = await fetch(`/api/devices?${params}`);
      if (res.ok) {
        const result = await res.json();
        setStudents(result.data || []);
      }
    } catch {}
    setLoading(false);
  }, [search]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto', px: 2, py: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <DevicesIcon sx={{ color: 'primary.main' }} />
        <Typography variant="h6" fontWeight={700}>
          Student Devices
        </Typography>
      </Box>

      {/* Stats row (horizontal scroll on mobile) */}
      {stats && <StatsRow stats={stats} />}

      {/* Distribution bar (simple) */}
      {stats && stats.total_students > 0 && (
        <Box sx={{ mt: 2, mb: 2 }}>
          <Box sx={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', bgcolor: 'grey.100' }}>
            <Box sx={{ width: `${(stats.both_devices / stats.total_students) * 100}%`, bgcolor: 'success.main' }} />
            <Box sx={{ width: `${(stats.desktop_only / stats.total_students) * 100}%`, bgcolor: 'primary.main' }} />
            <Box sx={{ width: `${(stats.mobile_only / stats.total_students) * 100}%`, bgcolor: 'warning.main' }} />
            <Box sx={{ width: `${(stats.no_devices / stats.total_students) * 100}%`, bgcolor: 'grey.400' }} />
          </Box>
        </Box>
      )}

      {/* Search */}
      <TextField
        placeholder="Search students..."
        size="small"
        fullWidth
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
        }}
        sx={{ mb: 2 }}
      />

      {/* Student list */}
      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={72} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
      ) : students.length === 0 ? (
        <Typography color="text.secondary" textAlign="center" sx={{ py: 4 }}>
          No students found
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {students.map((s) => (
            <StudentDeviceCard
              key={s.user_id}
              student={s}
              onTap={() => setSelectedStudentId(s.user_id)}
            />
          ))}
        </Box>
      )}

      {/* Student detail bottom sheet */}
      <StudentDetailSheet
        userId={selectedStudentId}
        open={!!selectedStudentId}
        onClose={() => setSelectedStudentId(null)}
      />
    </Box>
  );
}

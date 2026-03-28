'use client';

import { useEffect, useState, useCallback } from 'react';
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
  Badge,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Snackbar,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import DevicesIcon from '@mui/icons-material/Devices';
import LaptopIcon from '@mui/icons-material/Laptop';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import GroupIcon from '@mui/icons-material/Group';
import BlockIcon from '@mui/icons-material/Block';
import CloseIcon from '@mui/icons-material/Close';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import CheckIcon from '@mui/icons-material/Check';
import ClearIcon from '@mui/icons-material/Clear';
import type { DeviceDistributionStats, StudentDeviceSummary, DeviceSwapRequestWithUser } from '@neram/database';
import { DeviceDistributionChart } from '@/components/devices/DeviceDistributionChart';
import { StudentDeviceTable } from '@/components/devices/StudentDeviceTable';

function StatCard({
  label,
  value,
  icon,
  color,
  compact,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <Paper
        variant="outlined"
        sx={{ p: 0.75, borderRadius: 1 }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25 }}>
          <Box
            sx={{
              width: 22,
              height: 22,
              borderRadius: 0.75,
              bgcolor: `${color}15`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {icon}
          </Box>
          <Typography
            sx={{
              fontWeight: 800,
              fontSize: 17,
              lineHeight: 1,
              color,
              fontFamily: '"Inter", "Roboto", sans-serif',
            }}
          >
            {value}
          </Typography>
        </Box>
        <Typography
          sx={{
            color: 'text.secondary',
            fontWeight: 500,
            fontSize: 10,
            letterSpacing: 0.15,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {label}
        </Typography>
      </Paper>
    );
  }

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

function SwapRequestsSection({ isMobile }: { isMobile?: boolean }) {
  const [requests, setRequests] = useState<DeviceSwapRequestWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [snack, setSnack] = useState<string | null>(null);
  const [rejectDialogId, setRejectDialogId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');

  const fetchRequests = useCallback(async () => {
    try {
      const res = await fetch('/api/devices/swap-requests?status=pending');
      if (res.ok) {
        const result = await res.json();
        setRequests(result.data || []);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleAction = async (requestId: string, action: 'approve' | 'reject', notes?: string) => {
    setProcessing(requestId);
    try {
      const res = await fetch('/api/devices/swap-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, action, adminNotes: notes }),
      });

      if (res.ok) {
        setRequests((prev) => prev.filter((r) => r.id !== requestId));
        setSnack(`Request ${action === 'approve' ? 'approved' : 'rejected'} successfully`);
        setRejectDialogId(null);
        setRejectNotes('');
      } else {
        const { error } = await res.json();
        setSnack(error || 'Failed to process request');
      }
    } catch {
      setSnack('Failed to process request');
    }
    setProcessing(null);
  };

  if (loading) {
    return <Skeleton variant="rounded" height={120} sx={{ borderRadius: 2, mb: 4 }} />;
  }

  if (requests.length === 0) return null;

  return (
    <>
      <Paper
        variant="outlined"
        sx={{ p: isMobile ? 1.5 : 3, borderRadius: 2, mb: isMobile ? 2 : 4, borderColor: 'warning.main', borderWidth: 2 }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: isMobile ? 1.5 : 2 }}>
          <Badge badgeContent={requests.length} color="warning">
            <SwapHorizIcon sx={{ color: 'warning.main', fontSize: isMobile ? 20 : 24 }} />
          </Badge>
          <Typography variant={isMobile ? 'subtitle1' : 'h6'} fontWeight={600}>
            Pending Requests
          </Typography>
        </Box>

        {isMobile ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {requests.map((req) => (
              <Paper key={req.id} variant="outlined" sx={{ p: 1.25, borderRadius: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                  <Avatar
                    src={req.user_avatar || undefined}
                    sx={{ width: 24, height: 24, fontSize: 11 }}
                  >
                    {req.user_name?.[0]?.toUpperCase()}
                  </Avatar>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {req.user_name}
                  </Typography>
                  <Chip
                    icon={
                      req.device_category === 'desktop' ? (
                        <LaptopIcon sx={{ fontSize: 12 }} />
                      ) : (
                        <PhoneAndroidIcon sx={{ fontSize: 12 }} />
                      )
                    }
                    label={req.device_category === 'desktop' ? 'Laptop' : 'Mobile'}
                    size="small"
                    color={req.device_category === 'desktop' ? 'primary' : 'secondary'}
                    sx={{ height: 20, fontSize: 10, '& .MuiChip-label': { px: 0.5 } }}
                  />
                </Box>
                {req.reason && (
                  <Typography sx={{ fontSize: 11, color: 'text.secondary', mb: 0.75, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {req.reason}
                  </Typography>
                )}
                <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
                  <Typography sx={{ fontSize: 10, color: 'text.disabled', flex: 1 }}>
                    {new Date(req.created_at).toLocaleDateString()}
                  </Typography>
                  <IconButton
                    size="small"
                    color="success"
                    disabled={processing === req.id}
                    onClick={() => handleAction(req.id, 'approve')}
                    sx={{ width: 28, height: 28 }}
                  >
                    <CheckIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                  <IconButton
                    size="small"
                    color="error"
                    disabled={processing === req.id}
                    onClick={() => { setRejectDialogId(req.id); setRejectNotes(''); }}
                    sx={{ width: 28, height: 28 }}
                  >
                    <ClearIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Box>
              </Paper>
            ))}
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Student</TableCell>
                  <TableCell>Device</TableCell>
                  <TableCell>Reason</TableCell>
                  <TableCell>Requested</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {requests.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Avatar
                          src={req.user_avatar || undefined}
                          sx={{ width: 32, height: 32, fontSize: 14 }}
                        >
                          {req.user_name?.[0]?.toUpperCase()}
                        </Avatar>
                        <Box>
                          <Typography variant="body2" fontWeight={600}>
                            {req.user_name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {req.user_email}
                          </Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        icon={
                          req.device_category === 'desktop' ? (
                            <LaptopIcon sx={{ fontSize: 16 }} />
                          ) : (
                            <PhoneAndroidIcon sx={{ fontSize: 16 }} />
                          )
                        }
                        label={req.device_category === 'desktop' ? 'Laptop' : 'Mobile'}
                        size="small"
                        color={req.device_category === 'desktop' ? 'primary' : 'secondary'}
                        sx={{ height: 24 }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ maxWidth: 300 }}>
                        {req.reason}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(req.created_at).toLocaleDateString()}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                        <Button
                          size="small"
                          variant="contained"
                          color="success"
                          startIcon={<CheckIcon />}
                          disabled={processing === req.id}
                          onClick={() => handleAction(req.id, 'approve')}
                          sx={{ textTransform: 'none', minHeight: 32 }}
                        >
                          Approve
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          startIcon={<ClearIcon />}
                          disabled={processing === req.id}
                          onClick={() => {
                            setRejectDialogId(req.id);
                            setRejectNotes('');
                          }}
                          sx={{ textTransform: 'none', minHeight: 32 }}
                        >
                          Reject
                        </Button>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* Reject dialog */}
      <Dialog
        open={!!rejectDialogId}
        onClose={() => setRejectDialogId(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Reject Device Change</DialogTitle>
        <DialogContent>
          <TextField
            label="Reason for rejection (optional)"
            multiline
            rows={3}
            fullWidth
            value={rejectNotes}
            onChange={(e) => setRejectNotes(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, px: 3, pb: 2 }}>
          <Button onClick={() => setRejectDialogId(null)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => rejectDialogId && handleAction(rejectDialogId, 'reject', rejectNotes)}
            disabled={!!processing}
          >
            Reject
          </Button>
        </Box>
      </Dialog>

      <Snackbar
        open={!!snack}
        autoHideDuration={3000}
        onClose={() => setSnack(null)}
        message={snack}
      />
    </>
  );
}

export default function DevicesPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
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
    <Box sx={{ p: isMobile ? 2 : 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: isMobile ? 1 : 1.5, mb: isMobile ? 1.5 : 3 }}>
        <DevicesIcon sx={{ fontSize: isMobile ? 20 : 28, color: 'primary.main' }} />
        <Typography variant={isMobile ? 'h6' : 'h5'} fontWeight={700}>
          Student Devices
        </Typography>
      </Box>

      {/* Stat cards */}
      {loading ? (
        isMobile ? (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 0.75, mb: 2 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} variant="rounded" height={48} sx={{ borderRadius: 1 }} />
            ))}
          </Box>
        ) : (
          <Grid container spacing={2} sx={{ mb: 4 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Grid item xs={12} sm={6} md key={i}>
                <Skeleton variant="rounded" height={80} sx={{ borderRadius: 2 }} />
              </Grid>
            ))}
          </Grid>
        )
      ) : stats ? (
        isMobile ? (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 0.75, mb: 2 }}>
            <StatCard
              label="Total Students"
              value={stats.total_students}
              icon={<GroupIcon sx={{ color: '#1976d2', fontSize: 12 }} />}
              color="#1976d2"
              compact
            />
            <StatCard
              label="Both Devices"
              value={stats.both_devices}
              icon={<DevicesIcon sx={{ color: '#2e7d32', fontSize: 12 }} />}
              color="#2e7d32"
              compact
            />
            <StatCard
              label="Desktop Only"
              value={stats.desktop_only}
              icon={<LaptopIcon sx={{ color: '#1976d2', fontSize: 12 }} />}
              color="#1976d2"
              compact
            />
            <StatCard
              label="Mobile Only"
              value={stats.mobile_only}
              icon={<PhoneAndroidIcon sx={{ color: '#ed6c02', fontSize: 12 }} />}
              color="#ed6c02"
              compact
            />
            <StatCard
              label="No Devices"
              value={stats.no_devices}
              icon={<BlockIcon sx={{ color: '#9e9e9e', fontSize: 12 }} />}
              color="#9e9e9e"
              compact
            />
          </Box>
        ) : (
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
        )
      ) : null}

      {/* Pending swap requests */}
      <SwapRequestsSection isMobile={isMobile} />

      {/* Distribution chart */}
      {stats && (
        <Paper variant="outlined" sx={{ p: isMobile ? 1.5 : 3, borderRadius: isMobile ? 1 : 2, mb: isMobile ? 2 : 4 }}>
          <Typography variant={isMobile ? 'subtitle1' : 'h6'} fontWeight={600} gutterBottom>
            Device Distribution
          </Typography>
          <DeviceDistributionChart stats={stats} isMobile={isMobile} />
        </Paper>
      )}

      {/* Student device table */}
      <Paper variant="outlined" sx={{ p: isMobile ? 1.5 : 3, borderRadius: isMobile ? 1 : 2 }}>
        <Typography variant={isMobile ? 'subtitle1' : 'h6'} fontWeight={600} gutterBottom>
          Student Device List
        </Typography>
        <StudentDeviceTable onViewStudent={(id) => setSelectedStudentId(id)} isMobile={isMobile} />
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

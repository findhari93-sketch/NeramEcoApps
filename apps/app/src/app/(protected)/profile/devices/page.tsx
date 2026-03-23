'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Skeleton,
  Alert,
  Button,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DevicesIcon from '@mui/icons-material/Devices';
import LaptopIcon from '@mui/icons-material/Laptop';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import { useRouter } from 'next/navigation';
import { getFirebaseAuth } from '@neram/auth';
import type { StudentRegisteredDevice, DeviceSwapRequest } from '@neram/database';
import { DeviceCard } from '@/components/devices/DeviceCard';

export default function MyDevicesPage() {
  const router = useRouter();
  const [devices, setDevices] = useState<StudentRegisteredDevice[]>([]);
  const [swapRequests, setSwapRequests] = useState<DeviceSwapRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deregisteringId, setDeregisteringId] = useState<string | null>(null);
  const [snackMessage, setSnackMessage] = useState<string | null>(null);

  // Swap request dialog state
  const [swapDialogOpen, setSwapDialogOpen] = useState(false);
  const [swapCategory, setSwapCategory] = useState<'desktop' | 'mobile' | null>(null);
  const [swapReason, setSwapReason] = useState('');
  const [submittingSwap, setSubmittingSwap] = useState(false);

  const currentDeviceId =
    typeof window !== 'undefined'
      ? sessionStorage.getItem('neram_device_registered')
      : null;

  const getIdToken = async () => {
    const auth = getFirebaseAuth();
    const currentUser = auth.currentUser;
    if (!currentUser) return null;
    return currentUser.getIdToken();
  };

  const fetchDevices = useCallback(async () => {
    try {
      setError(null);
      const idToken = await getIdToken();
      if (!idToken) return;

      const [devicesRes, swapRes] = await Promise.all([
        fetch('/api/devices/my-devices', {
          headers: { Authorization: `Bearer ${idToken}` },
        }),
        fetch('/api/devices/swap-request', {
          headers: { Authorization: `Bearer ${idToken}` },
        }),
      ]);

      if (devicesRes.ok) {
        const { devices } = await devicesRes.json();
        setDevices(devices);
      } else {
        setError('Failed to load devices');
      }

      if (swapRes.ok) {
        const { requests } = await swapRes.json();
        setSwapRequests(requests);
      }
    } catch {
      setError('Failed to load devices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  const handleDeregister = async (deviceId: string) => {
    try {
      setDeregisteringId(deviceId);
      const idToken = await getIdToken();
      if (!idToken) return;

      const response = await fetch('/api/devices/deregister', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, deviceId }),
      });

      if (response.ok) {
        setDevices((prev) => prev.filter((d) => d.id !== deviceId));
        setSnackMessage('Device removed successfully');
      } else {
        setSnackMessage('Failed to remove device');
      }
    } catch {
      setSnackMessage('Failed to remove device');
    } finally {
      setDeregisteringId(null);
    }
  };

  const handleSwapRequest = (category: 'desktop' | 'mobile') => {
    setSwapCategory(category);
    setSwapReason('');
    setSwapDialogOpen(true);
  };

  const handleSubmitSwap = async () => {
    if (!swapCategory || !swapReason.trim()) return;

    try {
      setSubmittingSwap(true);
      const idToken = await getIdToken();
      if (!idToken) return;

      const response = await fetch('/api/devices/swap-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          deviceCategory: swapCategory,
          reason: swapReason.trim(),
        }),
      });

      if (response.ok) {
        const { request } = await response.json();
        setSwapRequests((prev) => [request, ...prev]);
        setSnackMessage('Device change request submitted. You will be notified when it is approved.');
        setSwapDialogOpen(false);
      } else {
        const { error } = await response.json();
        setSnackMessage(error || 'Failed to submit request');
      }
    } catch {
      setSnackMessage('Failed to submit request');
    } finally {
      setSubmittingSwap(false);
    }
  };

  const hasDesktop = devices.some((d) => d.device_category === 'desktop');
  const hasMobile = devices.some((d) => d.device_category === 'mobile');

  // Check for pending swap requests per category
  const pendingDesktopSwap = swapRequests.find(
    (r) => r.device_category === 'desktop' && r.status === 'pending'
  );
  const pendingMobileSwap = swapRequests.find(
    (r) => r.device_category === 'mobile' && r.status === 'pending'
  );

  // Recent swap requests (last 5 non-pending)
  const recentSwaps = swapRequests
    .filter((r) => r.status !== 'pending')
    .slice(0, 5);

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto', px: 2, py: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => router.back()}
          sx={{ minWidth: 'auto', px: 1 }}
        >
          Back
        </Button>
        <DevicesIcon sx={{ color: 'primary.main' }} />
        <Typography variant="h6" fontWeight={700}>
          My Devices
        </Typography>
      </Box>

      {/* Info */}
      <Alert severity="info" sx={{ mb: 3, borderRadius: 2 }}>
        You can register up to <strong>1 laptop/desktop</strong> and{' '}
        <strong>1 mobile phone</strong>. Need to switch to a new device?
        Use the <strong>Request Change</strong> button below.
      </Alert>

      {/* Device slots summary */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <Box
          sx={{
            flex: 1,
            p: 2,
            borderRadius: 2,
            bgcolor: hasDesktop ? 'success.50' : 'grey.50',
            border: '1px solid',
            borderColor: hasDesktop ? 'success.200' : 'grey.200',
            textAlign: 'center',
          }}
        >
          <LaptopIcon
            sx={{ fontSize: 32, color: hasDesktop ? 'success.main' : 'grey.400', mb: 0.5 }}
          />
          <Typography variant="caption" display="block" color="text.secondary">
            Desktop/Laptop
          </Typography>
          <Typography
            variant="body2"
            fontWeight={600}
            color={hasDesktop ? 'success.main' : 'text.secondary'}
          >
            {hasDesktop ? 'Registered' : 'Not registered'}
          </Typography>
          {pendingDesktopSwap && (
            <Chip label="Change pending" size="small" color="warning" sx={{ mt: 0.5, height: 20, fontSize: '0.65rem' }} />
          )}
        </Box>
        <Box
          sx={{
            flex: 1,
            p: 2,
            borderRadius: 2,
            bgcolor: hasMobile ? 'success.50' : 'grey.50',
            border: '1px solid',
            borderColor: hasMobile ? 'success.200' : 'grey.200',
            textAlign: 'center',
          }}
        >
          <PhoneAndroidIcon
            sx={{ fontSize: 32, color: hasMobile ? 'success.main' : 'grey.400', mb: 0.5 }}
          />
          <Typography variant="caption" display="block" color="text.secondary">
            Mobile Phone
          </Typography>
          <Typography
            variant="body2"
            fontWeight={600}
            color={hasMobile ? 'success.main' : 'text.secondary'}
          >
            {hasMobile ? 'Registered' : 'Not registered'}
          </Typography>
          {pendingMobileSwap && (
            <Chip label="Change pending" size="small" color="warning" sx={{ mt: 0.5, height: 20, fontSize: '0.65rem' }} />
          )}
        </Box>
      </Box>

      {/* Device list */}
      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Skeleton variant="rounded" height={120} sx={{ borderRadius: 3 }} />
          <Skeleton variant="rounded" height={120} sx={{ borderRadius: 3 }} />
        </Box>
      ) : error ? (
        <Alert severity="error" sx={{ borderRadius: 2 }}>
          {error}
        </Alert>
      ) : devices.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <DevicesIcon sx={{ fontSize: 64, color: 'grey.300', mb: 2 }} />
          <Typography variant="body1" color="text.secondary">
            No devices registered yet.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Your device will be automatically registered when you log in.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {devices.map((device) => (
            <Box key={device.id}>
              <DeviceCard
                device={device}
                isCurrentDevice={device.id === currentDeviceId}
                onDeregister={handleDeregister}
                deregistering={deregisteringId === device.id}
              />
              {/* Request Change button */}
              {device.id !== currentDeviceId && (
                <Box sx={{ mt: 1, pl: 1 }}>
                  {device.device_category === 'desktop' && pendingDesktopSwap ? (
                    <Chip
                      icon={<SwapHorizIcon />}
                      label="Change request pending"
                      size="small"
                      color="warning"
                      variant="outlined"
                    />
                  ) : device.device_category === 'mobile' && pendingMobileSwap ? (
                    <Chip
                      icon={<SwapHorizIcon />}
                      label="Change request pending"
                      size="small"
                      color="warning"
                      variant="outlined"
                    />
                  ) : (
                    <Button
                      size="small"
                      startIcon={<SwapHorizIcon />}
                      onClick={() => handleSwapRequest(device.device_category as 'desktop' | 'mobile')}
                      sx={{ textTransform: 'none' }}
                    >
                      Request Device Change
                    </Button>
                  )}
                </Box>
              )}
            </Box>
          ))}
        </Box>
      )}

      {/* Recent swap request history */}
      {recentSwaps.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Recent change requests
          </Typography>
          {recentSwaps.map((r) => (
            <Box
              key={r.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                py: 1,
                borderBottom: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Chip
                label={r.status}
                size="small"
                color={r.status === 'approved' ? 'success' : 'error'}
                sx={{ height: 22, fontSize: '0.7rem' }}
              />
              <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                {r.device_category === 'desktop' ? 'Laptop' : 'Mobile'} change — {r.reason}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {new Date(r.created_at).toLocaleDateString()}
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      {/* Location info */}
      <Alert severity="info" sx={{ mt: 3, borderRadius: 2 }} icon={false}>
        <Typography variant="caption" color="text.secondary">
          Location access helps your teachers understand where you study from.
          Please keep location enabled while using the app.
        </Typography>
      </Alert>

      {/* Swap Request Dialog */}
      <Dialog
        open={swapDialogOpen}
        onClose={() => setSwapDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, mx: 2 } }}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SwapHorizIcon color="primary" />
            Request Device Change
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Your {swapCategory === 'desktop' ? 'laptop/desktop' : 'mobile phone'} will
            be removed after admin approval, and your new device will register
            automatically when you log in.
          </Typography>
          <TextField
            label="Why do you need to change this device?"
            multiline
            rows={3}
            fullWidth
            value={swapReason}
            onChange={(e) => setSwapReason(e.target.value)}
            placeholder="e.g., Got a new phone, old laptop broken, etc."
            inputProps={{ maxLength: 500 }}
            helperText={`${swapReason.length}/500`}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setSwapDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSubmitSwap}
            disabled={!swapReason.trim() || submittingSwap}
            sx={{ minHeight: 44, borderRadius: 2 }}
          >
            {submittingSwap ? 'Submitting...' : 'Submit Request'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!snackMessage}
        autoHideDuration={4000}
        onClose={() => setSnackMessage(null)}
        message={snackMessage}
      />
    </Box>
  );
}

'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Skeleton,
  Alert,
  Button,
  Snackbar,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DevicesIcon from '@mui/icons-material/Devices';
import { useRouter } from 'next/navigation';
import { getFirebaseAuth } from '@neram/auth';
import type { StudentRegisteredDevice } from '@neram/database';
import { DeviceCard } from '@/components/devices/DeviceCard';

export default function MyDevicesPage() {
  const router = useRouter();
  const [devices, setDevices] = useState<StudentRegisteredDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deregisteringId, setDeregisteringId] = useState<string | null>(null);
  const [snackMessage, setSnackMessage] = useState<string | null>(null);

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

      const devicesRes = await fetch('/api/devices/my-devices', {
        headers: { Authorization: `Bearer ${idToken}` },
      });

      if (devicesRes.ok) {
        const { devices } = await devicesRes.json();
        setDevices(devices);
      } else {
        setError('Failed to load devices');
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
        Your devices are automatically registered when you log in.
        You can remove a device from the list if you no longer use it.
      </Alert>

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
            <DeviceCard
              key={device.id}
              device={device}
              isCurrentDevice={device.id === currentDeviceId}
              onDeregister={handleDeregister}
              deregistering={deregisteringId === device.id}
            />
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

      <Snackbar
        open={!!snackMessage}
        autoHideDuration={4000}
        onClose={() => setSnackMessage(null)}
        message={snackMessage}
      />
    </Box>
  );
}

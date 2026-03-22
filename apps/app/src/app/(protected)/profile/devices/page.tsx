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
import LaptopIcon from '@mui/icons-material/Laptop';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
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

  // Get the current device fingerprint from session storage
  const currentDeviceId =
    typeof window !== 'undefined'
      ? sessionStorage.getItem('neram_device_registered')
      : null;

  const fetchDevices = useCallback(async () => {
    try {
      setError(null);
      const auth = getFirebaseAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const idToken = await currentUser.getIdToken();
      const response = await fetch('/api/devices/my-devices', {
        headers: { Authorization: `Bearer ${idToken}` },
      });

      if (response.ok) {
        const { devices } = await response.json();
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
      const auth = getFirebaseAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const idToken = await currentUser.getIdToken();
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

  const hasDesktop = devices.some((d) => d.device_category === 'desktop');
  const hasMobile = devices.some((d) => d.device_category === 'mobile');

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
        <strong>1 mobile phone</strong>. To use a new device, remove an existing
        one first.
      </Alert>

      {/* Device slots summary */}
      <Box
        sx={{
          display: 'flex',
          gap: 2,
          mb: 3,
        }}
      >
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
            sx={{
              fontSize: 32,
              color: hasDesktop ? 'success.main' : 'grey.400',
              mb: 0.5,
            }}
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
            sx={{
              fontSize: 32,
              color: hasMobile ? 'success.main' : 'grey.400',
              mb: 0.5,
            }}
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
        autoHideDuration={3000}
        onClose={() => setSnackMessage(null)}
        message={snackMessage}
      />
    </Box>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Paper, Skeleton, Chip, Button, IconButton, Tooltip } from '@neram/ui';
import LaptopIcon from '@mui/icons-material/Laptop';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { getDeviceFingerprint } from '@/lib/device-fingerprint';
import { clearDeviceFingerprint } from '@/lib/device-fingerprint';
import DeviceSwapDialog from './DeviceSwapDialog';

interface RegisteredDevice {
  id: string;
  device_fingerprint: string;
  device_category: 'desktop' | 'mobile';
  device_name: string | null;
  os: string | null;
  os_version: string | null;
  browser: string | null;
  screen_width: number | null;
  screen_height: number | null;
  last_seen_at: string;
  total_active_seconds: number;
  last_city: string | null;
  last_state: string | null;
}

interface DeviceSectionProps {
  getToken: () => Promise<string | null>;
}

export default function DeviceSection({ getToken }: DeviceSectionProps) {
  const [devices, setDevices] = useState<RegisteredDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentFingerprint, setCurrentFingerprint] = useState<string | null>(null);
  const [swapDialogOpen, setSwapDialogOpen] = useState(false);
  const [deregistering, setDeregistering] = useState<string | null>(null);

  // Get current device fingerprint for "This device" matching
  useEffect(() => {
    getDeviceFingerprint().then(setCurrentFingerprint).catch(() => {});
  }, []);

  const fetchDevices = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/devices/student', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDevices(data.devices || []);
      }
    } catch (err) {
      console.error('Failed to fetch devices:', err);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  const handleDeregister = async (deviceId: string) => {
    setDeregistering(deviceId);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/devices/deregister', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ deviceId }),
      });
      if (res.ok) {
        // If deregistering current device, clear fingerprint cache
        const device = devices.find(d => d.id === deviceId);
        if (device && device.device_fingerprint === currentFingerprint) {
          clearDeviceFingerprint();
          sessionStorage.removeItem('neram_device_registered');
        }
        // Refresh device list
        await fetchDevices();
      }
    } catch (err) {
      console.error('Failed to deregister device:', err);
    } finally {
      setDeregistering(null);
    }
  };

  const desktopDevice = devices.find((d) => d.device_category === 'desktop');
  const mobileDevice = devices.find((d) => d.device_category === 'mobile');
  const hasAnyDevice = devices.length > 0;

  return (
    <>
      <Paper
        elevation={0}
        sx={{ p: { xs: 2.5, sm: 3 }, mb: 2, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: 0.5 }}>
            My Devices
          </Typography>
          {hasAnyDevice && (
            <Button
              size="small"
              startIcon={<SwapHorizIcon />}
              onClick={() => setSwapDialogOpen(true)}
              sx={{ fontSize: 12, textTransform: 'none' }}
            >
              Request Change
            </Button>
          )}
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Skeleton variant="rectangular" height={72} sx={{ borderRadius: 2 }} />
            <Skeleton variant="rectangular" height={72} sx={{ borderRadius: 2 }} />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <DeviceSlot
              label="Desktop / Laptop"
              icon={<LaptopIcon />}
              device={desktopDevice}
              isCurrentDevice={!!desktopDevice && desktopDevice.device_fingerprint === currentFingerprint}
              onDeregister={handleDeregister}
              deregistering={deregistering}
            />
            <DeviceSlot
              label="Mobile Phone"
              icon={<PhoneAndroidIcon />}
              device={mobileDevice}
              isCurrentDevice={!!mobileDevice && mobileDevice.device_fingerprint === currentFingerprint}
              onDeregister={handleDeregister}
              deregistering={deregistering}
            />
          </Box>
        )}

        {!loading && devices.length === 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Your device will be automatically registered when you use Nexus.
          </Typography>
        )}
      </Paper>

      <DeviceSwapDialog
        open={swapDialogOpen}
        onClose={() => setSwapDialogOpen(false)}
        getToken={getToken}
        hasDesktop={!!desktopDevice}
        hasMobile={!!mobileDevice}
        onSwapRequested={fetchDevices}
      />
    </>
  );
}

function DeviceSlot({
  label,
  icon,
  device,
  isCurrentDevice,
  onDeregister,
  deregistering,
}: {
  label: string;
  icon: React.ReactNode;
  device?: RegisteredDevice;
  isCurrentDevice: boolean;
  onDeregister: (id: string) => void;
  deregistering: string | null;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        p: 1.5,
        borderRadius: 2,
        bgcolor: device ? 'action.hover' : 'transparent',
        border: isCurrentDevice ? '2px solid' : device ? 'none' : '1px dashed',
        borderColor: isCurrentDevice ? 'primary.main' : 'divider',
        minHeight: 64,
        position: 'relative',
      }}
    >
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: 2,
          bgcolor: device ? 'primary.main' : 'action.disabledBackground',
          color: device ? 'primary.contrastText' : 'text.disabled',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {device ? (device.device_name || label) : label}
          </Typography>
          {isCurrentDevice && (
            <Chip
              icon={<CheckCircleIcon sx={{ fontSize: '14px !important' }} />}
              label="This device"
              size="small"
              color="primary"
              variant="outlined"
              sx={{ height: 20, fontSize: 10, ml: 0.5, '& .MuiChip-icon': { ml: 0.3 } }}
            />
          )}
        </Box>

        {device ? (
          <Box sx={{ mt: 0.5 }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {device.os && (
                <Chip
                  label={device.os_version ? `${device.os} ${device.os_version}` : device.os}
                  size="small"
                  variant="outlined"
                  sx={{ height: 20, fontSize: 11 }}
                />
              )}
              {device.browser && (
                <Chip label={device.browser} size="small" variant="outlined" sx={{ height: 20, fontSize: 11 }} />
              )}
              {device.screen_width && device.screen_height && (
                <Chip
                  label={`${device.screen_width}x${device.screen_height}`}
                  size="small"
                  variant="outlined"
                  sx={{ height: 20, fontSize: 11 }}
                />
              )}
            </Box>
            <Typography
              variant="caption"
              sx={{ fontSize: 10, color: 'text.disabled', fontFamily: 'monospace', mt: 0.3, display: 'block' }}
            >
              ID: {device.device_fingerprint.slice(0, 12)}
            </Typography>
          </Box>
        ) : (
          <Typography variant="caption" color="text.disabled">
            Not registered
          </Typography>
        )}
      </Box>

      {device && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
          <Box sx={{ textAlign: 'right', mr: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'flex-end' }}>
              <AccessTimeIcon sx={{ fontSize: 12, color: 'text.secondary' }} />
              <Typography variant="caption" color="text.secondary">
                {formatActiveTime(device.total_active_seconds)}
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
              {formatLastSeen(device.last_seen_at)}
            </Typography>
          </Box>

          {!isCurrentDevice && (
            <Tooltip title="Remove this device">
              <IconButton
                size="small"
                onClick={() => onDeregister(device.id)}
                disabled={deregistering === device.id}
                sx={{ color: 'text.secondary', '&:hover': { color: 'error.main' } }}
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      )}
    </Box>
  );
}

function formatActiveTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  if (hours < 24) return remainMinutes > 0 ? `${hours}h ${remainMinutes}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function formatLastSeen(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

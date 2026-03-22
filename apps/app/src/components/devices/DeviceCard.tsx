'use client';

import {
  Card,
  CardContent,
  Box,
  Typography,
  Chip,
  IconButton,
  LinearProgress,
} from '@mui/material';
import LaptopIcon from '@mui/icons-material/Laptop';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import type { StudentRegisteredDevice } from '@neram/database';

interface DeviceCardProps {
  device: StudentRegisteredDevice;
  isCurrentDevice: boolean;
  onDeregister: (deviceId: string) => void;
  deregistering: boolean;
}

function formatActiveTime(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatLastSeen(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 2) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function DeviceCard({
  device,
  isCurrentDevice,
  onDeregister,
  deregistering,
}: DeviceCardProps) {
  const isDesktop = device.device_category === 'desktop';

  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: 3,
        border: isCurrentDevice ? '2px solid' : '1px solid',
        borderColor: isCurrentDevice ? 'primary.main' : 'divider',
        position: 'relative',
        overflow: 'visible',
      }}
    >
      {deregistering && (
        <LinearProgress sx={{ position: 'absolute', top: 0, left: 0, right: 0, borderRadius: '12px 12px 0 0' }} />
      )}
      <CardContent sx={{ p: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
          {/* Device icon */}
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: 2,
              bgcolor: isDesktop ? 'primary.50' : 'secondary.50',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {isDesktop ? (
              <LaptopIcon sx={{ color: 'primary.main', fontSize: 28 }} />
            ) : (
              <PhoneAndroidIcon sx={{ color: 'secondary.main', fontSize: 28 }} />
            )}
          </Box>

          {/* Device info */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <Typography variant="subtitle1" fontWeight={600} noWrap>
                {device.device_name || (isDesktop ? 'Desktop' : 'Mobile')}
              </Typography>
              {isCurrentDevice && (
                <Chip
                  label="This device"
                  size="small"
                  color="primary"
                  sx={{ height: 22, fontSize: '0.7rem' }}
                />
              )}
            </Box>

            <Typography variant="body2" color="text.secondary" gutterBottom>
              {device.os}{device.os_version ? ` ${device.os_version}` : ''}
              {device.browser ? ` · ${device.browser}` : ''}
              {device.screen_width ? ` · ${device.screen_width}×${device.screen_height}` : ''}
            </Typography>

            {/* Stats row */}
            <Box sx={{ display: 'flex', gap: 2, mt: 1, flexWrap: 'wrap' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <AccessTimeIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                <Typography variant="caption" color="text.secondary">
                  {formatActiveTime(device.total_active_seconds)} active
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary">
                {device.session_count} sessions
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Last seen: {formatLastSeen(device.last_seen_at)}
              </Typography>
            </Box>

            {/* Location */}
            {device.last_city && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                <LocationOnIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                <Typography variant="caption" color="text.secondary">
                  {[device.last_city, device.last_state, device.last_country].filter(Boolean).join(', ')}
                </Typography>
              </Box>
            )}
          </Box>

          {/* Delete button */}
          {!isCurrentDevice && (
            <IconButton
              size="small"
              color="error"
              onClick={() => onDeregister(device.id)}
              disabled={deregistering}
              sx={{ mt: -0.5, mr: -0.5 }}
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

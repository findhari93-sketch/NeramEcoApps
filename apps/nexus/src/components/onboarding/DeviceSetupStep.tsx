'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  TextField,
  Alert,
  Chip,
} from '@neram/ui';
import LaptopOutlinedIcon from '@mui/icons-material/LaptopOutlined';
import PhoneIphoneOutlinedIcon from '@mui/icons-material/PhoneIphoneOutlined';
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import { getDeviceCategory } from '@/lib/device-fingerprint';

interface DeviceSetupStepProps {
  onNext: () => void;
  onBack: () => void;
}

export default function DeviceSetupStep({ onNext, onBack }: DeviceSetupStepProps) {
  const [deviceName, setDeviceName] = useState('');
  const [deviceCategory, setDeviceCategory] = useState<'desktop' | 'mobile'>('desktop');
  const [detectedInfo, setDetectedInfo] = useState({ browser: '', os: '' });

  useEffect(() => {
    // Auto-detect device type
    const category = getDeviceCategory();
    setDeviceCategory(category);

    // Detect browser and OS
    const ua = navigator.userAgent;
    let browser = 'Browser';
    if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
    else if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
    else if (ua.includes('Edg')) browser = 'Edge';

    let os = 'Unknown';
    if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Mac')) os = 'macOS';
    else if (ua.includes('Linux') && !ua.includes('Android')) os = 'Linux';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

    setDetectedInfo({ browser, os });

    // Suggest default name
    setDeviceName(category === 'desktop' ? `My ${os} Laptop` : `My ${os} Phone`);
  }, []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Device Registration
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Register this device to use Nexus. You can add your second device later.
        </Typography>
      </Box>

      {/* Device policy */}
      <Paper
        elevation={0}
        sx={{
          p: 2,
          borderRadius: 2,
          bgcolor: 'warning.50',
          border: '1px solid',
          borderColor: 'warning.200',
        }}
      >
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
          <WarningAmberOutlinedIcon sx={{ color: 'warning.main', mt: 0.25 }} />
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'warning.dark' }}>
              2-Device Policy
            </Typography>
            <Typography variant="body2" color="text.secondary">
              You can use Nexus on <strong>1 laptop/desktop + 1 mobile phone</strong>. Using unregistered devices may result in access termination.
            </Typography>
          </Box>
        </Box>
      </Paper>

      {/* Current device */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, sm: 3 },
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'primary.light',
          bgcolor: 'primary.50',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          {deviceCategory === 'desktop' ? (
            <LaptopOutlinedIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          ) : (
            <PhoneIphoneOutlinedIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          )}
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              This Device
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              <Chip label={deviceCategory === 'desktop' ? 'Laptop/Desktop' : 'Mobile'} size="small" color="primary" variant="outlined" />
              <Chip label={detectedInfo.os} size="small" variant="outlined" />
              <Chip label={detectedInfo.browser} size="small" variant="outlined" />
            </Box>
          </Box>
        </Box>

        <TextField
          label="Give this device a name"
          value={deviceName}
          onChange={(e) => setDeviceName(e.target.value)}
          fullWidth
          placeholder="e.g., My HP Laptop, Amma's Phone"
          helperText="A friendly name so you can identify this device later"
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: 'background.paper' } }}
        />
      </Paper>

      {/* Second device info */}
      <Paper
        elevation={0}
        sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
      >
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          {deviceCategory === 'desktop' ? (
            <PhoneIphoneOutlinedIcon sx={{ color: 'text.disabled' }} />
          ) : (
            <LaptopOutlinedIcon sx={{ color: 'text.disabled' }} />
          )}
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              {deviceCategory === 'desktop' ? 'Mobile Phone' : 'Laptop/Desktop'}
            </Typography>
            <Typography variant="caption" color="text.disabled">
              You can register your second device next time you log in from it.
            </Typography>
          </Box>
        </Box>
      </Paper>

      {/* Actions */}
      <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
        <Button
          variant="outlined"
          onClick={onBack}
          startIcon={<ArrowBackOutlinedIcon />}
          sx={{ borderRadius: 2, textTransform: 'none', px: 3 }}
        >
          Back
        </Button>
        <Button
          variant="contained"
          size="large"
          fullWidth
          disabled={!deviceName.trim()}
          onClick={onNext}
          sx={{ py: 1.5, borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
        >
          Submit for Review
        </Button>
      </Box>
    </Box>
  );
}

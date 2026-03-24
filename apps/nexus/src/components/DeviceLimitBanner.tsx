'use client';

import { useState } from 'react';
import { Alert, AlertTitle, Box, IconButton, Typography } from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import DevicesIcon from '@mui/icons-material/Devices';
import { useRouter } from 'next/navigation';

const DISMISS_KEY = 'neram_device_limit_dismissed';

interface DeviceLimitBannerProps {
  limitCategory: string | null;
}

export default function DeviceLimitBanner({ limitCategory }: DeviceLimitBannerProps) {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem(DISMISS_KEY) === 'true';
  });
  const router = useRouter();

  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem(DISMISS_KEY, 'true');
  };

  return (
    <Alert
      severity="warning"
      icon={<DevicesIcon />}
      action={
        <IconButton size="small" color="inherit" onClick={handleDismiss}>
          <CloseIcon fontSize="small" />
        </IconButton>
      }
      sx={{
        mb: 2,
        borderRadius: 2,
        '& .MuiAlert-message': { flex: 1 },
      }}
    >
      <AlertTitle sx={{ fontWeight: 600, fontSize: 14 }}>
        Unregistered Device
      </AlertTitle>
      <Typography variant="body2" sx={{ fontSize: 13 }}>
        This {limitCategory || 'device'} is not registered. You&apos;ve reached the 2-device limit
        (1 desktop + 1 mobile).{' '}
        <Box
          component="span"
          onClick={() => router.push('/student/profile')}
          sx={{
            color: 'warning.dark',
            fontWeight: 600,
            cursor: 'pointer',
            textDecoration: 'underline',
            '&:hover': { opacity: 0.8 },
          }}
        >
          Request a device swap
        </Box>{' '}
        from your profile to register this device.
      </Typography>
    </Alert>
  );
}

'use client';

import { Box, Button, IconButton, Typography } from '@neram/ui';
import GetAppRoundedIcon from '@mui/icons-material/GetAppRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';

export default function InstallPromptBanner() {
  const { isInstallable, promptInstall, dismiss } = useInstallPrompt();

  if (!isInstallable) return null;

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: { xs: 64, sm: 16 }, // above MobileBottomNav on mobile
        left: { xs: 8, sm: 'auto' },
        right: { xs: 8, sm: 16 },
        maxWidth: { sm: 380 },
        zIndex: 1300,
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: 2,
        py: 1.5,
        bgcolor: 'primary.dark',
        color: 'primary.contrastText',
        borderRadius: 2,
        boxShadow: '0 8px 32px rgba(0,0,0,0.24)',
      }}
    >
      <GetAppRoundedIcon sx={{ fontSize: 28, flexShrink: 0 }} />

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
          Install aiArchitek
        </Typography>
        <Typography variant="caption" sx={{ opacity: 0.85 }}>
          Quick access from your home screen
        </Typography>
      </Box>

      <Button
        size="small"
        variant="contained"
        onClick={promptInstall}
        sx={{
          bgcolor: '#fff',
          color: 'primary.dark',
          fontWeight: 700,
          minHeight: 36,
          px: 2,
          flexShrink: 0,
          '&:hover': { bgcolor: 'rgba(255,255,255,0.9)' },
        }}
      >
        Install
      </Button>

      <IconButton
        size="small"
        onClick={dismiss}
        sx={{ color: 'inherit', opacity: 0.7, flexShrink: 0, ml: -0.5 }}
        aria-label="Dismiss install prompt"
      >
        <CloseRoundedIcon fontSize="small" />
      </IconButton>
    </Box>
  );
}

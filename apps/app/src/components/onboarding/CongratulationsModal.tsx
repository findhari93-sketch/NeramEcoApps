// @ts-nocheck
'use client';

import { Box, Typography, Button, Dialog } from '@neram/ui';
import CelebrationIcon from '@mui/icons-material/Celebration';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

interface CongratulationsModalProps {
  open: boolean;
  onClose: () => void;
}

export default function CongratulationsModal({ open, onClose }: CongratulationsModalProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen
      PaperProps={{
        sx: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'background.default',
          p: 3,
        },
      }}
    >
      <Box
        sx={{
          maxWidth: 440,
          width: '100%',
          textAlign: 'center',
          p: { xs: 3, md: 5 },
          borderRadius: 3,
          bgcolor: 'background.paper',
          boxShadow: 3,
        }}
      >
        <CelebrationIcon sx={{ fontSize: 72, color: '#FFB300', mb: 2 }} />

        <Typography variant="h4" fontWeight={800} gutterBottom>
          Congratulations!
        </Typography>

        <Typography
          variant="body1"
          color="text.secondary"
          sx={{ mb: 1, lineHeight: 1.7 }}
        >
          Welcome to India&apos;s #1 Architecture Skills Learning Platform.
        </Typography>

        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mb: 4, lineHeight: 1.7 }}
        >
          Your dedication and our expert guidance will make your dream of getting into a top architecture college a reality. Let&apos;s achieve this together!
        </Typography>

        <Button
          variant="contained"
          size="large"
          endIcon={<ArrowForwardIcon />}
          href="/dashboard"
          onClick={onClose}
          sx={{
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 700,
            fontSize: '1rem',
            minHeight: 52,
            px: 4,
          }}
        >
          Start Learning
        </Button>
      </Box>
    </Dialog>
  );
}

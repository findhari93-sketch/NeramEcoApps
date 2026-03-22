'use client';

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
} from '@mui/material';
import DevicesIcon from '@mui/icons-material/Devices';

interface DeviceLimitModalProps {
  open: boolean;
  category: string | null;
  onClose: () => void;
}

export function DeviceLimitModal({ open, category, onClose }: DeviceLimitModalProps) {
  const categoryLabel = category === 'desktop' ? 'laptop/desktop' : 'mobile phone';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: { borderRadius: 3, mx: 2 },
      }}
    >
      <DialogTitle sx={{ textAlign: 'center', pt: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
          <DevicesIcon sx={{ fontSize: 48, color: 'warning.main' }} />
        </Box>
        Device Limit Reached
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" textAlign="center">
          You already have a {categoryLabel} registered. Each student can use
          1 laptop/desktop and 1 mobile phone.
        </Typography>
        <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ mt: 1 }}>
          To use this device, go to <strong>Settings &gt; My Devices</strong> and
          remove your current {categoryLabel} first.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'center', pb: 3 }}>
        <Button
          variant="contained"
          onClick={onClose}
          sx={{ minHeight: 48, px: 4, borderRadius: 2 }}
        >
          Got it
        </Button>
      </DialogActions>
    </Dialog>
  );
}

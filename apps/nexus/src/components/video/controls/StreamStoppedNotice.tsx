'use client';

import { Box, Button, Typography } from '@neram/ui';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { videoOverlayDialogProps } from '../overlay-dialog';

/**
 * The recording would not come back on its own.
 *
 * Only reached after the player has already renewed the stream several times
 * without the picture moving, or when the server refused a renewal outright
 * (a signed-out session, a recording that was removed). Before this, a stream
 * that died left a frozen frame or a spinner that never ended, and the only way
 * out was a reload.
 *
 * `role="alert"` because playback stopped without the student asking. The copy
 * says their place is kept, which is true: Try again resumes the same second.
 * Declared as an overlay dialog so the player's tap and keyboard handlers leave
 * the button alone, rather than a press on it also toggling play underneath.
 */

export default function StreamStoppedNotice({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <Box
      role="alert"
      {...videoOverlayDialogProps}
      sx={{
        position: 'absolute',
        inset: 0,
        // Above every control and the checkpoint notice (6), below the quiz (10).
        zIndex: 7,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        // A 360px phone leaves the inline player about 184px tall. A long
        // message scrolls inside the notice rather than pushing the button out.
        gap: { xs: 1, sm: 1.5 },
        px: 2,
        py: 1,
        overflowY: 'auto',
        textAlign: 'center',
        bgcolor: 'rgba(0,0,0,0.78)',
        color: '#fff',
      }}
    >
      <Typography sx={{ fontWeight: 700, fontSize: '1rem', lineHeight: 1.45, maxWidth: 420 }}>
        {message}
      </Typography>
      <Typography sx={{ fontSize: '0.875rem', lineHeight: 1.45, color: 'rgba(255,255,255,0.85)' }}>
        Your place in the video is kept.
      </Typography>
      <Button
        variant="outlined"
        onClick={onRetry}
        startIcon={<RefreshRoundedIcon />}
        sx={{
          minHeight: 48,
          px: 3,
          textTransform: 'none',
          fontWeight: 700,
          color: '#fff',
          borderColor: 'rgba(255,255,255,0.7)',
          '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.08)' },
          '&:focus-visible': { outline: '3px solid rgba(66,165,245,0.9)', outlineOffset: 2 },
        }}
      >
        Try again
      </Button>
    </Box>
  );
}

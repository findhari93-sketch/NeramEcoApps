'use client';

/**
 * ImageViewerDialog
 *
 * A lightweight lightbox for viewing a person's photo at full size. Used by
 * UserAvatar (and GraphAvatar) so any avatar can be clicked to enlarge.
 * Full-screen on mobile, centered card on larger screens.
 */

import Dialog from '@mui/material/Dialog';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';

export interface ImageViewerDialogProps {
  open: boolean;
  onClose: () => void;
  src: string;
  name?: string | null;
  alt?: string;
}

export function ImageViewerDialog({ open, onClose, src, name, alt }: ImageViewerDialogProps): JSX.Element | null {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  if (!src) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullScreen={fullScreen}
      // Stop bubbling so opening the viewer from an avatar inside a clickable
      // row/card does not also trigger that row's navigation.
      onClick={(e) => e.stopPropagation()}
      PaperProps={{
        sx: {
          borderRadius: fullScreen ? 0 : 2,
          overflow: 'hidden',
          bgcolor: '#000',
          m: fullScreen ? 0 : 2,
        },
      }}
    >
      <Box sx={{ position: 'relative', display: 'flex', bgcolor: '#000' }}>
        <IconButton
          onClick={onClose}
          aria-label="Close photo"
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 2,
            color: '#fff',
            bgcolor: 'rgba(0,0,0,0.45)',
            '&:hover': { bgcolor: 'rgba(0,0,0,0.65)' },
          }}
        >
          <CloseIcon />
        </IconButton>

        <Box
          component="img"
          src={src}
          alt={alt || name || 'Profile photo'}
          sx={{
            width: '100%',
            maxHeight: fullScreen ? '100vh' : '80vh',
            objectFit: 'contain',
            display: 'block',
          }}
        />

        {name && (
          <Typography
            variant="subtitle1"
            sx={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              px: 2,
              py: 1.25,
              color: '#fff',
              fontWeight: 600,
              background: 'linear-gradient(to top, rgba(0,0,0,0.72), transparent)',
            }}
          >
            {name}
          </Typography>
        )}
      </Box>
    </Dialog>
  );
}

export default ImageViewerDialog;

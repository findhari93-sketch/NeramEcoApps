'use client';

/**
 * One image, the whole screen, for reading a teacher's marks closely. On a phone
 * the browser's own pinch zoom works on it, since nothing here fixes the scale.
 */
import { Box, Dialog, IconButton } from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';

export default function StageViewerDialog({
  src,
  alt,
  onClose,
}: {
  src: string | null;
  alt: string;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={!!src}
      onClose={onClose}
      fullScreen
      aria-label={alt}
      PaperProps={{ sx: { bgcolor: '#111' } }}
    >
      <IconButton
        onClick={onClose}
        aria-label="Close full screen view"
        sx={{
          position: 'fixed',
          top: 'max(8px, env(safe-area-inset-top))',
          right: 8,
          zIndex: 1,
          width: 48,
          height: 48,
          bgcolor: 'rgba(255,255,255,0.14)',
          color: '#fff',
          '&:hover': { bgcolor: 'rgba(255,255,255,0.24)' },
        }}
      >
        <CloseIcon />
      </IconButton>
      <Box
        sx={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', p: { xs: 1, md: 3 } }}
        onClick={onClose}
      >
        {src && (
          <Box
            component="img"
            src={src}
            alt={alt}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
          />
        )}
      </Box>
    </Dialog>
  );
}

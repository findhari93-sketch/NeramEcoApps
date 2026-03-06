'use client';

import { Box, Dialog, IconButton, Typography } from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import type { SocialProof } from '@neram/database';

interface VideoPlayerModalProps {
  open: boolean;
  onClose: () => void;
  video: SocialProof | null;
}

export default function VideoPlayerModal({
  open,
  onClose,
  video,
}: VideoPlayerModalProps) {
  if (!video) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      sx={{
        '& .MuiBackdrop-root': {
          backgroundColor: 'rgba(0,0,0,0.85)',
        },
        '& .MuiDialog-paper': {
          bgcolor: 'var(--neram-card)',
          backgroundImage: 'none',
          borderRadius: 2,
          border: '1px solid var(--neram-border)',
          overflow: 'hidden',
          m: { xs: 1, sm: 2 },
          maxHeight: '95vh',
        },
      }}
    >
      {/* Close button */}
      <IconButton
        onClick={onClose}
        aria-label="Close video"
        sx={{
          position: 'absolute',
          top: 8,
          right: 8,
          zIndex: 10,
          color: 'var(--neram-text)',
          bgcolor: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(4px)',
          '&:hover': {
            bgcolor: 'rgba(232,160,32,0.3)',
          },
        }}
      >
        <CloseIcon />
      </IconButton>

      {/* Video iframe - 16:9 */}
      <Box sx={{ position: 'relative', paddingTop: '56.25%', bgcolor: '#000' }}>
        <iframe
          src={`https://www.youtube.com/embed/${video.youtube_id}?autoplay=1&rel=0`}
          title={`${video.speaker_name} testimonial`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            border: 0,
          }}
        />
      </Box>

      {/* Info below video */}
      <Box sx={{ p: 2.5 }}>
        <Typography
          variant="body1"
          sx={{ fontWeight: 700, color: 'var(--neram-gold)', mb: 0.25 }}
        >
          {video.speaker_name}
        </Typography>
        {video.student_name && (
          <Typography
            variant="body2"
            sx={{ color: 'var(--neram-text-muted)' }}
          >
            Student: {video.student_name}
            {video.batch ? ` | ${video.batch}` : ''}
          </Typography>
        )}
      </Box>
    </Dialog>
  );
}

'use client';

/**
 * View-only recording player for students. Plays the unlisted YouTube backup of
 * a completed class. This is the plain self-study path; the gated "guided recap"
 * with checkpoint quizzes is separate.
 *
 * Ungated, but not unprotected. It used to be a bare iframe, which meant no
 * watermark, no telemetry and YouTube's own menu one right-click away. It now
 * runs through the shared player in open mode: scrub freely, but the picture
 * still carries the student's name and the chrome is ours.
 */
import { Dialog, DialogContent, DialogTitle, IconButton, Box, Typography } from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import NeramVideoPlayer from '@/components/video/NeramVideoPlayer';
import { OPEN_GATE } from '@/lib/video-gate';

export default function RecordingPlayerDialog({
  open,
  onClose,
  youtubeId,
  title,
}: {
  open: boolean;
  onClose: () => void;
  youtubeId: string;
  title?: string;
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pr: 6, py: 1.5 }}>
        <Typography component="span" sx={{ fontWeight: 700, fontSize: '1rem' }} noWrap>
          {title || 'Class recording'}
        </Typography>
        <IconButton aria-label="Close" onClick={onClose} sx={{ position: 'absolute', top: 8, right: 8 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: 0, bgcolor: '#000' }}>
        <Box sx={{ position: 'relative', pt: '56.25%' }}>
          <Box sx={{ position: 'absolute', inset: 0 }}>
            <NeramVideoPlayer
              source={{ kind: 'youtube', youtubeId }}
              gate={OPEN_GATE}
              allowFullscreen
            />
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

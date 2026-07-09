'use client';

/**
 * View-only recording player for students. Embeds the unlisted YouTube backup
 * of a completed class (youtube-nocookie, no related videos). This is the plain
 * self-study path; the gated "guided recap" with checkpoint quizzes is separate.
 */
import { Dialog, DialogContent, DialogTitle, IconButton, Box, Typography } from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';

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
          <Box
            component="iframe"
            src={`https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0&modestbranding=1`}
            title={title || 'Class recording'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
          />
        </Box>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { Box, Button, Typography } from '@neram/ui';
import BrushIcon from '@mui/icons-material/Brush';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import { drawingWhatsAppLink } from '@neram/database/demo-schedule';
import { trackTaxonomyEvent } from '@/lib/funnel-tracker';

/**
 * "Send us any drawing": opens WhatsApp with the demo ref already typed, so the
 * team can match the drawing to the booking and reply with voice-note feedback.
 * Optional and never blocks booking.
 */
export default function DrawingShareCard({ number, refCode }: { number: string; refCode: string | null }) {
  return (
    <Box
      sx={{
        p: { xs: 2, sm: 2.5 },
        borderRadius: 2,
        border: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: 'auto 1fr' },
        gap: 2,
        alignItems: 'center',
      }}
    >
      <Box
        aria-hidden
        sx={{
          width: 52,
          height: 52,
          borderRadius: 2,
          bgcolor: 'secondary.main',
          color: 'secondary.contrastText',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <BrushIcon />
      </Box>
      <Box>
        <Typography variant="subtitle1" component="p" fontWeight={800}>
          While you wait, send us any drawing
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
          Not exam work, anything you have drawn. We look at the quality of your hand, not the topic, and an architect replies
          on WhatsApp with what is great and what to try next.
        </Typography>
        <Button
          variant="contained"
          color="success"
          startIcon={<WhatsAppIcon />}
          href={drawingWhatsAppLink(number, refCode)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackTaxonomyEvent('demo_drawing_share_clicked', { ref: refCode ?? undefined })}
          sx={{ mt: 1.5, minHeight: 48 }}
        >
          Share a drawing on WhatsApp
        </Button>
      </Box>
    </Box>
  );
}

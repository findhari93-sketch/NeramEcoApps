'use client';

import { Fab } from '@neram/ui';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import { buildWhatsAppLink } from '@/lib/whatsapp';
import { trackWhatsAppClick } from '@/lib/whatsapp-track';


export default function WhatsAppChatBubble({ centreCity, centreSlug }: { centreCity?: string; centreSlug?: string } = {}) {
  const handleClick = () => {
    const { href, pageCode } = buildWhatsAppLink({ city: centreCity ?? null, citySlug: centreSlug ?? null });
    trackWhatsAppClick(pageCode, { location_slug: centreSlug ?? null, placement: 'chat_bubble' });
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  return (
    <Fab
      color="primary"
      aria-label="Chat on WhatsApp"
      onClick={handleClick}
      sx={{
        position: 'fixed',
        bottom: 20,
        left: 20,
        backgroundColor: '#25D366',
        width: 56,
        height: 56,
        '&:hover': { backgroundColor: '#128C7E' },
        zIndex: 1200,
        '@media (max-width: 768px)': {
          width: 48,
          height: 48,
          bottom: 16,
          left: 16,
        },
      }}
    >
      <WhatsAppIcon sx={{ fontSize: 28 }} />
    </Fab>
  );
}

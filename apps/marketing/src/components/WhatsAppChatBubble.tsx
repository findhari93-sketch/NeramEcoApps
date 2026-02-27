'use client';

import { Fab } from '@neram/ui';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';

const WHATSAPP_PHONE = '+919176137043';
const DEFAULT_MESSAGE =
  "Hello! I'm contacting you from neramclasses.com. I would like to know more about NATA coaching.";

export default function WhatsAppChatBubble() {
  const handleClick = () => {
    const encodedMessage = encodeURIComponent(DEFAULT_MESSAGE);
    window.open(
      `https://wa.me/${WHATSAPP_PHONE}?text=${encodedMessage}`,
      '_blank',
      'noopener,noreferrer'
    );
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

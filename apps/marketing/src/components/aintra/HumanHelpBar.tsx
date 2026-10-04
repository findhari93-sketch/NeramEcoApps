'use client';

import { Box, Typography } from '@mui/material';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import { openTawkChat } from '@/lib/tawk';
import { buildWhatsAppLink } from '@/lib/whatsapp';
import { trackWhatsAppClick } from '@/lib/whatsapp-track';

/**
 * Compact "talk to a human" bar shown inside the embedded Aintra chats.
 * Gives students a WhatsApp and a Tawk.to live-chat fallback so they are
 * never stuck when the AI is unavailable (e.g. Gemini quota/credit issues).
 *
 * Tawk.to is loaded on demand (lib/tawk.ts) when Live chat is tapped; we fall
 * back to the contact page if it cannot load.
 */

const WHATSAPP = buildWhatsAppLink({ text: 'Hello! I need help from Neram Classes.' });

function openWhatsApp() {
  if (typeof window !== 'undefined') {
    trackWhatsAppClick(WHATSAPP.pageCode, { placement: 'aintra_help' });
    window.open(WHATSAPP.href, '_blank', 'noopener,noreferrer');
  }
}

async function openLiveChat() {
  if (typeof window === 'undefined') return;
  if (await openTawkChat({ hideOnMinimize: true })) return;
  // After an await a new tab would be popup-blocked, so go to the contact page.
  window.location.assign('/contact');
}

export default function HumanHelpBar({ label = 'Need human help?' }: { label?: string }) {
  return (
    <Box
      sx={{
        px: 1.5,
        py: 0.75,
        bgcolor: '#f1f5f9',
        borderTop: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        flexShrink: 0,
        flexWrap: 'nowrap',
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ fontSize: '0.7rem', lineHeight: 1, whiteSpace: 'nowrap' }}
      >
        {label}
      </Typography>
      <Box
        onClick={openWhatsApp}
        role="button"
        tabIndex={0}
        aria-label="Chat with our team on WhatsApp"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') openWhatsApp();
        }}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          cursor: 'pointer',
          px: 1,
          py: 0.5,
          borderRadius: 1,
          minHeight: 28,
          '&:hover': { bgcolor: '#e2e8f0' },
        }}
      >
        <WhatsAppIcon sx={{ fontSize: 15, color: '#25D366', display: 'block' }} />
        <Typography component="span" sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#25D366', lineHeight: 1 }}>
          WhatsApp
        </Typography>
      </Box>
      <Box
        onClick={openLiveChat}
        role="button"
        tabIndex={0}
        aria-label="Open live chat with our team"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') openLiveChat();
        }}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          cursor: 'pointer',
          px: 1,
          py: 0.5,
          borderRadius: 1,
          minHeight: 28,
          '&:hover': { bgcolor: '#e2e8f0' },
        }}
      >
        <SupportAgentIcon sx={{ fontSize: 15, color: '#1976d2', display: 'block' }} />
        <Typography component="span" sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#1976d2', lineHeight: 1 }}>
          Live Chat
        </Typography>
      </Box>
    </Box>
  );
}

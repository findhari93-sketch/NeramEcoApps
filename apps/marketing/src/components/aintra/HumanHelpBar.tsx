'use client';

import { Box, Typography } from '@mui/material';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import { openTawkChat } from '@/lib/tawk';
import { buildWhatsAppLink } from '@/lib/whatsapp';
import { trackWhatsAppClick } from '@/lib/whatsapp-track';
import { tokens, brandColors } from '@/design-system';

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
        bgcolor: tokens.ground,
        borderTop: `1px solid ${tokens.line}`,
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
        sx={{ fontSize: '0.75rem', lineHeight: 1, whiteSpace: 'nowrap' }}
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
          borderRadius: 1,
          minHeight: 44,
          '&:hover': { bgcolor: tokens.surfaceHover },
          '&:focus-visible': { outline: tokens.focusOutline, outlineOffset: 2 },
        }}
      >
        <WhatsAppIcon sx={{ fontSize: 16, color: brandColors.whatsappDark, display: 'block' }} />
        <Typography component="span" sx={{ fontSize: '0.75rem', fontWeight: 600, color: tokens.ink, lineHeight: 1 }}>
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
          borderRadius: 1,
          minHeight: 44,
          '&:hover': { bgcolor: tokens.surfaceHover },
          '&:focus-visible': { outline: tokens.focusOutline, outlineOffset: 2 },
        }}
      >
        <SupportAgentIcon sx={{ fontSize: 16, color: tokens.navy900, display: 'block' }} />
        <Typography component="span" sx={{ fontSize: '0.75rem', fontWeight: 600, color: tokens.ink, lineHeight: 1 }}>
          Live Chat
        </Typography>
      </Box>
    </Box>
  );
}

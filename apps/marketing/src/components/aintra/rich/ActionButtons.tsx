'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Box, Button } from '@neram/ui';
import EditNoteRoundedIcon from '@mui/icons-material/EditNoteRounded';
import EventAvailableRoundedIcon from '@mui/icons-material/EventAvailableRounded';
import PhoneRoundedIcon from '@mui/icons-material/PhoneRounded';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import type { CtaAction } from '@/lib/aintra/rich/parse';
import { buildWhatsAppLink } from '@/lib/whatsapp';
import { trackWhatsAppClick } from '@/lib/whatsapp-track';

const PHONE = '+919176137043';

const ACTIONS: Record<CtaAction, { label: string; icon: ReactNode; href?: string; primary?: boolean }> = {
  apply: { label: 'Apply now', icon: <EditNoteRoundedIcon />, href: '/apply', primary: true },
  demo: { label: 'Book a demo class', icon: <EventAvailableRoundedIcon />, href: '/demo-class' },
  call: { label: 'Call us', icon: <PhoneRoundedIcon />, href: `tel:${PHONE}` },
  whatsapp: { label: 'Chat on WhatsApp', icon: <WhatsAppIcon /> },
};

function openWhatsApp() {
  const { href, pageCode } = buildWhatsAppLink({ text: 'Hello! I need help from Neram Classes.' });
  trackWhatsAppClick(pageCode, { placement: 'chatbot' });
  window.open(href, '_blank', 'noopener,noreferrer');
}

/** The buttons a [[cta:...]] line asks for. The first one listed is the primary action. */
export default function ActionButtons({ actions }: { actions: CtaAction[] }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
      {actions.map((action, i) => {
        const def = ACTIONS[action];
        const contained = i === 0 && action !== 'whatsapp';
        const common = {
          variant: contained ? ('contained' as const) : ('outlined' as const),
          disableElevation: true,
          startIcon: def.icon,
          sx: {
            flex: { xs: '1 1 100%', sm: '0 0 auto' },
            minHeight: 48,
            px: 2.25,
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 700,
            ...(action === 'whatsapp' && {
              color: '#0F7A3D',
              borderColor: '#0F7A3D',
              '&:hover': { borderColor: '#0B6331', bgcolor: 'rgba(15,122,61,0.06)' },
            }),
          },
        };
        if (action === 'whatsapp') {
          return (
            <Button key={action} onClick={openWhatsApp} {...common}>
              {def.label}
            </Button>
          );
        }
        if (def.href?.startsWith('tel:')) {
          return (
            <Button key={action} component="a" href={def.href} {...common}>
              {def.label}
            </Button>
          );
        }
        return (
          <Button key={action} component={Link} href={def.href!} {...common}>
            {def.label}
          </Button>
        );
      })}
    </Box>
  );
}

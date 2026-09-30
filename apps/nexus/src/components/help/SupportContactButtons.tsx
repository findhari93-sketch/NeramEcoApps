'use client';

import { useEffect, useState } from 'react';
import { Box, Button, Stack, Typography } from '@neram/ui';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import {
  SUPPORT_PHONE,
  SUPPORT_PHONE_DISPLAY,
  SUPPORT_TEL_LINK,
  buildWhatsAppHelpLink,
  describeDevice,
  whatsAppLink,
  type HelpProblem,
} from '@/lib/support-contact';

/** 48px, over the 44px minimum. */
const TAP = 48;

/** "Android 14 phone, Chrome 129, installed app", from the phone this is running on. */
export function currentDeviceSummary(): string {
  if (typeof navigator === 'undefined') return 'browser';
  let installed = false;
  try {
    installed = window.matchMedia('(display-mode: standalone)').matches;
  } catch {
    installed = false;
  }
  return describeDevice({ userAgent: navigator.userAgent, installed });
}

interface SupportContactButtonsProps {
  problem: HelpProblem;
  /** Show the number under the buttons, for someone who would rather dial it. */
  showNumber?: boolean;
}

/**
 * WhatsApp and Call, the two ways out that work when Nexus does not. WhatsApp
 * queues the message until the phone has any signal and a tel: link needs no
 * data at all, which is why these, and not a form, are what the offline screen
 * leads with.
 */
export default function SupportContactButtons({ problem, showNumber = true }: SupportContactButtonsProps) {
  // The plain link renders on the server. The one with the time and the device
  // typed in is built after mount, because both differ between server and phone.
  const [whatsAppHref, setWhatsAppHref] = useState(() => whatsAppLink(SUPPORT_PHONE));
  useEffect(() => {
    setWhatsAppHref(
      buildWhatsAppHelpLink({
        problem,
        device: currentDeviceSummary(),
        at: new Date(),
        appVersion: process.env.NEXT_PUBLIC_BUILD_STAMP ?? null,
      }),
    );
  }, [problem]);

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <Button
          component="a"
          href={whatsAppHref}
          target="_blank"
          rel="noopener noreferrer"
          variant="contained"
          startIcon={<WhatsAppIcon />}
          fullWidth
          sx={{
            minHeight: TAP,
            textTransform: 'none',
            fontSize: '1rem',
            // WhatsApp green, darkened so white text passes 4.5:1. The theme paints
            // contained buttons with a gradient image, which would cover the colour.
            bgcolor: '#0F7A3F',
            backgroundImage: 'none',
            '&:hover': { bgcolor: '#0B6634', backgroundImage: 'none' },
          }}
        >
          WhatsApp us
        </Button>
        <Button
          component="a"
          href={SUPPORT_TEL_LINK}
          variant="outlined"
          startIcon={<PhoneOutlinedIcon />}
          fullWidth
          sx={{ minHeight: TAP, textTransform: 'none', fontSize: '1rem' }}
        >
          Call us
        </Button>
      </Stack>
      {showNumber && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, textAlign: 'center' }}>
          Neram office: {SUPPORT_PHONE_DISPLAY}
        </Typography>
      )}
    </Box>
  );
}

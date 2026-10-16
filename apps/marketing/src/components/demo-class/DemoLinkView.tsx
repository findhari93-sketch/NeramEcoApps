'use client';

import { NextIntlClientProvider } from 'next-intl';
import { Box, Typography } from '@neram/ui';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import type { PublicDemoRequest } from '@/lib/demo-request';
import { CtaButton, eyebrowSx, iconTileSx, tokens as t } from '@/design-system';
import DemoStatusCard, { type DemoPublicSettings } from './DemoStatusCard';

/** The /d/{token} page body: one card, a call button, nothing to get lost in. */
export default function DemoLinkView({
  request,
  settings,
}: {
  request: PublicDemoRequest | null;
  settings: DemoPublicSettings;
}) {
  return (
    // /d sits outside [locale]: a client provider lets the design-system Link resolve internal paths.
    <NextIntlClientProvider locale="en" messages={{}} timeZone="Asia/Kolkata">
      <Box component="main" sx={{ minHeight: '100dvh', bgcolor: t.ground, color: t.ink, py: { xs: 3, sm: 6 }, boxSizing: 'border-box' }}>
        <Box sx={{ maxWidth: 600, mx: 'auto', px: 2, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <Typography component="p" sx={eyebrowSx}>
            Neram Classes
          </Typography>
          {request ? (
            <DemoStatusCard
              request={request}
              settings={settings}
              origin=""
              actions={
                ['cancelled', 'rejected', 'no_show', 'attended'].includes(request.status) ? (
                  <CtaButton href="/demo-class">Book a new time</CtaButton>
                ) : (
                  <CtaButton variant="outline" href="/demo-class/my">
                    Manage my demo
                  </CtaButton>
                )
              }
            />
          ) : (
            <Box
              sx={{
                bgcolor: t.surface,
                border: `1px solid ${t.line}`,
                borderRadius: `${t.radius}px`,
                px: { xs: 2.5, sm: 4 },
                py: { xs: 4, sm: 6 },
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: 1.5,
              }}
            >
              <Box aria-hidden sx={{ ...iconTileSx, mb: 0.5 }}>
                <EventBusyOutlinedIcon />
              </Box>
              <Typography component="h1" sx={{ m: 0, fontSize: '1.375rem', fontWeight: 800, lineHeight: 1.3 }}>
                We could not find this demo link
              </Typography>
              <Typography component="p" sx={{ m: 0, maxWidth: 440, fontSize: '1rem', lineHeight: 1.55, color: t.inkMuted }}>
                It may have been copied incompletely. Book a demo or call us and we will help.
              </Typography>
              <Box sx={{ mt: 1.5 }}>
                <CtaButton href="/demo-class">Book a free demo</CtaButton>
              </Box>
            </Box>
          )}
          <Box>
            <CtaButton variant="link" size="md" href="tel:+919176137043" startIcon={<PhoneOutlinedIcon aria-hidden />}>
              Need help? Call +91 91761 37043
            </CtaButton>
          </Box>
        </Box>
      </Box>
    </NextIntlClientProvider>
  );
}

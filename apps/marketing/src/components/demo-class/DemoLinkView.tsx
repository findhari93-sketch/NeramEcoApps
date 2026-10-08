'use client';

import { Box, Button, Container, Typography } from '@neram/ui';
import PhoneIcon from '@mui/icons-material/Phone';
import type { PublicDemoRequest } from '@/lib/demo-request';
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
    <Box sx={{ minHeight: '100dvh', bgcolor: 'background.default', py: { xs: 3, sm: 6 } }}>
      <Container maxWidth="sm" sx={{ px: 2 }}>
        <Typography variant="subtitle1" component="p" fontWeight={800} sx={{ mb: 2 }}>
          Neram Classes
        </Typography>
        {request ? (
          <DemoStatusCard
            request={request}
            settings={settings}
            origin=""
            actions={
              ['cancelled', 'rejected', 'no_show', 'attended'].includes(request.status) ? (
                <Button variant="contained" href="/demo-class" sx={{ minHeight: 48 }}>
                  Book a new time
                </Button>
              ) : (
                <Button variant="outlined" href="/demo-class/my" sx={{ minHeight: 48 }}>
                  Manage my demo
                </Button>
              )
            }
          />
        ) : (
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <Typography variant="h6" component="h1" fontWeight={800}>
              We could not find this demo link
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              It may have been copied incompletely. Book a demo or call us and we will help.
            </Typography>
            <Button variant="contained" href="/demo-class" sx={{ mt: 3, minHeight: 48 }}>
              Book a free demo
            </Button>
          </Box>
        )}
        <Button startIcon={<PhoneIcon />} href="tel:+919176137043" sx={{ mt: 3, minHeight: 44 }}>
          Need help? Call +91 91761 37043
        </Button>
      </Container>
    </Box>
  );
}

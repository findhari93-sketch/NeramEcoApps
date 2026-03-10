'use client';

import { useState } from 'react';
import { Box, Container, Typography, Button, Collapse, useMediaQuery, useTheme } from '@neram/ui';
import { ChatBubbleOutline as ChatIcon, Close as CloseIcon } from '@mui/icons-material';
import { useTranslations } from 'next-intl';
import { ApplyFormWizardContent } from '@/components/apply/ApplyFormWizard';
import { FormProvider } from '@/components/apply/FormContext';
import dynamic from 'next/dynamic';

// Lazy-load ChatAssistant since it's not critical for initial render
const ChatAssistant = dynamic(() => import('@/components/apply/ChatAssistant'), {
  ssr: false,
});

export default function ApplyPageContent() {
  const t = useTranslations('apply');
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <Box>
      {/* Hero Section */}
      <Box
        sx={{
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          py: { xs: 4, md: 6 },
        }}
      >
        <Container maxWidth="lg">
          <Typography
            variant="h3"
            component="h1"
            gutterBottom
            sx={{ fontWeight: 700 }}
          >
            {t('title')}
          </Typography>
          <Typography variant="h6" sx={{ maxWidth: '700px', opacity: 0.9 }}>
            {t('subtitle')}
          </Typography>
        </Container>
      </Box>

      {/* Application Form + Chat Assistant — wrapped in shared FormProvider */}
      <Box sx={{ py: { xs: 3, md: 5 }, bgcolor: 'grey.50' }}>
        <FormProvider>
          {isDesktop ? (
            /* Desktop: Two-column layout */
            <Container maxWidth="xl">
              {/* Toggle button */}
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                <Button
                  variant={chatOpen ? 'outlined' : 'contained'}
                  color={chatOpen ? 'inherit' : 'secondary'}
                  size="small"
                  startIcon={chatOpen ? <CloseIcon /> : <ChatIcon />}
                  onClick={() => setChatOpen(!chatOpen)}
                  sx={{
                    borderRadius: 6,
                    textTransform: 'none',
                    px: 2.5,
                  }}
                >
                  {chatOpen ? 'Close Assistant' : t('chatAssistant.toggleButton')}
                </Button>
              </Box>

              <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
                {/* Left: Form Wizard */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <ApplyFormWizardContent />
                </Box>

                {/* Right: Chat Panel */}
                <Collapse
                  orientation="horizontal"
                  in={chatOpen}
                  sx={{
                    flexShrink: 0,
                    '& .MuiCollapse-wrapperInner': {
                      width: 380,
                    },
                  }}
                >
                  <Box
                    sx={{
                      width: 380,
                      position: 'sticky',
                      top: 80,
                      height: 'calc(100vh - 120px)',
                      borderRadius: 2,
                      overflow: 'hidden',
                      boxShadow: 3,
                      bgcolor: 'background.paper',
                    }}
                  >
                    <ChatAssistant displayMode="panel" />
                  </Box>
                </Collapse>
              </Box>
            </Container>
          ) : (
            /* Mobile: Form only + floating chat FAB */
            <Box>
              <ApplyFormWizardContent />
              <ChatAssistant displayMode="floating" />
            </Box>
          )}
        </FormProvider>
      </Box>
    </Box>
  );
}

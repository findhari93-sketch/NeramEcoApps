'use client';

import { Box, Container, Typography } from '@neram/ui';
import { useTranslations } from 'next-intl';
import ApplyFormWizard from '@/components/apply/ApplyFormWizard';

export default function ApplyPageContent() {
  const t = useTranslations('apply');

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

      {/* Application Form */}
      <Box sx={{ py: { xs: 3, md: 5 }, bgcolor: 'grey.50' }}>
        <ApplyFormWizard />
      </Box>
    </Box>
  );
}

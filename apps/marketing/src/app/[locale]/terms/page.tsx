import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Box, Container, Paper } from '@neram/ui';
import TermsContent from '../../../components/legal/TermsContent';

export const metadata: Metadata = {
  title: 'Terms & Conditions - Neram Classes',
  description: 'Terms and Conditions for using Neram Classes services. Read our policies on enrollment, payments, data usage, and more.',
  alternates: {
    canonical: 'https://neramclasses.com/en/terms',
  },
};

interface PageProps {
  params: { locale: string };
}

export default function TermsPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);

  return (
    <Box sx={{ py: { xs: 4, md: 8 }, bgcolor: 'background.default', minHeight: '80vh' }}>
      <Container maxWidth="md">
        <Paper sx={{ p: { xs: 3, md: 6 } }}>
          <TermsContent />
        </Paper>
      </Container>
    </Box>
  );
}

import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Box, Container, Paper } from '@neram/ui';
import RefundPolicyContent from '../../../components/legal/RefundPolicyContent';

export const metadata: Metadata = {
  title: 'Refund Policy - Neram Classes',
  description: 'Refund Policy for Neram Classes. Learn about our 24-hour refund window, processing fees, and how to request a refund.',
  alternates: {
    canonical: 'https://neramclasses.com/en/refund-policy',
  },
};

interface PageProps {
  params: { locale: string };
}

export default function RefundPolicyPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);

  return (
    <Box sx={{ py: { xs: 4, md: 8 }, bgcolor: 'background.default', minHeight: '80vh' }}>
      <Container maxWidth="md">
        <Paper sx={{ p: { xs: 3, md: 6 } }}>
          <RefundPolicyContent />
        </Paper>
      </Container>
    </Box>
  );
}

'use client';

import { Box, Typography } from '@neram/ui';
import DashboardStats from '@/components/DashboardStats';
import WhatsAppHealthBanner from '@/components/WhatsAppHealthBanner';
import ConversionCard from '@/components/ConversionCard';

export default function DashboardPage() {
  return (
    <Box>
      <Typography variant="h4" component="h1" fontWeight="bold">
        Dashboard
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 1.5 }}>
        Welcome to the Neram Classes Admin Panel
      </Typography>

      <WhatsAppHealthBanner />

      <DashboardStats />

      <ConversionCard />
    </Box>
  );
}

'use client';

import { Box, Typography, Button, Chip } from '@neram/ui';
import Link from 'next/link';

interface ComingSoonPageProps {
  toolName: string;
  examType: 'NATA' | 'JEE Paper 2';
  description: string;
}

export default function ComingSoonPage({ toolName, examType, description }: ComingSoonPageProps) {
  return (
    <Box sx={{ maxWidth: 600, mx: 'auto', textAlign: 'center', py: { xs: 4, md: 8 }, px: 2 }}>
      <Typography sx={{ fontSize: '4rem', mb: 2 }}>
        {examType === 'NATA' ? '\u{1F3DB}' : '\u{1F4D0}'}
      </Typography>
      <Chip label={examType} color="primary" sx={{ mb: 2 }} />
      <Typography variant="h4" gutterBottom fontWeight={700} sx={{ fontSize: { xs: '1.5rem', md: '2rem' } }}>
        {toolName}
      </Typography>
      <Typography variant="h6" color="text.secondary" gutterBottom>
        Coming Soon
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        {description}
      </Typography>
      <Button
        component={Link}
        href="/dashboard"
        variant="contained"
        size="large"
        sx={{ minHeight: 48 }}
      >
        Back to Dashboard
      </Button>
    </Box>
  );
}

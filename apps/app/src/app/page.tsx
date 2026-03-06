import { Suspense } from 'react';
import { Box, Typography, CircularProgress } from '@neram/ui';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateSoftwareApplicationSchema, generateFAQSchema, generateBreadcrumbSchema } from '@/lib/seo/schemas';
import { FAQS } from '@/lib/landing-data';
import LandingPageContent from '@/components/landing/LandingPageContent';

function LoadingFallback() {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        bgcolor: '#060d1f',
        gap: 2,
      }}
    >
      <CircularProgress sx={{ color: '#e8a020' }} />
      <Typography sx={{ color: '#f5f0e8' }}>Loading...</Typography>
    </Box>
  );
}

export default function HomePage() {
  return (
    <>
      {/* SEO: JSON-LD Structured Data */}
      <JsonLd data={generateSoftwareApplicationSchema()} />
      <JsonLd data={generateFAQSchema([...FAQS])} />
      <JsonLd data={generateBreadcrumbSchema()} />

      <Suspense fallback={<LoadingFallback />}>
        <LandingPageContent />
      </Suspense>
    </>
  );
}

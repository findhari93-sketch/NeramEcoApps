'use client';

import { Box, Container, Typography } from '@neram/ui';
import { m3Tertiary, m3Primary, m3Secondary } from '@neram/ui';
import { NataAssistanceForm } from '@/components/nata/NataAssistanceForm';
import ScrollReveal from '@/components/nata/sections/ScrollReveal';

interface AssistanceSectionProps {
  locale: string;
}

/** Row of overlapping colored avatar circles as a trust indicator */
function TrustIndicator() {
  const colors = [
    m3Primary[60],
    m3Tertiary[60],
    m3Secondary[60],
    m3Primary[80],
    m3Tertiary[80],
  ];

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1.5,
        mt: { xs: 3, md: 4 },
        flexWrap: 'wrap',
      }}
    >
      {/* Overlapping avatar-like circles */}
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        {colors.map((color, i) => (
          <Box
            key={i}
            sx={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              bgcolor: color,
              border: '2px solid #fff',
              ml: i === 0 ? 0 : '-8px',
              position: 'relative',
              zIndex: colors.length - i,
            }}
          />
        ))}
      </Box>

      <Typography
        variant="body2"
        sx={{
          fontWeight: 600,
          color: 'text.secondary',
          fontSize: { xs: '0.8rem', md: '0.875rem' },
        }}
      >
        Helped 10,000+ students
      </Typography>
    </Box>
  );
}

export default function AssistanceSection({ locale }: AssistanceSectionProps) {
  return (
    <Box
      component="section"
      sx={{
        background:
          'linear-gradient(180deg, rgba(249, 168, 37, 0.04) 0%, rgba(249, 168, 37, 0.02) 100%)',
        py: { xs: 6, md: 10 },
        px: { xs: 2, md: 0 },
      }}
    >
      <Container maxWidth="sm">
        <ScrollReveal direction="up">
          {/* Heading */}
          <Typography
            variant="h4"
            component="h2"
            sx={{
              fontWeight: 700,
              textAlign: 'center',
              mb: 1.5,
              fontSize: { xs: '1.5rem', md: '2rem' },
            }}
          >
            Need Help Applying?
          </Typography>

          {/* Amber underline accent */}
          <Box
            sx={{
              width: 60,
              height: 4,
              bgcolor: m3Tertiary[40],
              borderRadius: 2,
              mx: 'auto',
              mb: 2,
            }}
          />

          {/* Subtitle */}
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ textAlign: 'center', mb: { xs: 3, md: 4 } }}
          >
            Our team will guide you through the NATA application process
          </Typography>

          {/* Assistance form */}
          <NataAssistanceForm locale={locale} />

          {/* Trust indicator */}
          <TrustIndicator />
        </ScrollReveal>
      </Container>
    </Box>
  );
}

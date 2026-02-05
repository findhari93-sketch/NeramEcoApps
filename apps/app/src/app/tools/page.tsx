import { Box, Typography, Grid, Card, CardContent, CardActions, Button } from '@neram/ui';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Free NATA Tools | Cutoff Calculator, College Predictor, Exam Centers',
  description:
    'Free NATA preparation tools - Calculate cutoff scores, predict colleges based on your NATA score, and find exam centers near you.',
  keywords: [
    'NATA tools',
    'NATA cutoff calculator',
    'NATA college predictor',
    'NATA exam centers',
    'NATA preparation',
    'architecture entrance exam',
  ],
  openGraph: {
    title: 'Free NATA Tools | Neram Classes',
    description: 'Calculate cutoff, predict colleges, and find exam centers for NATA',
    type: 'website',
  },
};

const tools = [
  {
    title: 'Cutoff Calculator',
    description:
      'Calculate your expected NATA cutoff based on section-wise scores and get personalized insights.',
    icon: '🔢',
    href: '/tools/cutoff-calculator',
    features: ['Section-wise analysis', 'Category-based cutoffs', 'Instant results'],
  },
  {
    title: 'College Predictor',
    description:
      'Find architecture colleges that match your NATA score with our AI-powered prediction engine.',
    icon: '🏫',
    href: '/tools/college-predictor',
    features: ['5000+ colleges', 'State-wise filter', 'Fee information'],
  },
  {
    title: 'Exam Centers',
    description:
      'Locate NATA exam centers near you with detailed address, capacity, and distance information.',
    icon: '📍',
    href: '/tools/exam-centers',
    features: ['All India coverage', 'Distance calculator', 'Center details'],
  },
];

export default function ToolsLandingPage() {
  return (
    <Box>
      {/* Hero Section */}
      <Box sx={{ textAlign: 'center', mb: { xs: 4, md: 6 } }}>
        <Typography
          variant="h3"
          component="h1"
          gutterBottom
          sx={{ fontWeight: 700, fontSize: { xs: '1.75rem', md: '2.5rem' } }}
        >
          Free NATA Preparation Tools
        </Typography>
        <Typography
          variant="h6"
          color="text.secondary"
          sx={{ maxWidth: 600, mx: 'auto', fontSize: { xs: '1rem', md: '1.25rem' } }}
        >
          Everything you need to prepare for NATA - calculate cutoffs, predict colleges, and find
          exam centers.
        </Typography>
      </Box>

      {/* Tools Grid */}
      <Grid container spacing={3}>
        {tools.map((tool) => (
          <Grid item xs={12} md={4} key={tool.href}>
            <Card
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                transition: 'transform 0.2s, box-shadow 0.2s',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: 4,
                },
              }}
            >
              <CardContent sx={{ flexGrow: 1 }}>
                <Box sx={{ fontSize: '2.5rem', mb: 2 }}>{tool.icon}</Box>
                <Typography variant="h5" gutterBottom fontWeight={600}>
                  {tool.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {tool.description}
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {tool.features.map((feature) => (
                    <Box
                      key={feature}
                      sx={{
                        px: 1.5,
                        py: 0.5,
                        bgcolor: 'primary.50',
                        color: 'primary.main',
                        borderRadius: 1,
                        fontSize: '0.75rem',
                        fontWeight: 500,
                      }}
                    >
                      {feature}
                    </Box>
                  ))}
                </Box>
              </CardContent>
              <CardActions sx={{ p: 2, pt: 0 }}>
                <Button
                  component={Link}
                  href={tool.href}
                  variant="contained"
                  fullWidth
                  size="large"
                >
                  Use Tool
                </Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Info Section */}
      <Box
        sx={{
          mt: { xs: 4, md: 6 },
          p: { xs: 3, md: 4 },
          bgcolor: 'grey.50',
          borderRadius: 2,
          textAlign: 'center',
        }}
      >
        <Typography variant="h5" gutterBottom fontWeight={600}>
          About These Tools
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 700, mx: 'auto' }}>
          Our NATA tools are built using real data from previous years' admissions and official
          sources. While we strive for accuracy, actual cutoffs and admissions may vary based on
          multiple factors. Use these tools as a guide for your preparation journey.
        </Typography>
      </Box>
    </Box>
  );
}

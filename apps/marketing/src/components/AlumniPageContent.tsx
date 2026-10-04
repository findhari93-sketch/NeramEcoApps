'use client';

import { useTranslations } from 'next-intl';
import {
  Box,
  Container,
  Typography,
  Grid,
  Chip,
  Button,
} from '@neram/ui';
import Link from 'next/link';
import { ReviewCard } from '@/components/reviews/ReviewParts';
import type { PublicReview } from '@/lib/reviews/json-ld';

const stats = [
  { value: '1,000+', label: 'Students Taught' },
  { value: 'AIR 1', label: 'JEE B.Arch 2024' },
  { value: '10+', label: 'Years' },
  { value: '189', label: 'Top NATA Score' },
];

const topColleges = [
  'IIT Kharagpur',
  'IIT Roorkee',
  'NIT Trichy',
  'SPA Delhi',
  'SPA Bhopal',
  'CEPT University',
  'JJ College of Architecture',
  'Chandigarh College of Architecture',
  'BIT Mesra',
  'MNIT Jaipur',
  'NIT Calicut',
  'Anna University',
];

/**
 * Stories come from published reviews that name the college the student joined
 * (consent and moderation already passed). The block is hidden when there are none.
 */
export default function AlumniPageContent({ stories = [], reviewsHref = '/reviews' }: { stories?: PublicReview[]; reviewsHref?: string }) {
  const t = useTranslations('alumniStories');
  const tr = useTranslations('reviews');
  const cardLabels = {
    stars: (rating: number) => tr('starsLabel', { rating }),
    joined: (college: string) => tr('joined', { college }),
    featured: tr('featured'),
  };
  return (
    <Box>
      {/* Hero Section */}
      <Box
        sx={{
          py: { xs: 8, md: 12 },
          background: 'linear-gradient(135deg, #2e7d32 0%, #1b5e20 100%)',
          color: 'white',
        }}
      >
        <Container maxWidth="lg">
          <Typography variant="h1" component="h1" align="center" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '2.5rem', md: '3.5rem' } }}>
            Our Success Stories
          </Typography>
          <Typography variant="h5" align="center" sx={{ mb: 4, opacity: 0.9, maxWidth: 800, mx: 'auto' }}>
            Meet the achievers who turned their dreams into reality with Neram Classes.
            Our alumni are now shaping the future of architecture across India and beyond.
          </Typography>
        </Container>
      </Box>

      {/* Stats Section */}
      <Box sx={{ py: 6, bgcolor: 'grey.100' }}>
        <Container maxWidth="lg">
          <Grid container spacing={4}>
            {stats.map((stat, index) => (
              <Grid item xs={6} md={3} key={index}>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h3" component="div" sx={{ fontWeight: 700, color: 'success.main' }}>
                    {stat.value}
                  </Typography>
                  <Typography variant="body1" color="text.secondary">
                    {stat.label}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Success Stories Section: published data only */}
      {stories.length > 0 && (
        <Box component="section" aria-labelledby="alumni-stories-title" sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
          <Container maxWidth="lg">
            <Typography id="alumni-stories-title" variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 2, fontWeight: 700, fontSize: { xs: '1.75rem', md: '2.5rem' } }}>
              {t('title')}
            </Typography>
            <Typography variant="h6" component="p" align="center" color="text.secondary" sx={{ mb: { xs: 4, md: 6 }, fontSize: { xs: '1rem', md: '1.25rem' } }}>
              {t('subtitle')}
            </Typography>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: '1fr 1fr 1fr' }, gap: { xs: 2, md: 3 } }}>
              {stories.map((story) => (
                <ReviewCard key={story.id} review={story} labels={cardLabels} />
              ))}
            </Box>

            <Box sx={{ textAlign: 'center', mt: 4 }}>
              <Button
                variant="outlined"
                component={Link}
                href={reviewsHref}
                sx={{ minHeight: 48, px: 3, textTransform: 'none', fontWeight: 600 }}
              >
                {t('readAll')}
              </Button>
            </Box>
          </Container>
        </Box>
      )}

      {/* Top Colleges Section */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 2, fontWeight: 700 }}>
            Where Our Students Go
          </Typography>
          <Typography variant="h6" align="center" color="text.secondary" sx={{ mb: 6 }}>
            Top architecture colleges where our alumni are studying
          </Typography>

          <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 2 }}>
            {topColleges.map((college, index) => (
              <Chip
                key={index}
                label={college}
                sx={{
                  fontSize: '1rem',
                  py: 2.5,
                  px: 1,
                  bgcolor: 'white',
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              />
            ))}
          </Box>
        </Container>
      </Box>

      {/* Join the Legacy Section */}
      <Box
        sx={{
          py: { xs: 6, md: 10 },
          background: 'linear-gradient(135deg, #2e7d32 0%, #1b5e20 100%)',
          color: 'white',
          textAlign: 'center',
        }}
      >
        <Container maxWidth="md">
          <Typography variant="h3" component="h2" gutterBottom sx={{ fontWeight: 700 }}>
            Ready to Write Your Success Story?
          </Typography>
          <Typography variant="h6" sx={{ mb: 4, opacity: 0.9 }}>
            Join the Neram Classes family and become part of our growing alumni network.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              size="large"
              component={Link}
              href="/apply"
              sx={{ bgcolor: 'white', color: 'success.main', '&:hover': { bgcolor: 'grey.100' } }}
            >
              Start Your Journey
            </Button>
            <Button
              variant="outlined"
              size="large"
              component={Link}
              href="/contact"
              sx={{ borderColor: 'white', color: 'white' }}
            >
              Connect with Alumni
            </Button>
          </Box>
        </Container>
      </Box>
    </Box>
  );
}

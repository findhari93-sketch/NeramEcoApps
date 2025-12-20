'use client';

import { useTranslations } from 'next-intl';
import {
  Box,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  Avatar,
  Chip,
  Button,
} from '@neram/ui';
import Link from 'next/link';

const successStories = [
  {
    name: 'Priya Venkatesh',
    rank: 'AIR 12',
    exam: 'NATA 2024',
    college: 'IIT Kharagpur - B.Arch',
    image: '/images/alumni/priya.jpg',
    testimonial: 'The structured approach and personal attention at Neram Classes helped me crack NATA with flying colors. The drawing classes were exceptional!',
    year: 2024,
  },
  {
    name: 'Arjun Krishnan',
    rank: 'AIR 45',
    exam: 'JEE Paper 2 2024',
    college: 'NIT Trichy - B.Arch',
    image: '/images/alumni/arjun.jpg',
    testimonial: 'From struggling with aptitude to securing a top rank - my journey at Neram Classes was transformative. Forever grateful to my mentors!',
    year: 2024,
  },
  {
    name: 'Sneha Reddy',
    rank: 'AIR 78',
    exam: 'NATA 2024',
    college: 'SPA Delhi',
    image: '/images/alumni/sneha.jpg',
    testimonial: 'The mock tests and feedback sessions were game-changers. They identified my weak areas and helped me improve systematically.',
    year: 2024,
  },
  {
    name: 'Karthik Subramaniam',
    rank: 'AIR 156',
    exam: 'NATA 2023',
    college: 'CEPT University',
    image: '/images/alumni/karthik.jpg',
    testimonial: "Best decision I made was joining Neram Classes. The faculty's expertise in architecture entrance exams is unmatched.",
    year: 2023,
  },
  {
    name: 'Meera Nair',
    rank: 'AIR 23',
    exam: 'JEE Paper 2 2023',
    college: 'IIT Roorkee - B.Arch',
    image: '/images/alumni/meera.jpg',
    testimonial: 'The comprehensive study material and regular assessments kept me on track throughout my preparation journey.',
    year: 2023,
  },
  {
    name: 'Rahul Sharma',
    rank: 'AIR 89',
    exam: 'NATA 2023',
    college: 'BIT Mesra - B.Arch',
    image: '/images/alumni/rahul.jpg',
    testimonial: 'Online classes were just as effective as offline. The doubt-clearing sessions helped me overcome all my challenges.',
    year: 2023,
  },
];

const stats = [
  { value: '500+', label: 'Top 100 Ranks' },
  { value: '2000+', label: 'Selections in Top Colleges' },
  { value: '95%', label: 'Success Rate' },
  { value: '50+', label: 'IIT/NIT Selections' },
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

export default function AlumniPage() {
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

      {/* Success Stories Section */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 2, fontWeight: 700 }}>
            Featured Alumni
          </Typography>
          <Typography variant="h6" align="center" color="text.secondary" sx={{ mb: 6 }}>
            Hear from our successful students
          </Typography>

          <Grid container spacing={4}>
            {successStories.map((story, index) => (
              <Grid item xs={12} md={6} lg={4} key={index}>
                <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <CardContent sx={{ flexGrow: 1, p: 4 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                      <Avatar
                        src={story.image}
                        alt={story.name}
                        sx={{ width: 64, height: 64, mr: 2 }}
                      />
                      <Box>
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                          {story.name}
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                          <Chip label={story.rank} size="small" color="success" />
                          <Chip label={story.exam} size="small" variant="outlined" />
                        </Box>
                      </Box>
                    </Box>
                    <Typography variant="body2" color="primary" sx={{ mb: 2, fontWeight: 500 }}>
                      {story.college}
                    </Typography>
                    <Typography variant="body1" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                      "{story.testimonial}"
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

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

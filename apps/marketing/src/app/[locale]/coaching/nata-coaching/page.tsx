import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import {
  Box,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@neram/ui';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'NATA Coaching - Best Online & Offline NATA Classes | Neram Classes',
  description: 'Join the best NATA coaching institute in India. Online and offline classes with expert faculty, comprehensive study material, and proven results.',
  keywords: 'NATA coaching, NATA classes, best NATA coaching, NATA preparation, online NATA coaching',
  alternates: {
    canonical: 'https://neramclasses.com/en/coaching/nata-coaching',
  },
};

interface PageProps {
  params: { locale: string };
}

const features = [
  { icon: '👨‍🏫', title: '50+ Expert Faculty', desc: 'Learn from IIT/NIT alumni and practicing architects' },
  { icon: '📚', title: '500+ Study Hours', desc: 'Comprehensive curriculum covering entire syllabus' },
  { icon: '✏️', title: 'Daily Drawing Practice', desc: '2+ hours of supervised drawing practice daily' },
  { icon: '📝', title: '100+ Mock Tests', desc: 'Regular assessments with detailed analysis' },
  { icon: '🎯', title: '95% Success Rate', desc: 'Proven track record of producing top rankers' },
  { icon: '💬', title: '24/7 Doubt Support', desc: 'Get your queries resolved anytime, anywhere' },
];

const courseDetails = [
  { label: 'Duration', value: '6-12 Months' },
  { label: 'Mode', value: 'Online & Offline' },
  { label: 'Batch Size', value: '20-25 Students' },
  { label: 'Language', value: 'English & Regional' },
];

const popularCities = [
  { city: 'Chennai', slug: 'chennai' },
  { city: 'Bangalore', slug: 'bangalore' },
  { city: 'Hyderabad', slug: 'hyderabad' },
  { city: 'Mumbai', slug: 'mumbai' },
  { city: 'Delhi', slug: 'delhi' },
  { city: 'Coimbatore', slug: 'coimbatore' },
  { city: 'Kochi', slug: 'kochi' },
  { city: 'Pune', slug: 'pune' },
  { city: 'Kolkata', slug: 'kolkata' },
  { city: 'Dubai', slug: 'dubai' },
  { city: 'Madurai', slug: 'madurai' },
  { city: 'Trichy', slug: 'trichy' },
];

export default function NataCoachingPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);

  return (
    <Box>
      {/* Hero Section */}
      <Box
        sx={{
          py: { xs: 8, md: 12 },
          background: 'linear-gradient(135deg, #1a237e 0%, #0d47a1 100%)',
          color: 'white',
        }}
      >
        <Container maxWidth="lg">
          <Grid container spacing={4} alignItems="center">
            <Grid item xs={12} md={7}>
              <Chip label="NATA 2025" sx={{ bgcolor: 'white', color: 'primary.main', mb: 2 }} />
              <Typography variant="h1" component="h1" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '2.5rem', md: '3.5rem' } }}>
                Best NATA Coaching in India
              </Typography>
              <Typography variant="h5" sx={{ mb: 4, opacity: 0.9 }}>
                Join 10,000+ successful architects who started their journey with Neram Classes.
                Online and offline classes available across 90+ cities.
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Button
                  variant="contained"
                  size="large"
                  component={Link}
                  href="/apply"
                  sx={{ bgcolor: 'white', color: 'primary.main' }}
                >
                  Enroll Now
                </Button>
                <Button
                  variant="outlined"
                  size="large"
                  component={Link}
                  href="/contact"
                  sx={{ borderColor: 'white', color: 'white' }}
                >
                  Book Free Demo
                </Button>
              </Box>
            </Grid>
            <Grid item xs={12} md={5}>
              <Card sx={{ bgcolor: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)' }}>
                <CardContent sx={{ p: 4 }}>
                  <Typography variant="h6" gutterBottom sx={{ color: 'white' }}>Course Details</Typography>
                  {courseDetails.map((detail, idx) => (
                    <Box key={idx} sx={{ display: 'flex', justifyContent: 'space-between', py: 1, borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
                      <Typography variant="body2" sx={{ opacity: 0.8 }}>{detail.label}</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{detail.value}</Typography>
                    </Box>
                  ))}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* Features Section */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 2, fontWeight: 700 }}>
            Why Choose Our NATA Coaching?
          </Typography>
          <Typography variant="h6" align="center" color="text.secondary" sx={{ mb: 6 }}>
            Everything you need to crack NATA with a top rank
          </Typography>

          <Grid container spacing={4}>
            {features.map((feature, index) => (
              <Grid item xs={12} sm={6} md={4} key={index}>
                <Card sx={{ height: '100%', textAlign: 'center', p: 3 }}>
                  <Typography variant="h2" sx={{ mb: 2 }}>{feature.icon}</Typography>
                  <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>{feature.title}</Typography>
                  <Typography variant="body2" color="text.secondary">{feature.desc}</Typography>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Syllabus Section */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 6, fontWeight: 700 }}>
            What We Cover
          </Typography>
          <Grid container spacing={4}>
            {[
              { title: 'Mathematics (40 Marks)', topics: ['Coordinate Geometry', 'Matrices & Determinants', 'Calculus', 'Trigonometry', 'Statistics & Probability'] },
              { title: 'General Aptitude (80 Marks)', topics: ['Logical Reasoning', 'Visual Reasoning', 'Spatial Ability', 'Architectural Awareness', 'General Knowledge'] },
              { title: 'Drawing Test (80 Marks)', topics: ['Perspective Drawing', 'Free Hand Sketching', '2D & 3D Compositions', 'Imaginative Drawing', 'Design Problems'] },
            ].map((section, index) => (
              <Grid item xs={12} md={4} key={index}>
                <Card sx={{ height: '100%' }}>
                  <CardContent sx={{ p: 4 }}>
                    <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, color: 'primary.main' }}>
                      {section.title}
                    </Typography>
                    <List dense>
                      {section.topics.map((topic, idx) => (
                        <ListItem key={idx} sx={{ px: 0 }}>
                          <ListItemIcon sx={{ minWidth: 28 }}>
                            <Typography color="success.main">✓</Typography>
                          </ListItemIcon>
                          <ListItemText primary={topic} />
                        </ListItem>
                      ))}
                    </List>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Location Section */}
      <Box sx={{ py: { xs: 6, md: 10 } }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 2, fontWeight: 700 }}>
            NATA Coaching Centers
          </Typography>
          <Typography variant="h6" align="center" color="text.secondary" sx={{ mb: 6 }}>
            Find NATA coaching near you - Available in 90+ cities
          </Typography>

          <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 2 }}>
            {popularCities.map((city, index) => (
              <Chip
                key={index}
                label={`NATA Coaching in ${city.city}`}
                component={Link}
                href={`/coaching/nata-coaching/nata-coaching-centers-in-${city.slug}`}
                clickable
                sx={{
                  fontSize: '0.9rem',
                  py: 2.5,
                  px: 1,
                  '&:hover': { bgcolor: 'primary.main', color: 'white' },
                }}
              />
            ))}
          </Box>

          <Box sx={{ textAlign: 'center', mt: 4 }}>
            <Typography variant="body1" color="text.secondary">
              Don't see your city? We offer online coaching accessible from anywhere!
            </Typography>
          </Box>
        </Container>
      </Box>

      {/* CTA Section */}
      <Box
        sx={{
          py: { xs: 6, md: 10 },
          bgcolor: 'primary.main',
          color: 'white',
          textAlign: 'center',
        }}
      >
        <Container maxWidth="md">
          <Typography variant="h3" component="h2" gutterBottom sx={{ fontWeight: 700 }}>
            Start Your NATA Journey Today
          </Typography>
          <Typography variant="h6" sx={{ mb: 4, opacity: 0.9 }}>
            Limited seats available for the upcoming batch. Enroll now!
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              size="large"
              component={Link}
              href="/apply"
              sx={{ bgcolor: 'white', color: 'primary.main' }}
            >
              Enroll Now
            </Button>
            <Button
              variant="outlined"
              size="large"
              component={Link}
              href="/nata-syllabus"
              sx={{ borderColor: 'white', color: 'white' }}
            >
              View Syllabus
            </Button>
          </Box>
        </Container>
      </Box>
    </Box>
  );
}

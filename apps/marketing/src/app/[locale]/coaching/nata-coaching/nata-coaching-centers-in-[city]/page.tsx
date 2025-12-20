import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
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
  Paper,
} from '@neram/ui';
import Link from 'next/link';
import { locations, getLocationByCity, type Location } from '@neram/database';
import { locales } from '@/i18n';

interface PageProps {
  params: { locale: string; city: string };
}

// Generate static params for all cities
export function generateStaticParams() {
  const params: { locale: string; city: string }[] = [];
  for (const locale of locales) {
    for (const location of locations) {
      params.push({ locale, city: location.city });
    }
  }
  return params;
}

// Generate metadata dynamically
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const location = getLocationByCity(params.city);
  if (!location) return {};

  const title = `NATA Coaching in ${location.cityDisplay} 2025 - Best Classes | Neram Classes`;
  const description = `Join the best NATA coaching in ${location.cityDisplay}, ${location.stateDisplay}. Expert faculty, comprehensive study material, online & offline classes. Enroll now for NATA 2025!`;

  return {
    title,
    description,
    keywords: `NATA coaching ${location.cityDisplay}, NATA classes ${location.cityDisplay}, best NATA coaching in ${location.cityDisplay}, NATA preparation ${location.stateDisplay}`,
    alternates: {
      canonical: `https://neramclasses.com/en/coaching/nata-coaching/nata-coaching-centers-in-${params.city}`,
    },
    openGraph: {
      title,
      description,
      type: 'website',
    },
  };
}

const features = [
  'Expert faculty from IIT/NIT background',
  'Small batch sizes (max 25 students)',
  'Comprehensive study material',
  'Daily drawing practice sessions',
  'Weekly mock tests with analysis',
  '24/7 doubt resolution support',
  'Personal mentoring from toppers',
  'Online & offline modes available',
];

const coursePlans = [
  {
    name: 'Crash Course',
    duration: '3 Months',
    mode: 'Online/Offline',
    highlights: ['Intensive revision', 'Mock test series', 'Drawing practice'],
  },
  {
    name: 'Regular Course',
    duration: '6 Months',
    mode: 'Online/Offline',
    highlights: ['Complete syllabus', 'Concept building', 'Practice sessions'],
  },
  {
    name: 'Premium Course',
    duration: '12 Months',
    mode: 'Online/Offline',
    highlights: ['1-on-1 mentoring', 'Foundation + Advanced', 'All resources'],
  },
];

export default function CityNataCoachingPage({ params: { locale, city } }: PageProps) {
  setRequestLocale(locale);

  const location = getLocationByCity(city);
  if (!location) {
    notFound();
  }

  const isGulf = location.region === 'gulf';

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
          <Chip label={`${location.stateDisplay}`} sx={{ bgcolor: 'white', color: 'primary.main', mb: 2 }} />
          <Typography variant="h1" component="h1" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '2rem', md: '3rem' } }}>
            Best NATA Coaching in {location.cityDisplay}
          </Typography>
          <Typography variant="h5" sx={{ mb: 4, opacity: 0.9 }}>
            Join {location.cityDisplay}'s top-rated NATA coaching institute. Expert faculty, proven results,
            and comprehensive preparation for NATA 2025.
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
        </Container>
      </Box>

      {/* Quick Info */}
      <Box sx={{ py: 4, bgcolor: 'grey.50' }}>
        <Container maxWidth="lg">
          <Grid container spacing={3}>
            {[
              { label: 'Mode', value: isGulf ? 'Online Only' : 'Online & Offline' },
              { label: 'Batch Size', value: '20-25 Students' },
              { label: 'Duration', value: '3-12 Months' },
              { label: 'Success Rate', value: '95%+' },
            ].map((item, index) => (
              <Grid item xs={6} md={3} key={index}>
                <Paper sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">{item.label}</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>{item.value}</Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* About Section */}
      <Box sx={{ py: { xs: 6, md: 10 } }}>
        <Container maxWidth="lg">
          <Grid container spacing={6}>
            <Grid item xs={12} md={6}>
              <Typography variant="h2" component="h2" gutterBottom sx={{ fontWeight: 700 }}>
                Why Choose Neram Classes in {location.cityDisplay}?
              </Typography>
              <Typography variant="body1" color="text.secondary" paragraph>
                Neram Classes has been helping students in {location.cityDisplay} and across {location.stateDisplay} crack NATA
                with top ranks. Our {isGulf ? 'online' : 'online and offline'} coaching programs are designed
                specifically for architecture aspirants.
              </Typography>
              <Typography variant="body1" color="text.secondary" paragraph>
                With a team of experienced faculty from premier architecture colleges and a proven teaching methodology,
                we have consistently produced top rankers in NATA every year.
              </Typography>
              <Box sx={{ mt: 4 }}>
                <Button variant="contained" component={Link} href="/alumni" size="large">
                  See Our Results
                </Button>
              </Box>
            </Grid>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent sx={{ p: 4 }}>
                  <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>
                    What We Offer
                  </Typography>
                  <List>
                    {features.map((feature, idx) => (
                      <ListItem key={idx} sx={{ px: 0 }}>
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          <Typography color="success.main">✓</Typography>
                        </ListItemIcon>
                        <ListItemText primary={feature} />
                      </ListItem>
                    ))}
                  </List>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* Course Plans */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 6 }}>
            NATA Courses in {location.cityDisplay}
          </Typography>
          <Grid container spacing={4}>
            {coursePlans.map((plan, index) => (
              <Grid item xs={12} md={4} key={index}>
                <Card sx={{ height: '100%' }}>
                  <CardContent sx={{ p: 4, textAlign: 'center' }}>
                    <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>{plan.name}</Typography>
                    <Typography variant="h4" color="primary" sx={{ fontWeight: 700, my: 2 }}>{plan.duration}</Typography>
                    <Chip label={plan.mode} size="small" variant="outlined" sx={{ mb: 3 }} />
                    <List dense>
                      {plan.highlights.map((highlight, idx) => (
                        <ListItem key={idx} sx={{ justifyContent: 'center', px: 0 }}>
                          <ListItemIcon sx={{ minWidth: 24 }}>
                            <Typography color="success.main">✓</Typography>
                          </ListItemIcon>
                          <ListItemText primary={highlight} />
                        </ListItem>
                      ))}
                    </List>
                    <Button variant="outlined" fullWidth sx={{ mt: 2 }} component={Link} href="/apply">
                      Enquire Now
                    </Button>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Local SEO Content */}
      <Box sx={{ py: { xs: 6, md: 10 } }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" gutterBottom sx={{ fontWeight: 700, mb: 4 }}>
            About NATA Coaching in {location.cityDisplay}
          </Typography>
          <Grid container spacing={4}>
            <Grid item xs={12} md={8}>
              <Typography variant="body1" paragraph>
                {location.cityDisplay} is home to many aspiring architects who dream of getting into top architecture colleges
                in India. The National Aptitude Test in Architecture (NATA) is the gateway to premier B.Arch programs
                across the country.
              </Typography>
              <Typography variant="body1" paragraph>
                At Neram Classes {location.cityDisplay}, we understand the unique challenges faced by students preparing for NATA.
                Our specialized coaching program covers all three sections - Mathematics, General Aptitude, and Drawing -
                with equal emphasis.
              </Typography>
              <Typography variant="body1" paragraph>
                Our {location.cityDisplay} center {isGulf ? 'offers comprehensive online classes' : 'is equipped with modern facilities'}
                including dedicated drawing studios, regular mock test facilities, and a supportive learning environment.
                Students from {location.cityDisplay} and nearby areas have consistently secured top ranks in NATA through our coaching.
              </Typography>
              <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mt: 4 }}>
                Why {location.cityDisplay} Students Choose Us
              </Typography>
              <List>
                <ListItem sx={{ px: 0 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}><Typography color="primary">•</Typography></ListItemIcon>
                  <ListItemText primary={`Proven track record in ${location.stateDisplay}`} />
                </ListItem>
                <ListItem sx={{ px: 0 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}><Typography color="primary">•</Typography></ListItemIcon>
                  <ListItemText primary="Flexible timings for school/college students" />
                </ListItem>
                <ListItem sx={{ px: 0 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}><Typography color="primary">•</Typography></ListItemIcon>
                  <ListItemText primary={isGulf ? "Classes timed for Gulf timezone" : "Weekend and evening batches available"} />
                </ListItem>
                <ListItem sx={{ px: 0 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}><Typography color="primary">•</Typography></ListItemIcon>
                  <ListItemText primary="Personalized attention with small batch sizes" />
                </ListItem>
              </List>
            </Grid>
            <Grid item xs={12} md={4}>
              <Card sx={{ bgcolor: 'primary.main', color: 'white' }}>
                <CardContent sx={{ p: 4, textAlign: 'center' }}>
                  <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>
                    Start Learning Today!
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 3, opacity: 0.9 }}>
                    Join our next batch in {location.cityDisplay}
                  </Typography>
                  <Button
                    variant="contained"
                    fullWidth
                    size="large"
                    component={Link}
                    href="/apply"
                    sx={{ bgcolor: 'white', color: 'primary.main', mb: 2 }}
                  >
                    Enroll Now
                  </Button>
                  <Button
                    variant="outlined"
                    fullWidth
                    size="large"
                    component={Link}
                    href="/contact"
                    sx={{ borderColor: 'white', color: 'white' }}
                  >
                    Contact Us
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* FAQ Section */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 6 }}>
            Frequently Asked Questions
          </Typography>
          <Grid container spacing={3}>
            {[
              { q: `What is the fee for NATA coaching in ${location.cityDisplay}?`, a: 'Our course fees range from ₹15,000 to ₹75,000 depending on the course duration and mode. Contact us for detailed fee structure and scholarship options.' },
              { q: `Is there an offline center in ${location.cityDisplay}?`, a: isGulf ? `Currently, we offer online classes for students in ${location.cityDisplay}. Our online program is just as effective with live interactive sessions.` : `Yes, we have a fully-equipped center in ${location.cityDisplay} with drawing studios and classroom facilities. We also offer online classes.` },
              { q: 'What is the batch timing?', a: 'We offer multiple batch timings including morning, evening, and weekend batches to accommodate school/college students.' },
              { q: 'Do you provide study materials?', a: 'Yes, comprehensive study materials, practice papers, and online resources are included in the course fee.' },
            ].map((faq, index) => (
              <Grid item xs={12} md={6} key={index}>
                <Card sx={{ height: '100%' }}>
                  <CardContent sx={{ p: 3 }}>
                    <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>{faq.q}</Typography>
                    <Typography variant="body2" color="text.secondary">{faq.a}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
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
            Ready to Start Your Architecture Journey in {location.cityDisplay}?
          </Typography>
          <Typography variant="h6" sx={{ mb: 4, opacity: 0.9 }}>
            Join the best NATA coaching and transform your dream into reality
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
              href="/contact"
              sx={{ borderColor: 'white', color: 'white' }}
            >
              Call Us: +91-XXXX-XXXXXX
            </Button>
          </Box>
        </Container>
      </Box>
    </Box>
  );
}

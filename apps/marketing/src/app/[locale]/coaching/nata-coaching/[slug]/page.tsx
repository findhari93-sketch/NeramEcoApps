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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@neram/ui';
import Link from 'next/link';
import { locations, getLocationByCity, getLocationsByState, getLocationsByRegion, getLocationSeoContent, type Location } from '@neram/database';
import { locales } from '@/i18n';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  generateLocalBusinessSchema,
  generateFAQSchema,
  generateBreadcrumbSchema,
  generateCourseSchema,
} from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';

interface PageProps {
  params: { locale: string; slug: string };
}

const SLUG_PREFIX = 'nata-coaching-centers-in-';

function getCityFromSlug(slug: string): string | null {
  if (!slug.startsWith(SLUG_PREFIX)) return null;
  return slug.slice(SLUG_PREFIX.length);
}

// Generate static params for all cities
export function generateStaticParams() {
  const params: { locale: string; slug: string }[] = [];
  for (const locale of locales) {
    for (const location of locations) {
      params.push({ locale, slug: `${SLUG_PREFIX}${location.city}` });
    }
  }
  return params;
}

// Generate metadata dynamically
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const city = getCityFromSlug(params.slug);
  if (!city) return {};

  const location = getLocationByCity(city);
  if (!location) return {};

  const title = `Best NATA Coaching in ${location.cityDisplay} 2026 - Online & Offline Classes`;
  const description = `Join the #1 NATA coaching in ${location.cityDisplay}, ${location.stateDisplay}. IIT/NIT alumni faculty, comprehensive study material, online & offline classes. 99.9% success rate. Enroll for NATA 2026!`;

  // Only index English pages for high/medium priority cities.
  // Non-English locale pages have no translations (identical English text = duplicate content).
  // Low-priority cities have thin template content.
  const shouldIndex = params.locale === 'en' && location.sitemapPriority !== 'low';

  return {
    title,
    description,
    keywords: `NATA coaching ${location.cityDisplay}, NATA classes ${location.cityDisplay}, best NATA coaching in ${location.cityDisplay}, NATA preparation ${location.stateDisplay}, online NATA coaching ${location.cityDisplay}, architecture entrance coaching ${location.cityDisplay}, NATA coaching near me ${location.cityDisplay}`,
    alternates: buildAlternates(params.locale, `/coaching/nata-coaching/${params.slug}`),
    openGraph: {
      title,
      description,
      type: 'website',
    },
    ...(shouldIndex ? {} : { robots: { index: false, follow: true } }),
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

export default function CityNataCoachingPage({ params: { locale, slug } }: PageProps) {
  setRequestLocale(locale);

  const city = getCityFromSlug(slug);
  if (!city) {
    notFound();
  }

  const location = getLocationByCity(city);
  if (!location) {
    notFound();
  }

  const isGulf = location.region === 'gulf';
  const baseUrl = 'https://neramclasses.com';
  const seoContent = getLocationSeoContent(city);

  const faqs = [
    { question: `What is the fee for NATA coaching in ${location.cityDisplay}?`, answer: 'Our course fees range from ₹15,000 to ₹75,000 depending on the course duration and mode. Contact us for detailed fee structure and scholarship options.' },
    { question: `Is there an offline center in ${location.cityDisplay}?`, answer: isGulf ? `Currently, we offer online classes for students in ${location.cityDisplay}. Our online program is just as effective with live interactive sessions.` : `Yes, we have a fully-equipped center in ${location.cityDisplay} with drawing studios and classroom facilities. We also offer online classes.` },
    { question: 'What is the batch timing?', answer: 'We offer multiple batch timings including morning, evening, and weekend batches to accommodate school/college students.' },
    { question: 'Do you provide study materials?', answer: 'Yes, comprehensive study materials, practice papers, and online resources are included in the course fee.' },
  ];

  return (
    <>
      <JsonLd
        data={generateLocalBusinessSchema({
          city: location.city,
          cityDisplay: location.cityDisplay,
          state: location.state,
          stateDisplay: location.stateDisplay,
          slug: location.city,
        })}
      />
      <JsonLd data={generateFAQSchema(faqs)} />
      <JsonLd
        data={generateBreadcrumbSchema([
          { name: 'Home', url: baseUrl },
          { name: 'Coaching', url: `${baseUrl}/en/coaching` },
          { name: 'NATA Coaching', url: `${baseUrl}/en/coaching/nata-coaching` },
          { name: `NATA Coaching in ${location.cityDisplay}` },
        ])}
      />
      <JsonLd
        data={generateCourseSchema({
          name: `NATA Coaching in ${location.cityDisplay}`,
          description: `Comprehensive NATA preparation course in ${location.cityDisplay}, ${location.stateDisplay}. Expert IIT/NIT alumni faculty, study materials, and mock tests.`,
          url: `${baseUrl}/en/coaching/nata-coaching/${slug}`,
          modes: isGulf ? ['online'] : ['online', 'onsite'],
        })}
      />
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
            Join {location.cityDisplay}&apos;s top-rated NATA coaching institute. Expert faculty, proven results,
            and comprehensive preparation for NATA 2026.
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
              { label: 'Success Rate', value: '99.9%' },
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

      {/* City-Specific Context (unique per city — SEO differentiator) */}
      {seoContent && (
        <Box sx={{ py: { xs: 6, md: 10 } }}>
          <Container maxWidth="lg">
            <Typography variant="h2" component="h2" gutterBottom sx={{ fontWeight: 700, mb: 4 }}>
              NATA Coaching in {location.cityDisplay} — Why Here?
            </Typography>
            <Typography variant="body1" paragraph sx={{ fontSize: '1.1rem', lineHeight: 1.8 }}>
              {seoContent.localContext}
            </Typography>

            {/* City-specific highlights */}
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mt: 4 }}>
              What Makes Our {location.cityDisplay} Program Special
            </Typography>
            <List>
              {seoContent.uniqueHighlights.map((highlight, idx) => (
                <ListItem key={idx} sx={{ px: 0 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <Typography color="success.main">✓</Typography>
                  </ListItemIcon>
                  <ListItemText primary={highlight} />
                </ListItem>
              ))}
            </List>
          </Container>
        </Box>
      )}

      {/* About Section */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: seoContent ? 'grey.50' : 'inherit' }}>
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

      {/* Architecture Colleges Near City (unique per city — SEO differentiator) */}
      {seoContent && seoContent.nearbyColleges.length > 0 && (
        <Box sx={{ py: { xs: 6, md: 10 } }}>
          <Container maxWidth="lg">
            <Typography variant="h2" component="h2" gutterBottom sx={{ fontWeight: 700, mb: 2 }}>
              Top Architecture Colleges Near {location.cityDisplay}
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
              After clearing NATA, students from {location.cityDisplay} can pursue B.Arch at these CoA-approved colleges:
            </Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table>
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: 600 }}>College Name</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {seoContent.nearbyColleges.map((college, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{college.name}</TableCell>
                      <TableCell>
                        <Chip
                          label={college.type === 'government' ? 'Govt.' : college.type === 'deemed' ? 'Deemed' : 'Private'}
                          size="small"
                          color={college.type === 'government' ? 'success' : college.type === 'deemed' ? 'info' : 'default'}
                          variant="outlined"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {/* NATA Exam Centers */}
            {seoContent.examCenters.length > 0 && (
              <Box sx={{ mt: 4 }}>
                <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>
                  NATA Exam Centers Near {location.cityDisplay}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {seoContent.examCenters.map((center, idx) => (
                    <Chip key={idx} label={center} variant="outlined" />
                  ))}
                </Box>
              </Box>
            )}
          </Container>
        </Box>
      )}

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
                {(seoContent?.uniqueHighlights || [
                  `Proven track record in ${location.stateDisplay}`,
                  'Flexible timings for school/college students',
                  isGulf ? 'Classes timed for Gulf timezone' : 'Weekend and evening batches available',
                  'Personalized attention with small batch sizes',
                ]).map((item, idx) => (
                  <ListItem key={idx} sx={{ px: 0 }}>
                    <ListItemIcon sx={{ minWidth: 32 }}><Typography color="primary">•</Typography></ListItemIcon>
                    <ListItemText primary={item} />
                  </ListItem>
                ))}
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
            {faqs.map((faq, index) => (
              <Grid item xs={12} md={6} key={index}>
                <Card sx={{ height: '100%' }}>
                  <CardContent sx={{ p: 3 }}>
                    <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>{faq.question}</Typography>
                    <Typography variant="body2" color="text.secondary">{faq.answer}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Nearby Cities Section */}
      {(() => {
        // Get same-state cities (excluding current city)
        const stateMates = getLocationsByState(location.state).filter(
          (loc) => loc.city !== location.city
        );
        // If same state has fewer than 4 cities, supplement with same-region cities
        const regionMates =
          stateMates.length < 4
            ? getLocationsByRegion(location.region).filter(
                (loc) => loc.city !== location.city && loc.state !== location.state
              )
            : [];
        const nearbyCities = [...stateMates, ...regionMates].slice(0, 8);

        if (nearbyCities.length === 0) return null;

        return (
          <Box sx={{ py: { xs: 6, md: 10 } }}>
            <Container maxWidth="lg">
              <Typography
                variant="h2"
                component="h2"
                align="center"
                gutterBottom
                sx={{ fontWeight: 700, mb: 2 }}
              >
                NATA Coaching in Nearby Cities
              </Typography>
              <Typography
                variant="body1"
                align="center"
                color="text.secondary"
                sx={{ mb: 4 }}
              >
                Explore NATA coaching options in other cities
                {stateMates.length > 0 ? ` across ${location.stateDisplay}` : ` in your region`}
              </Typography>
              <Grid container spacing={2} justifyContent="center">
                {nearbyCities.map((nearby) => (
                  <Grid item xs={6} sm={4} md={3} key={nearby.city}>
                    <Button
                      component={Link}
                      href={`/${locale}/coaching/nata-coaching/nata-coaching-centers-in-${nearby.city}`}
                      variant="outlined"
                      fullWidth
                      sx={{
                        py: 1.5,
                        textTransform: 'none',
                        fontSize: { xs: '0.85rem', sm: '0.9rem' },
                        borderColor: 'divider',
                        color: 'text.primary',
                        '&:hover': {
                          bgcolor: 'primary.main',
                          color: 'white',
                          borderColor: 'primary.main',
                        },
                      }}
                    >
                      {nearby.cityDisplay}
                    </Button>
                  </Grid>
                ))}
              </Grid>
              <Box sx={{ textAlign: 'center', mt: 4 }}>
                <Button
                  component={Link}
                  href={`/${locale}/coaching/nata-coaching`}
                  variant="text"
                  sx={{ textTransform: 'none', fontSize: '1rem' }}
                >
                  View all NATA coaching cities →
                </Button>
              </Box>
            </Container>
          </Box>
        );
      })()}

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
              Call Us: +91-9176137043
            </Button>
          </Box>
        </Container>
      </Box>
    </Box>
    </>
  );
}

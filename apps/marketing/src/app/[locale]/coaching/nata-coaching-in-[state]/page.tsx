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
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Divider,
} from '@neram/ui';
import Link from 'next/link';
import { getLocationsByState, getIndianStates, getStateSeoContent } from '@neram/database';
import { locales } from '@/i18n';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  generateStateHubSchema,
  generateFAQSchema,
  generateBreadcrumbSchema,
  generateCourseSchema,
} from '@/lib/seo/schemas';
import { buildAlternates, buildOgImage } from '@/lib/seo/metadata';

const BASE_URL = 'https://neramclasses.com';

interface PageProps {
  params: { locale: string; state: string };
}

const coursePlans = [
  {
    name: 'Crash Course',
    duration: '3 Months',
    price: '\u20B915,000',
    mode: 'Online / Offline',
    highlights: ['Intensive NATA revision', '50+ mock tests', 'Daily drawing practice', 'Doubt clearing sessions'],
  },
  {
    name: '1-Year Program',
    duration: '12 Months',
    price: '\u20B925,000 - \u20B930,000',
    mode: 'Online / Offline',
    highlights: ['Complete NATA syllabus', 'Daily drawing practice', '100+ mock tests', 'Personal mentor assigned'],
  },
  {
    name: '2-Year Program',
    duration: '24 Months',
    price: '\u20B930,000 - \u20B935,000',
    mode: 'Online / Offline',
    highlights: ['Foundation + Advanced', 'NATA & JEE Paper 2 coverage', '1-on-1 personal mentoring', 'All study materials included'],
  },
];

const comparisonData = [
  { feature: 'Faculty', neram: 'IIT/NIT alumni & practicing architects', others: 'Generic teaching staff' },
  { feature: 'Batch Size', neram: '20-25 students (personalized attention)', others: '50+ students per batch' },
  { feature: 'Mode', neram: 'Online + Offline (both available)', others: 'Offline only in most cases' },
  { feature: 'Success Rate', neram: '99.9% (verified results)', others: 'Unverified claims' },
  { feature: 'Free Study App', neram: 'Yes — Cutoff Calculator, College Predictor, Mock Tests', others: 'No digital tools' },
  { feature: 'Personal Mentoring', neram: '1-on-1 mentoring with toppers', others: 'Group classes only' },
  { feature: 'Drawing Practice', neram: '2+ hours daily supervised practice', others: 'Limited drawing sessions' },
  { feature: 'Google Rating', neram: '4.9 stars (90+ reviews)', others: 'Varies' },
];

// ─── Static Params & Metadata ────────────────────────────────────────────────

export function generateStaticParams() {
  const states = getIndianStates();
  const params: { locale: string; state: string }[] = [];
  for (const locale of locales) {
    for (const state of states) {
      params.push({ locale, state: state.slug });
    }
  }
  return params;
}

export async function generateMetadata({ params: { locale, state } }: PageProps): Promise<Metadata> {
  const states = getIndianStates();
  const stateInfo = states.find((s) => s.slug === state);
  if (!stateInfo) return {};

  const stateDisplay = stateInfo.display;
  const pagePath = `/coaching/nata-coaching-in-${state}`;
  const title = `Best NATA Coaching in ${stateDisplay} 2026 - Online & Offline Classes | Neram Classes`;
  const description = `Join the #1 rated NATA coaching for students in ${stateDisplay}. Expert IIT/NIT faculty, online & offline classes, 99.9% success rate, small batches of 25. Free AI study app with cutoff calculator & college predictor.`;

  return {
    title,
    description,
    keywords: [
      `NATA coaching in ${stateDisplay}`,
      `best NATA coaching ${stateDisplay}`,
      `NATA coaching center ${stateDisplay}`,
      `online NATA coaching ${stateDisplay}`,
      `NATA classes ${stateDisplay}`,
      `NATA preparation ${stateDisplay} 2026`,
      `architecture entrance coaching ${stateDisplay}`,
    ].join(', '),
    alternates: buildAlternates(locale, pagePath),
    openGraph: {
      title: `Best NATA Coaching in ${stateDisplay} 2026`,
      description,
      type: 'website',
      url: `${BASE_URL}${pagePath}`,
      images: [
        {
          url: buildOgImage(`Best NATA Coaching in ${stateDisplay}`, 'Online & Offline Classes', 'coaching'),
          width: 1200,
          height: 630,
          alt: `NATA Coaching in ${stateDisplay} - Neram Classes`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `Best NATA Coaching in ${stateDisplay} 2026`,
      description,
    },
  };
}

// ─── Page Component ──────────────────────────────────────────────────────────

export default function NataCoachingStatePage({ params: { locale, state } }: PageProps) {
  setRequestLocale(locale);

  const states = getIndianStates();
  const stateInfo = states.find((s) => s.slug === state);
  if (!stateInfo) notFound();

  const stateDisplay = stateInfo.display;
  const stateLocations = getLocationsByState(state);
  const seoContent = getStateSeoContent(state);
  const cityNames = stateLocations.map((l) => l.cityDisplay);
  const highPriorityCities = stateLocations.filter((l) => l.sitemapPriority === 'high');
  const otherCities = stateLocations.filter((l) => l.sitemapPriority !== 'high');
  const pagePath = `/coaching/nata-coaching-in-${state}`;

  const faqs = seoContent?.faqs ?? [
    { question: `What is the best NATA coaching in ${stateDisplay}?`, answer: `Neram Classes is the top-rated NATA coaching institute for students in ${stateDisplay} with a 99.9% success rate, IIT/NIT alumni faculty, and both online and offline classes.` },
    { question: `Is online NATA coaching available in ${stateDisplay}?`, answer: `Yes, Neram Classes offers live online NATA coaching for students across ${stateDisplay}. Includes live classes, daily drawing practice, 100+ mock tests, and 24/7 doubt support.` },
    { question: `How much does NATA coaching cost in ${stateDisplay}?`, answer: `NATA coaching fees range from Rs.15,000 for a 3-month crash course to Rs.35,000 for a 2-year program. Scholarships and EMI options are available.` },
  ];

  return (
    <>
      {/* ── JSON-LD Structured Data ── */}
      <JsonLd data={generateStateHubSchema({ display: stateDisplay, cities: cityNames })} />
      <JsonLd data={generateBreadcrumbSchema([
        { name: 'Home', url: BASE_URL },
        { name: 'Coaching', url: `${BASE_URL}/coaching` },
        { name: 'NATA Coaching', url: `${BASE_URL}/coaching/nata-coaching` },
        { name: `NATA Coaching in ${stateDisplay}` },
      ])} />
      <JsonLd data={generateFAQSchema(faqs)} />
      <JsonLd data={generateCourseSchema({
        name: `NATA Coaching in ${stateDisplay} - Online & Offline Classes`,
        description: `Comprehensive NATA preparation course for students in ${stateDisplay}. Expert IIT/NIT faculty, daily drawing practice, mock tests, and personal mentoring.`,
        url: `${BASE_URL}${pagePath}`,
        modes: ['online', 'onsite'],
      })} />

      <Box>
        {/* ═══════════════════════════════════════════════════════════════
            SECTION 1: HERO
            ═══════════════════════════════════════════════════════════════ */}
        <Box
          sx={{
            py: { xs: 8, md: 14 },
            background: 'linear-gradient(135deg, #0d1b2a 0%, #1b2838 40%, #1a237e 100%)',
            color: 'white',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              opacity: 0.05,
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />
          <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
            <Box sx={{ display: 'flex', gap: 1, mb: 3, flexWrap: 'wrap' }}>
              <Chip label="NATA 2026" sx={{ bgcolor: '#FFD700', color: '#0d1b2a', fontWeight: 700, fontSize: '0.8rem' }} />
              <Chip label={stateDisplay} sx={{ bgcolor: 'rgba(255,255,255,0.15)', color: 'white', fontWeight: 600, fontSize: '0.8rem' }} />
              <Chip label={`${stateLocations.length} Cities`} sx={{ bgcolor: 'rgba(255,255,255,0.15)', color: 'white', fontWeight: 600, fontSize: '0.8rem' }} />
            </Box>

            <Typography
              variant="h1"
              component="h1"
              gutterBottom
              sx={{ fontWeight: 800, fontSize: { xs: '2rem', sm: '2.5rem', md: '3.2rem', lg: '3.5rem' }, lineHeight: 1.2, maxWidth: '900px' }}
            >
              Best NATA Coaching in {stateDisplay} 2026
            </Typography>
            <Typography
              variant="h2"
              component="p"
              sx={{ fontSize: { xs: '1.1rem', md: '1.3rem' }, fontWeight: 400, opacity: 0.9, mb: 4, maxWidth: '750px', lineHeight: 1.6 }}
            >
              Join Neram Classes — India&apos;s top-rated NATA coaching with{' '}
              <strong>99.9% success rate</strong>, <strong>IIT/NIT alumni faculty</strong>, and{' '}
              <strong>online + offline classes</strong> across {stateDisplay}.
              {seoContent && ` ${seoContent.description.split('.')[0]}.`}
            </Typography>

            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 4 }}>
              <Button variant="contained" size="large" component={Link} href="/apply"
                sx={{ bgcolor: '#FFD700', color: '#0d1b2a', fontWeight: 700, px: 4, py: 1.5, fontSize: '1rem', '&:hover': { bgcolor: '#FFC107' } }}>
                Enroll Now
              </Button>
              <Button variant="outlined" size="large" component={Link} href="/demo-class"
                sx={{ borderColor: 'rgba(255,255,255,0.5)', color: 'white', px: 4, py: 1.5, fontSize: '1rem', '&:hover': { borderColor: 'white', bgcolor: 'rgba(255,255,255,0.1)' } }}>
                Book Free Demo Class
              </Button>
            </Box>
          </Container>
        </Box>

        {/* ═══════════════════════════════════════════════════════════════
            SECTION 2: TRUST STRIP
            ═══════════════════════════════════════════════════════════════ */}
        <Box sx={{ py: 3, bgcolor: '#f8f9fa', borderBottom: '1px solid', borderColor: 'divider' }}>
          <Container maxWidth="lg">
            <Grid container spacing={2} justifyContent="center" alignItems="center">
              {[
                { label: '10,000+', desc: 'Students Trained' },
                { label: String(stateLocations.length), desc: `Cities in ${stateDisplay}` },
                { label: '4.9\u2605', desc: 'Google Rating' },
                { label: '99.9%', desc: 'Success Rate' },
                { label: '50+', desc: 'Expert Faculty' },
              ].map((stat, idx) => (
                <Grid item xs={6} sm={4} md key={idx}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h5" sx={{ fontWeight: 800, color: 'primary.main' }}>{stat.label}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.8rem' }}>{stat.desc}</Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* ═══════════════════════════════════════════════════════════════
            SECTION 3: STATE DESCRIPTION + HIGHLIGHTS
            ═══════════════════════════════════════════════════════════════ */}
        {seoContent && (
          <Box sx={{ py: { xs: 6, md: 10 } }}>
            <Container maxWidth="lg">
              <Typography variant="h2" component="h2" gutterBottom sx={{ fontWeight: 700, mb: 2 }}>
                NATA Coaching in {stateDisplay} — Overview
              </Typography>
              <Typography variant="body1" paragraph sx={{ fontSize: '1.05rem', lineHeight: 1.8, maxWidth: '900px' }}>
                {seoContent.description}
              </Typography>
              <List dense sx={{ mb: 3 }}>
                {seoContent.keyHighlights.map((highlight, idx) => (
                  <ListItem key={idx} sx={{ px: 0, py: 0.5 }}>
                    <ListItemIcon sx={{ minWidth: 28 }}>
                      <Typography color="success.main" sx={{ fontWeight: 700 }}>{'\u2713'}</Typography>
                    </ListItemIcon>
                    <ListItemText primary={highlight} primaryTypographyProps={{ variant: 'body2' }} />
                  </ListItem>
                ))}
              </List>
            </Container>
          </Box>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            SECTION 4: COMPARISON TABLE
            ═══════════════════════════════════════════════════════════════ */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: seoContent ? 'grey.50' : undefined }}>
          <Container maxWidth="lg">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 2 }}>
              Why Students in {stateDisplay} Choose Neram Classes
            </Typography>
            <Typography variant="body1" align="center" color="text.secondary" sx={{ mb: 6, maxWidth: 700, mx: 'auto' }}>
              A detailed comparison of Neram Classes vs. typical NATA coaching institutes
            </Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ maxWidth: 800, mx: 'auto' }}>
              <Table>
                <TableHead>
                  <TableRow sx={{ bgcolor: 'primary.main' }}>
                    <TableCell sx={{ color: 'white', fontWeight: 700 }}>Feature</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 700 }}>Neram Classes</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 700 }}>Others</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {comparisonData.map((row, idx) => (
                    <TableRow key={idx} sx={{ '&:nth-of-type(odd)': { bgcolor: 'grey.50' } }}>
                      <TableCell sx={{ fontWeight: 600 }}>{row.feature}</TableCell>
                      <TableCell sx={{ color: 'success.main', fontWeight: 500 }}>{row.neram}</TableCell>
                      <TableCell sx={{ color: 'text.secondary' }}>{row.others}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Container>
        </Box>

        {/* ═══════════════════════════════════════════════════════════════
            SECTION 5: CITY GRID
            ═══════════════════════════════════════════════════════════════ */}
        <Box sx={{ py: { xs: 6, md: 10 } }}>
          <Container maxWidth="lg">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 2 }}>
              NATA Coaching Centers Across {stateDisplay}
            </Typography>
            <Typography variant="body1" align="center" color="text.secondary" sx={{ mb: 6, maxWidth: 700, mx: 'auto' }}>
              Neram Classes offers online and offline NATA coaching in {stateLocations.length} cities across {stateDisplay}. Click on a city to view detailed information.
            </Typography>

            {highPriorityCities.length > 0 && (
              <>
                <Typography variant="overline" sx={{ fontFamily: '"SFMono-Regular", monospace', fontSize: '11px', fontWeight: 700, letterSpacing: '0.2em', color: 'primary.main', display: 'block', textAlign: 'center', mb: 1 }}>
                  MAJOR COACHING CENTERS
                </Typography>
                <Grid container spacing={3} sx={{ mb: 6 }}>
                  {highPriorityCities.map((loc) => (
                    <Grid item xs={6} sm={4} md={3} key={loc.city}>
                      <Card
                        component={Link}
                        href={`/coaching/nata-coaching/nata-coaching-centers-in-${loc.city}`}
                        sx={{
                          textDecoration: 'none', display: 'block', p: 2, textAlign: 'center',
                          border: '2px solid', borderColor: 'primary.main', bgcolor: 'primary.50',
                          transition: 'all 0.2s', '&:hover': { transform: 'translateY(-4px)', boxShadow: 4 },
                        }}
                      >
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'text.primary' }}>{loc.cityDisplay}</Typography>
                        <Chip label="Major Center" size="small" color="primary" sx={{ mt: 0.5, fontSize: '0.65rem', height: 20 }} />
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              </>
            )}

            {otherCities.length > 0 && (
              <>
                <Typography variant="overline" sx={{ fontFamily: '"SFMono-Regular", monospace', fontSize: '11px', fontWeight: 700, letterSpacing: '0.2em', color: 'text.secondary', display: 'block', textAlign: 'center', mb: 1 }}>
                  MORE CITIES
                </Typography>
                <Grid container spacing={2}>
                  {otherCities.map((loc) => (
                    <Grid item xs={6} sm={4} md={3} key={loc.city}>
                      <Card
                        component={Link}
                        href={`/coaching/nata-coaching/nata-coaching-centers-in-${loc.city}`}
                        sx={{
                          textDecoration: 'none', display: 'block', p: 2, textAlign: 'center',
                          border: '1px solid', borderColor: 'divider',
                          transition: 'all 0.2s', '&:hover': { transform: 'translateY(-4px)', boxShadow: 4, borderColor: 'primary.main' },
                        }}
                      >
                        <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.primary' }}>{loc.cityDisplay}</Typography>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              </>
            )}
          </Container>
        </Box>

        {/* ═══════════════════════════════════════════════════════════════
            SECTION 6: TOP ARCHITECTURE COLLEGES
            ═══════════════════════════════════════════════════════════════ */}
        {seoContent && seoContent.topColleges.length > 0 && (
          <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
            <Container maxWidth="lg">
              <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 2 }}>
                Top Architecture Colleges in {stateDisplay}
              </Typography>
              <Typography variant="body1" align="center" color="text.secondary" sx={{ mb: 6, maxWidth: 700, mx: 'auto' }}>
                CoA-approved architecture colleges accepting NATA scores in {stateDisplay}
              </Typography>
              <TableContainer component={Paper} variant="outlined" sx={{ maxWidth: 900, mx: 'auto' }}>
                <Table>
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'grey.100' }}>
                      <TableCell sx={{ fontWeight: 700 }}>College Name</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>City</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {seoContent.topColleges.map((college, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{college.name}</TableCell>
                        <TableCell>{college.city}</TableCell>
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
            </Container>
          </Box>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            SECTION 7: ONLINE COACHING
            ═══════════════════════════════════════════════════════════════ */}
        <Box sx={{ py: { xs: 6, md: 10 } }}>
          <Container maxWidth="lg">
            <Typography variant="h2" component="h2" gutterBottom sx={{ fontWeight: 700, mb: 2 }}>
              Online NATA Coaching in {stateDisplay}
            </Typography>
            <Typography variant="body1" paragraph sx={{ fontSize: '1.05rem', lineHeight: 1.8, maxWidth: '900px' }}>
              Can&apos;t attend offline classes? Neram Classes offers comprehensive online NATA coaching for students
              across {stateDisplay}. Our online program includes live interactive classes with IIT/NIT alumni faculty,
              daily drawing practice via screen sharing, 100+ mock tests with detailed analysis, and 24/7 doubt
              support via WhatsApp. Students can switch between online and offline modes anytime.
            </Typography>
            <List dense sx={{ mb: 3 }}>
              {[
                'Live interactive classes — not pre-recorded videos',
                'Daily 2+ hours supervised drawing practice',
                'Small batches of max 25 students for personal attention',
                'Free AI study app with cutoff calculator & college predictor',
                'Switch between online and offline modes anytime',
              ].map((item, idx) => (
                <ListItem key={idx} sx={{ px: 0, py: 0.5 }}>
                  <ListItemIcon sx={{ minWidth: 28 }}>
                    <Typography color="success.main" sx={{ fontWeight: 700 }}>{'\u2713'}</Typography>
                  </ListItemIcon>
                  <ListItemText primary={item} primaryTypographyProps={{ variant: 'body2' }} />
                </ListItem>
              ))}
            </List>
            <Button variant="outlined" component={Link} href="/best-nata-coaching-online" sx={{ textTransform: 'none' }}>
              Learn more about online NATA coaching {'\u2192'}
            </Button>
          </Container>
        </Box>

        {/* ═══════════════════════════════════════════════════════════════
            SECTION 8: COURSE PLANS
            ═══════════════════════════════════════════════════════════════ */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="lg">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 2 }}>
              NATA Coaching Courses for {stateDisplay} Students
            </Typography>
            <Typography variant="body1" align="center" color="text.secondary" sx={{ mb: 6 }}>
              Choose the right plan for your NATA 2026 preparation
            </Typography>
            <Grid container spacing={4} justifyContent="center">
              {coursePlans.map((plan, index) => (
                <Grid item xs={12} sm={6} md={4} key={index}>
                  <Card sx={{ height: '100%', textAlign: 'center', border: index === 2 ? '2px solid' : '1px solid', borderColor: index === 2 ? 'primary.main' : 'divider', position: 'relative' }}>
                    {index === 2 && (
                      <Box sx={{ bgcolor: 'primary.main', color: 'white', py: 0.5, fontSize: '0.75rem', fontWeight: 700 }}>MOST POPULAR</Box>
                    )}
                    <CardContent sx={{ p: 4 }}>
                      <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>{plan.name}</Typography>
                      <Typography variant="h3" color="primary" sx={{ fontWeight: 800, my: 2 }}>{plan.price}</Typography>
                      <Typography variant="body2" color="text.secondary" gutterBottom>{plan.duration} | {plan.mode}</Typography>
                      <Divider sx={{ my: 2 }} />
                      <List dense>
                        {plan.highlights.map((h, idx) => (
                          <ListItem key={idx} sx={{ justifyContent: 'center', px: 0, py: 0.25 }}>
                            <ListItemIcon sx={{ minWidth: 24 }}>
                              <Typography color="success.main" sx={{ fontSize: '0.85rem' }}>{'\u2713'}</Typography>
                            </ListItemIcon>
                            <ListItemText primary={h} primaryTypographyProps={{ variant: 'body2' }} />
                          </ListItem>
                        ))}
                      </List>
                      <Button variant={index === 2 ? 'contained' : 'outlined'} fullWidth sx={{ mt: 3 }} component={Link} href="/apply">
                        Enroll Now
                      </Button>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* ═══════════════════════════════════════════════════════════════
            SECTION 9: FAQ ACCORDION
            ═══════════════════════════════════════════════════════════════ */}
        <Box sx={{ py: { xs: 6, md: 10 } }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 2 }}>
              Frequently Asked Questions About NATA Coaching in {stateDisplay}
            </Typography>
            <Typography variant="body1" align="center" color="text.secondary" sx={{ mb: 6 }}>
              Everything you need to know about NATA coaching in {stateDisplay}
            </Typography>
            {faqs.map((faq, index) => (
              <Accordion
                key={index}
                disableGutters
                sx={{ mb: 1, borderRadius: 1, overflow: 'hidden', '&:before': { display: 'none' }, boxShadow: 'none', border: '1px solid', borderColor: 'divider' }}
              >
                <AccordionSummary expandIcon={<Typography sx={{ fontSize: '1.5rem', fontWeight: 600 }}>+</Typography>} sx={{ bgcolor: 'white', '&:hover': { bgcolor: 'grey.50' } }}>
                  <Typography sx={{ fontWeight: 600, fontSize: { xs: '0.9rem', md: '1rem' } }}>{faq.question}</Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ bgcolor: 'white', pt: 0 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.8 }}>{faq.answer}</Typography>
                </AccordionDetails>
              </Accordion>
            ))}
          </Container>
        </Box>

        {/* ═══════════════════════════════════════════════════════════════
            SECTION 10: INTERNAL LINKS
            ═══════════════════════════════════════════════════════════════ */}
        <Box sx={{ py: { xs: 4, md: 6 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="lg">
            <Typography variant="h3" component="h2" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '1.3rem', md: '1.5rem' }, mb: 3 }}>
              Explore More
            </Typography>
            <Grid container spacing={2}>
              {[
                { label: 'Best NATA Coaching in India', href: '/coaching/best-nata-coaching-india' },
                { label: 'Online NATA Coaching', href: '/best-nata-coaching-online' },
                { label: 'NATA 2026 Complete Guide', href: '/nata-2026' },
                { label: 'Free Demo Class', href: '/demo-class' },
                { label: 'NATA Cutoff Calculator', href: '/tools/cutoff-calculator' },
                { label: 'College Predictor', href: '/tools/college-predictor' },
              ].map((link, idx) => (
                <Grid item xs={6} sm={4} md={2} key={idx}>
                  <Button component={Link} href={link.href} variant="text" size="small" sx={{ textTransform: 'none', fontSize: '0.85rem' }}>
                    {link.label} {'\u2192'}
                  </Button>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* ═══════════════════════════════════════════════════════════════
            SECTION 11: CTA FOOTER
            ═══════════════════════════════════════════════════════════════ */}
        <Box
          sx={{ py: { xs: 8, md: 12 }, background: 'linear-gradient(135deg, #1a237e 0%, #0d47a1 100%)', color: 'white', textAlign: 'center' }}
        >
          <Container maxWidth="md">
            <Typography variant="h3" component="h2" gutterBottom sx={{ fontWeight: 800, fontSize: { xs: '1.75rem', md: '2.5rem' } }}>
              Start Your Architecture Journey in {stateDisplay} Today
            </Typography>
            <Typography variant="h6" sx={{ mb: 4, opacity: 0.9, fontWeight: 400 }}>
              Limited seats available for NATA 2026 batches. Enroll now and join 10,000+ successful students!
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap', mb: 4 }}>
              <Button variant="contained" size="large" component={Link} href="/apply"
                sx={{ bgcolor: '#FFD700', color: '#0d1b2a', fontWeight: 700, px: 5, py: 1.5, fontSize: '1.05rem', '&:hover': { bgcolor: '#FFC107' } }}>
                Enroll Now
              </Button>
              <Button variant="outlined" size="large" component="a" href="tel:+919176137043"
                sx={{ borderColor: 'white', color: 'white', px: 4, py: 1.5, fontSize: '1.05rem' }}>
                Call: +91-9176137043
              </Button>
              <Button variant="outlined" size="large" component="a"
                href={`https://wa.me/919176137043?text=Hi%2C%20I%20want%20to%20know%20about%20NATA%20coaching%20in%20${encodeURIComponent(stateDisplay)}`}
                target="_blank" rel="noopener noreferrer"
                sx={{ borderColor: 'white', color: 'white', px: 4, py: 1.5, fontSize: '1.05rem' }}>
                WhatsApp Us
              </Button>
            </Box>
            <Typography variant="body2" sx={{ opacity: 0.7 }}>
              Online classes available across all cities in {stateDisplay} | EMI and scholarship options available
            </Typography>
          </Container>
        </Box>
      </Box>
    </>
  );
}

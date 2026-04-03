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
import { locations, getLocationSeoContent, type Location } from '@neram/database';
import { locales } from '@/i18n';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  generateTNHubOrganizationSchema,
  generateCourseSchema,
  generateFAQSchema,
  generateBreadcrumbSchema,
  generateLocalBusinessSchema,
} from '@/lib/seo/schemas';
import { buildAlternates, buildOgImage } from '@/lib/seo/metadata';


// ─── All 38 Tamil Nadu Districts ────────────────────────────────────────────

const TN_DISTRICTS = [
  'Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem',
  'Tirunelveli', 'Erode', 'Vellore', 'Thoothukudi', 'Dindigul',
  'Thanjavur', 'Tiruppur', 'Kanchipuram', 'Nagapattinam', 'Sivaganga',
  'Karur', 'Namakkal', 'Cuddalore', 'Tiruvallur', 'Viluppuram',
  'Tiruvannamalai', 'Dharmapuri', 'Krishnagiri', 'Perambalur', 'Ariyalur',
  'Pudukkottai', 'Ramanathapuram', 'Virudhunagar', 'Theni', 'Tenkasi',
  'Kallakurichi', 'Chengalpattu', 'Tirupattur', 'Ranipet', 'Mayiladuthurai',
  'Nilgiris', 'Thiruvarur', 'Kanyakumari',
];

// District-to-slug mapping (maps display name to location slug)
const DISTRICT_SLUG_MAP: Record<string, string> = {
  'Chennai': 'chennai',
  'Coimbatore': 'coimbatore',
  'Madurai': 'madurai',
  'Tiruchirappalli': 'trichy',
  'Salem': 'salem',
  'Tirunelveli': 'tirunelveli',
  'Erode': 'erode',
  'Vellore': 'vellore',
  'Thoothukudi': 'thoothukudi',
  'Dindigul': 'dindigul',
  'Thanjavur': 'thanjavur',
  'Tiruppur': 'tiruppur',
  'Kanchipuram': 'kanchipuram',
  'Nagapattinam': 'nagapattinam',
  'Sivaganga': 'sivaganga',
  'Karur': 'karur',
  'Namakkal': 'namakkal',
  'Cuddalore': 'cuddalore',
  'Tiruvallur': 'tiruvallur',
  'Viluppuram': 'viluppuram',
  'Tiruvannamalai': 'tiruvannamalai',
  'Dharmapuri': 'dharmapuri',
  'Krishnagiri': 'krishnagiri',
  'Perambalur': 'perambalur',
  'Ariyalur': 'ariyalur',
  'Pudukkottai': 'pudukkottai',
  'Ramanathapuram': 'ramanathapuram',
  'Virudhunagar': 'virudhunagar',
  'Theni': 'theni',
  'Tenkasi': 'tenkasi',
  'Kallakurichi': 'kallakurichi',
  'Chengalpattu': 'chengalpattu',
  'Tirupattur': 'tirupattur',
  'Ranipet': 'ranipet',
  'Mayiladuthurai': 'mayiladuthurai',
  'Nilgiris': 'udhagamandalam',
  'Thiruvarur': 'thiruvarur',
  'Kanyakumari': 'nagercoil',
};

// Tier 1 cities (full content sections)
const TIER1_CITIES = ['chennai', 'coimbatore', 'madurai', 'trichy'];

// Tier 2 cities (medium content sections)
const TIER2_CITIES = ['salem', 'tirunelveli', 'erode', 'vellore', 'thoothukudi', 'thanjavur', 'tiruppur', 'dindigul'];

// Geographic zones for district grid
const DISTRICT_ZONES: Record<string, string[]> = {
  'Chennai & Northern TN': ['Chennai', 'Chengalpattu', 'Tiruvallur', 'Kanchipuram', 'Ranipet', 'Vellore', 'Tirupattur', 'Tiruvannamalai', 'Viluppuram'],
  'Western TN': ['Coimbatore', 'Tiruppur', 'Erode', 'Salem', 'Namakkal', 'Dharmapuri', 'Krishnagiri', 'Nilgiris', 'Karur'],
  'Central & Delta TN': ['Tiruchirappalli', 'Thanjavur', 'Nagapattinam', 'Mayiladuthurai', 'Thiruvarur', 'Pudukkottai', 'Perambalur', 'Ariyalur', 'Cuddalore', 'Kallakurichi'],
  'Southern TN': ['Madurai', 'Dindigul', 'Theni', 'Sivaganga', 'Virudhunagar', 'Ramanathapuram', 'Tirunelveli', 'Thoothukudi', 'Tenkasi', 'Kanyakumari'],
};

// ─── Page Configuration ─────────────────────────────────────────────────────

const PAGE_PATH = '/coaching/nata-coaching-center-in-tamil-nadu';
const BASE_URL = 'https://neramclasses.com';

const faqs = [
  {
    question: 'What is the best NATA coaching center in Tamil Nadu?',
    answer: 'Neram Classes is rated 4.9 stars on Google with 90+ reviews, making it the top-rated NATA coaching center in Tamil Nadu. With IIT/NIT alumni faculty, 99.9% success rate, and both online & offline classes across all 38 districts, Neram Classes offers the most comprehensive NATA preparation in the state.',
  },
  {
    question: 'How much does NATA coaching cost in Tamil Nadu?',
    answer: 'NATA coaching fees at Neram Classes in Tamil Nadu range from ₹15,000 for a 3-month crash course to ₹35,000 for a 2-year program. 1-year program from ₹25,000. Scholarships and EMI options available. Contact us for the latest fee structure.',
  },
  {
    question: 'Is online NATA coaching effective?',
    answer: 'Yes, our online NATA coaching maintains the same 99.9% success rate as offline classes. Live interactive sessions, daily drawing practice via screen sharing, recorded lectures for revision, and personal mentoring make online coaching equally effective for students across Tamil Nadu.',
  },
  {
    question: 'Which city in Tamil Nadu is best for NATA preparation?',
    answer: 'Chennai, Coimbatore, Madurai, and Trichy are the top cities for NATA preparation in Tamil Nadu due to their proximity to architecture colleges and exam centers. However, with Neram Classes\' online coaching, students from any of the 38 Tamil Nadu districts can access the same quality of preparation.',
  },
  {
    question: 'Does Neram Classes have centers in all Tamil Nadu districts?',
    answer: 'Neram Classes offers online NATA coaching accessible from all 38 Tamil Nadu districts and has physical coaching centers in major cities including Coimbatore. Our online program includes live classes, drawing practice, mock tests, and personal mentoring — the same comprehensive preparation regardless of location.',
  },
  {
    question: 'What is the success rate of Neram Classes in Tamil Nadu?',
    answer: 'Neram Classes has a 99.9% success rate in NATA across Tamil Nadu. Our students consistently secure top ranks and gain admission to premier architecture colleges including Anna University Chennai, NIT Trichy, and other CoA-approved institutions across the state.',
  },
  {
    question: 'Can I join NATA coaching after 12th in Tamil Nadu?',
    answer: 'Yes, students who have completed or are appearing for 12th standard (with Mathematics as a subject) can join NATA coaching. Neram Classes offers crash courses (3 months), 1-year programs (12 months), and 2-year programs (24 months) to suit different preparation timelines.',
  },
  {
    question: 'What are the top architecture colleges in Tamil Nadu?',
    answer: 'Top architecture colleges in Tamil Nadu include Anna University (Chennai), NIT Trichy, SRM University, VIT Vellore, PSG College of Technology (Coimbatore), Thiagarajar College of Engineering (Madurai), SASTRA University (Thanjavur), and Kumaraguru College of Technology (Coimbatore). All accept NATA scores for B.Arch admission.',
  },
  {
    question: 'Is there a free demo class available for NATA coaching?',
    answer: 'Yes, Neram Classes offers a free demo class for students across Tamil Nadu. You can attend an online or offline demo session to experience our teaching methodology, interact with faculty, and understand the NATA exam pattern before enrolling.',
  },
  {
    question: 'How do I choose between online and offline NATA coaching?',
    answer: 'Choose offline coaching if you prefer in-person interaction, supervised drawing practice, and live feedback. Choose online coaching if you need schedule flexibility, live in a district without a physical center, or want to learn from home. Both modes at Neram Classes cover the same curriculum and achieve the same results.',
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

const coursePlans = [
  {
    name: 'Crash Course',
    duration: '3 Months',
    price: '₹15,000',
    mode: 'Online / Offline',
    highlights: ['Intensive NATA revision', '50+ mock tests', 'Daily drawing practice', 'Doubt clearing sessions'],
  },
  {
    name: '1-Year Program',
    duration: '12 Months',
    price: '₹25,000 - ₹30,000',
    mode: 'Online / Offline',
    highlights: ['Complete NATA syllabus', 'Daily drawing practice', '100+ mock tests', 'Personal mentor assigned'],
  },
  {
    name: '2-Year Program',
    duration: '24 Months',
    price: '₹30,000 - ₹35,000',
    mode: 'Online / Offline',
    highlights: ['Foundation + Advanced', 'NATA & JEE Paper 2 coverage', '1-on-1 personal mentoring', 'All study materials included'],
  },
];

// ─── Static Params & Metadata ────────────────────────────────────────────────

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const title = 'Best NATA Coaching Center in Tamil Nadu 2026 — Online & Offline Classes in All 38 Districts';
  const description = 'Join the #1 rated NATA coaching center in Tamil Nadu. Expert IIT/NIT faculty, online & offline classes across Chennai, Coimbatore, Madurai, Trichy & all 38 districts. 4.9★ Google rating, 99.9% success rate.';

  return {
    title,
    description,
    keywords: [
      'NATA coaching center in Tamil Nadu',
      'NATA coaching center in Coimbatore',
      'NATA coaching center in Chennai',
      'NATA coaching center in Madurai',
      'NATA coaching center in Trichy',
      'NATA coaching center in Salem',
      'NATA coaching center in Tirunelveli',
      'best NATA coaching Tamil Nadu',
      'NATA classes Tamil Nadu',
      'NATA preparation Tamil Nadu 2026',
      'online NATA coaching Tamil Nadu',
      'architecture entrance coaching Tamil Nadu',
      ...TN_DISTRICTS.map((d) => `NATA coaching center in ${d}`),
    ].join(', '),
    alternates: buildAlternates(locale, PAGE_PATH),
    openGraph: {
      title: 'Best NATA Coaching Center in Tamil Nadu 2026',
      description,
      type: 'website',
      url: `${BASE_URL}${PAGE_PATH}`,
      images: [
        {
          url: buildOgImage('Best NATA Coaching in Tamil Nadu', 'All 38 Districts — Online & Offline', 'coaching'),
          width: 1200,
          height: 630,
          alt: 'NATA Coaching Center in Tamil Nadu - Neram Classes',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Best NATA Coaching Center in Tamil Nadu 2026',
      description,
    },
  };
}

// ─── Page Component ──────────────────────────────────────────────────────────

interface PageProps {
  params: { locale: string };
}

export default function NataCoachingTamilNaduPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);

  // Get TN locations from data
  const tnLocations = locations.filter((l) => l.state === 'tamil-nadu');

  return (
    <>
      {/* ── JSON-LD Structured Data ── */}
      <JsonLd data={generateTNHubOrganizationSchema(TN_DISTRICTS)} />
      <JsonLd data={generateBreadcrumbSchema([
        { name: 'Home', url: BASE_URL },
        { name: 'Coaching', url: `${BASE_URL}/coaching` },
        { name: 'NATA Coaching', url: `${BASE_URL}/coaching/nata-coaching` },
        { name: 'NATA Coaching Center in Tamil Nadu' },
      ])} />
      <JsonLd data={generateFAQSchema(faqs)} />
      <JsonLd data={generateCourseSchema({
        name: 'NATA Coaching in Tamil Nadu - Online & Offline Classes',
        description: 'Comprehensive NATA preparation course available across all 38 Tamil Nadu districts. Expert IIT/NIT faculty, daily drawing practice, mock tests, and personal mentoring.',
        url: `${BASE_URL}${PAGE_PATH}`,
        modes: ['online', 'onsite'],
      })} />
      {/* LocalBusiness for Tier 1 cities */}
      {TIER1_CITIES.map((citySlug) => {
        const loc = tnLocations.find((l) => l.city === citySlug);
        if (!loc) return null;
        return (
          <JsonLd
            key={citySlug}
            data={generateLocalBusinessSchema({
              city: loc.city,
              cityDisplay: loc.cityDisplay,
              state: loc.state,
              stateDisplay: loc.stateDisplay,
              slug: loc.city,
            })}
          />
        );
      })}

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
          {/* Subtle blueprint grid background */}
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
              <Chip label="Tamil Nadu" sx={{ bgcolor: 'rgba(255,255,255,0.15)', color: 'white', fontWeight: 600, fontSize: '0.8rem' }} />
              <Chip label="All 38 Districts" sx={{ bgcolor: 'rgba(255,255,255,0.15)', color: 'white', fontWeight: 600, fontSize: '0.8rem' }} />
            </Box>

            <Typography
              variant="h1"
              component="h1"
              gutterBottom
              sx={{
                fontWeight: 800,
                fontSize: { xs: '2rem', sm: '2.5rem', md: '3.2rem', lg: '3.5rem' },
                lineHeight: 1.2,
                maxWidth: '900px',
              }}
            >
              Best NATA Coaching Center in Tamil Nadu 2026
            </Typography>
            <Typography
              variant="h2"
              component="p"
              sx={{
                fontSize: { xs: '1.1rem', md: '1.3rem' },
                fontWeight: 400,
                opacity: 0.9,
                mb: 4,
                maxWidth: '750px',
                lineHeight: 1.6,
              }}
            >
              Join Neram Classes — the #1 rated NATA coaching institute in Tamil Nadu with{' '}
              <strong>4.9 Google rating</strong>, <strong>90+ reviews</strong>, and{' '}
              <strong>99.9% success rate</strong>. Online & offline classes across Chennai, Coimbatore,
              Madurai, Trichy, and all 38 districts.
            </Typography>

            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 4 }}>
              <Button
                variant="contained"
                size="large"
                component={Link}
                href="/apply"
                sx={{
                  bgcolor: '#FFD700',
                  color: '#0d1b2a',
                  fontWeight: 700,
                  px: 4,
                  py: 1.5,
                  fontSize: '1rem',
                  '&:hover': { bgcolor: '#FFC107' },
                }}
              >
                Enroll Now
              </Button>
              <Button
                variant="outlined"
                size="large"
                component={Link}
                href="/demo-class"
                sx={{
                  borderColor: 'rgba(255,255,255,0.5)',
                  color: 'white',
                  px: 4,
                  py: 1.5,
                  fontSize: '1rem',
                  '&:hover': { borderColor: 'white', bgcolor: 'rgba(255,255,255,0.1)' },
                }}
              >
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
                { label: '5,000+', desc: 'Students Trained' },
                { label: '38', desc: 'TN Districts Served' },
                { label: '4.9★', desc: 'Google Rating' },
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
            SECTION 3: COMPARISON TABLE — Why Neram
            ═══════════════════════════════════════════════════════════════ */}
        <Box sx={{ py: { xs: 6, md: 10 } }}>
          <Container maxWidth="lg">
            <Typography
              variant="h2"
              component="h2"
              align="center"
              gutterBottom
              sx={{ fontWeight: 700, mb: 2 }}
            >
              Why Students Choose Neram Over Other NATA Coaching Centers in Tamil Nadu
            </Typography>
            <Typography variant="body1" align="center" color="text.secondary" sx={{ mb: 6, maxWidth: 700, mx: 'auto' }}>
              A detailed comparison of what Neram Classes offers vs. typical NATA coaching institutes in Tamil Nadu
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
            SECTION 4: TIER 1 — Major City Sections
            ═══════════════════════════════════════════════════════════════ */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="lg">
            <Typography
              variant="overline"
              sx={{
                fontFamily: '"SFMono-Regular", "Cascadia Code", monospace',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.2em',
                color: 'primary.main',
                display: 'block',
                textAlign: 'center',
                mb: 1,
              }}
            >
              MAJOR COACHING CENTERS
            </Typography>
            <Typography
              variant="h2"
              component="h2"
              align="center"
              gutterBottom
              sx={{ fontWeight: 700, mb: 6 }}
            >
              NATA Coaching in Tamil Nadu&apos;s Top Cities
            </Typography>

            {TIER1_CITIES.map((citySlug) => {
              const loc = tnLocations.find((l) => l.city === citySlug);
              if (!loc) return null;
              const seoContent = getLocationSeoContent(citySlug);
              const displayName = citySlug === 'trichy' ? 'Tiruchirappalli (Trichy)' : loc.cityDisplay;

              return (
                <Box key={citySlug} sx={{ mb: 8 }}>
                  <Typography
                    variant="h2"
                    component="h2"
                    gutterBottom
                    sx={{ fontWeight: 700, fontSize: { xs: '1.75rem', md: '2.25rem' } }}
                  >
                    NATA Coaching Center in {displayName}
                  </Typography>

                  {seoContent && (
                    <>
                      <Typography variant="body1" paragraph sx={{ fontSize: '1.05rem', lineHeight: 1.8, maxWidth: '900px' }}>
                        {seoContent.localContext}
                      </Typography>

                      {/* Unique highlights */}
                      <List dense sx={{ mb: 3 }}>
                        {seoContent.uniqueHighlights.map((highlight, idx) => (
                          <ListItem key={idx} sx={{ px: 0, py: 0.5 }}>
                            <ListItemIcon sx={{ minWidth: 28 }}>
                              <Typography color="success.main" sx={{ fontWeight: 700 }}>✓</Typography>
                            </ListItemIcon>
                            <ListItemText primary={highlight} primaryTypographyProps={{ variant: 'body2' }} />
                          </ListItem>
                        ))}
                      </List>

                      {/* Nearby colleges table */}
                      {seoContent.nearbyColleges.length > 0 && (
                        <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
                          <Table size="small">
                            <TableHead>
                              <TableRow sx={{ bgcolor: 'grey.50' }}>
                                <TableCell sx={{ fontWeight: 600, fontSize: '0.85rem' }}>Architecture College Near {displayName}</TableCell>
                                <TableCell sx={{ fontWeight: 600, fontSize: '0.85rem' }}>Type</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {seoContent.nearbyColleges.map((college, idx) => (
                                <TableRow key={idx}>
                                  <TableCell sx={{ fontSize: '0.85rem' }}>{college.name}</TableCell>
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
                      )}
                    </>
                  )}

                  <Button
                    variant="outlined"
                    component={Link}
                    href={`/coaching/nata-coaching/nata-coaching-centers-in-${citySlug}`}
                    sx={{ textTransform: 'none' }}
                  >
                    View full details for {displayName} →
                  </Button>
                  <Divider sx={{ mt: 6 }} />
                </Box>
              );
            })}
          </Container>
        </Box>

        {/* ═══════════════════════════════════════════════════════════════
            SECTION 5: TIER 2 — Secondary Cities
            ═══════════════════════════════════════════════════════════════ */}
        <Box sx={{ py: { xs: 6, md: 10 } }}>
          <Container maxWidth="lg">
            <Typography
              variant="overline"
              sx={{
                fontFamily: '"SFMono-Regular", "Cascadia Code", monospace',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.2em',
                color: 'primary.main',
                display: 'block',
                textAlign: 'center',
                mb: 1,
              }}
            >
              REGIONAL COACHING HUBS
            </Typography>
            <Typography
              variant="h2"
              component="h2"
              align="center"
              gutterBottom
              sx={{ fontWeight: 700, mb: 6 }}
            >
              NATA Coaching in More Tamil Nadu Cities
            </Typography>

            <Grid container spacing={4}>
              {TIER2_CITIES.map((citySlug) => {
                const loc = tnLocations.find((l) => l.city === citySlug);
                if (!loc) return null;
                const seoContent = getLocationSeoContent(citySlug);

                return (
                  <Grid item xs={12} md={6} key={citySlug}>
                    <Card sx={{ height: '100%' }}>
                      <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                        <Typography
                          variant="h3"
                          component="h2"
                          gutterBottom
                          sx={{ fontWeight: 700, fontSize: { xs: '1.4rem', md: '1.6rem' } }}
                        >
                          NATA Coaching Center in {loc.cityDisplay}
                        </Typography>

                        {seoContent ? (
                          <>
                            <Typography variant="body2" color="text.secondary" paragraph sx={{ lineHeight: 1.7 }}>
                              {seoContent.localContext.slice(0, 250)}...
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                              {seoContent.examCenters.map((center, idx) => (
                                <Chip key={idx} label={`Exam center: ${center}`} size="small" variant="outlined" />
                              ))}
                            </Box>
                          </>
                        ) : (
                          <Typography variant="body2" color="text.secondary" paragraph sx={{ lineHeight: 1.7 }}>
                            Neram Classes offers online and offline NATA coaching for students in {loc.cityDisplay} and surrounding areas.
                            Expert IIT/NIT faculty, daily drawing practice, and comprehensive study materials.
                          </Typography>
                        )}

                        <Button
                          variant="text"
                          component={Link}
                          href={`/coaching/nata-coaching/nata-coaching-centers-in-${citySlug}`}
                          sx={{ textTransform: 'none', p: 0 }}
                        >
                          View NATA coaching in {loc.cityDisplay} →
                        </Button>
                      </CardContent>
                    </Card>
                  </Grid>
                );
              })}
            </Grid>
          </Container>
        </Box>

        {/* ═══════════════════════════════════════════════════════════════
            SECTION 6: ALL 38 DISTRICTS GRID
            ═══════════════════════════════════════════════════════════════ */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="lg">
            <Typography
              variant="h2"
              component="h2"
              align="center"
              gutterBottom
              sx={{ fontWeight: 700, mb: 2 }}
            >
              NATA Coaching Available Across All 38 Tamil Nadu Districts
            </Typography>
            <Typography variant="body1" align="center" color="text.secondary" sx={{ mb: 6, maxWidth: 700, mx: 'auto' }}>
              Whether you&apos;re in a major city or a smaller district, Neram Classes brings expert NATA coaching to your doorstep through online classes and regional centers.
            </Typography>

            {Object.entries(DISTRICT_ZONES).map(([zoneName, districts]) => (
              <Box key={zoneName} sx={{ mb: 5 }}>
                <Typography variant="h5" component="h3" gutterBottom sx={{ fontWeight: 600, color: 'primary.main', mb: 2 }}>
                  {zoneName}
                </Typography>
                <Grid container spacing={2}>
                  {districts.map((district) => {
                    const slug = DISTRICT_SLUG_MAP[district];
                    if (!slug) return null;
                    const isTier1 = TIER1_CITIES.includes(slug);
                    const isTier2 = TIER2_CITIES.includes(slug);

                    return (
                      <Grid item xs={6} sm={4} md={3} key={district}>
                        <Card
                          component={Link}
                          href={`/coaching/nata-coaching/nata-coaching-centers-in-${slug}`}
                          sx={{
                            textDecoration: 'none',
                            display: 'block',
                            p: 2,
                            textAlign: 'center',
                            border: isTier1 ? '2px solid' : '1px solid',
                            borderColor: isTier1 ? 'primary.main' : 'divider',
                            bgcolor: isTier1 ? 'primary.50' : 'white',
                            transition: 'all 0.2s',
                            '&:hover': {
                              transform: 'translateY(-4px)',
                              boxShadow: 4,
                              borderColor: 'primary.main',
                            },
                          }}
                        >
                          <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                            {district}
                          </Typography>
                          {isTier1 && (
                            <Chip label="Major Center" size="small" color="primary" sx={{ mt: 0.5, fontSize: '0.65rem', height: 20 }} />
                          )}
                          {isTier2 && (
                            <Chip label="Regional Hub" size="small" variant="outlined" color="primary" sx={{ mt: 0.5, fontSize: '0.65rem', height: 20 }} />
                          )}
                        </Card>
                      </Grid>
                    );
                  })}
                </Grid>
              </Box>
            ))}
          </Container>
        </Box>

        {/* ═══════════════════════════════════════════════════════════════
            SECTION 7: COURSE PLANS
            ═══════════════════════════════════════════════════════════════ */}
        <Box sx={{ py: { xs: 6, md: 10 } }}>
          <Container maxWidth="lg">
            <Typography
              variant="h2"
              component="h2"
              align="center"
              gutterBottom
              sx={{ fontWeight: 700, mb: 2 }}
            >
              NATA Coaching Courses Available in Tamil Nadu
            </Typography>
            <Typography variant="body1" align="center" color="text.secondary" sx={{ mb: 6 }}>
              Choose the right plan for your NATA 2026 preparation
            </Typography>

            <Grid container spacing={4} justifyContent="center">
              {coursePlans.map((plan, index) => (
                <Grid item xs={12} sm={6} md={4} key={index}>
                  <Card
                    sx={{
                      height: '100%',
                      textAlign: 'center',
                      border: index === 2 ? '2px solid' : '1px solid',
                      borderColor: index === 2 ? 'primary.main' : 'divider',
                      position: 'relative',
                    }}
                  >
                    {index === 2 && (
                      <Box sx={{ bgcolor: 'primary.main', color: 'white', py: 0.5, fontSize: '0.75rem', fontWeight: 700 }}>
                        MOST POPULAR
                      </Box>
                    )}
                    <CardContent sx={{ p: 4 }}>
                      <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>
                        {plan.name}
                      </Typography>
                      <Typography variant="h3" color="primary" sx={{ fontWeight: 800, my: 2 }}>
                        {plan.price}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        {plan.duration} | {plan.mode}
                      </Typography>
                      <Divider sx={{ my: 2 }} />
                      <List dense>
                        {plan.highlights.map((h, idx) => (
                          <ListItem key={idx} sx={{ justifyContent: 'center', px: 0, py: 0.25 }}>
                            <ListItemIcon sx={{ minWidth: 24 }}>
                              <Typography color="success.main" sx={{ fontSize: '0.85rem' }}>✓</Typography>
                            </ListItemIcon>
                            <ListItemText
                              primary={h}
                              primaryTypographyProps={{ variant: 'body2' }}
                            />
                          </ListItem>
                        ))}
                      </List>
                      <Button
                        variant={index === 2 ? 'contained' : 'outlined'}
                        fullWidth
                        sx={{ mt: 3 }}
                        component={Link}
                        href="/apply"
                      >
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
            SECTION 8: FAQ ACCORDION
            ═══════════════════════════════════════════════════════════════ */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="md">
            <Typography
              variant="h2"
              component="h2"
              align="center"
              gutterBottom
              sx={{ fontWeight: 700, mb: 2 }}
            >
              Frequently Asked Questions About NATA Coaching in Tamil Nadu
            </Typography>
            <Typography variant="body1" align="center" color="text.secondary" sx={{ mb: 6 }}>
              Everything you need to know about NATA coaching across Tamil Nadu
            </Typography>

            {faqs.map((faq, index) => (
              <Accordion
                key={index}
                disableGutters
                sx={{
                  mb: 1,
                  borderRadius: 1,
                  overflow: 'hidden',
                  '&:before': { display: 'none' },
                  boxShadow: 'none',
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <AccordionSummary
                  expandIcon={<Typography sx={{ fontSize: '1.5rem', fontWeight: 600 }}>+</Typography>}
                  sx={{
                    bgcolor: 'white',
                    '&:hover': { bgcolor: 'grey.50' },
                  }}
                >
                  <Typography sx={{ fontWeight: 600, fontSize: { xs: '0.9rem', md: '1rem' } }}>
                    {faq.question}
                  </Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ bgcolor: 'white', pt: 0 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.8 }}>
                    {faq.answer}
                  </Typography>
                </AccordionDetails>
              </Accordion>
            ))}
          </Container>
        </Box>

        {/* ═══════════════════════════════════════════════════════════════
            SECTION 9: CTA FOOTER
            ═══════════════════════════════════════════════════════════════ */}
        <Box
          sx={{
            py: { xs: 8, md: 12 },
            background: 'linear-gradient(135deg, #1a237e 0%, #0d47a1 100%)',
            color: 'white',
            textAlign: 'center',
          }}
        >
          <Container maxWidth="md">
            <Typography variant="h3" component="h2" gutterBottom sx={{ fontWeight: 800, fontSize: { xs: '1.75rem', md: '2.5rem' } }}>
              Start Your Architecture Journey in Tamil Nadu Today
            </Typography>
            <Typography variant="h6" sx={{ mb: 4, opacity: 0.9, fontWeight: 400 }}>
              Limited seats available for NATA 2026 batches across Tamil Nadu. Enroll now and join 5,000+ successful students!
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap', mb: 4 }}>
              <Button
                variant="contained"
                size="large"
                component={Link}
                href="/apply"
                sx={{
                  bgcolor: '#FFD700',
                  color: '#0d1b2a',
                  fontWeight: 700,
                  px: 5,
                  py: 1.5,
                  fontSize: '1.05rem',
                  '&:hover': { bgcolor: '#FFC107' },
                }}
              >
                Enroll Now
              </Button>
              <Button
                variant="outlined"
                size="large"
                component="a"
                href="tel:+919176137043"
                sx={{ borderColor: 'white', color: 'white', px: 4, py: 1.5, fontSize: '1.05rem' }}
              >
                Call: +91-9176137043
              </Button>
              <Button
                variant="outlined"
                size="large"
                component="a"
                href="https://wa.me/919176137043?text=Hi%2C%20I%20want%20to%20know%20about%20NATA%20coaching%20in%20Tamil%20Nadu"
                target="_blank"
                rel="noopener noreferrer"
                sx={{ borderColor: 'white', color: 'white', px: 4, py: 1.5, fontSize: '1.05rem' }}
              >
                WhatsApp Us
              </Button>
            </Box>
            <Typography variant="body2" sx={{ opacity: 0.7 }}>
              Online classes available across all 38 Tamil Nadu districts | EMI and scholarship options available
            </Typography>
          </Container>
        </Box>
      </Box>
    </>
  );
}

import { Box, Typography, Button, Grid, Card, CardContent, Paper, Accordion, AccordionSummary, AccordionDetails, Divider } from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Link from 'next/link';
import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateFAQSchema } from '@/lib/seo/schemas';
import { APP_URL, ORG_NAME, MARKETING_URL, SOCIAL_PROFILES } from '@/lib/seo/constants';
import { RelatedTools } from '@/components/seo/RelatedTools';

const TOOL_NAME = 'NATA Exam Centers 2026';
const TOOL_URL = `${APP_URL}/tools/exam-centers`;
const PROTECTED_URL = '/login?redirect=/tools/nata/exam-centers';

export function generateMetadata(): Metadata {
  return {
    title: 'NATA Exam Centers 2026 | Find Test Centers Near You (96 Cities, 26 States)',
    description:
      'Find NATA 2026 exam centers near you. Search 96 cities across 26 states. TCS iON verified centers with address, capacity, and confidence ratings.',
    keywords: [
      'NATA exam centers 2026',
      'NATA test center list',
      'NATA exam center near me',
      'TCS iON NATA centers',
      'NATA 2026 exam city list',
      'NATA center address',
      'NATA exam center state wise',
      'NATA test center search',
      'COA exam center',
      'NATA computer based test centers',
    ],
    openGraph: {
      title: 'NATA Exam Centers 2026 | Find Centers Near You',
      description:
        'Search NATA 2026 exam centers across 96 cities and 26 states. TCS iON verified with address details.',
      type: 'website',
      url: TOOL_URL,
      siteName: ORG_NAME,
    },
    twitter: {
      card: 'summary_large_image',
      title: 'NATA Exam Centers 2026 — 96 Cities, 26 States',
      description:
        'Search NATA 2026 exam centers across 96 cities and 26 states. TCS iON verified with address details.',
    },
    alternates: {
      canonical: TOOL_URL,
    },
  };
}

const faqs = [
  {
    question: 'How many NATA 2026 exam centers are there in India?',
    answer:
      'NATA 2026 is expected to be conducted in approximately 96 cities across 26 states and union territories. The Council of Architecture (COA) partners with TCS iON to deliver the computer-based test at their secure testing centers. The exact number of centers may vary slightly between Session 1 and Session 2. Our exam center finder includes all confirmed and expected centers based on official COA announcements and previous year data.',
  },
  {
    question: 'Can I choose my NATA exam center?',
    answer:
      'Yes, during the NATA 2026 registration process, you can select up to 4 preferred exam cities. The Council of Architecture assigns your final center based on availability and your preference order. While you cannot choose a specific center within a city, you will be assigned to one of the TCS iON centers in your preferred city. It is advisable to choose cities close to your location and include at least one metro city as a backup.',
  },
  {
    question: 'When is the NATA exam center allotted?',
    answer:
      'NATA exam center allotment typically happens 10-15 days before the exam date. You will receive your admit card with the exact center name, address, and reporting time via email and on the NATA portal. The center assigned will be in one of the cities you selected during registration. If none of your preferred cities have available slots, COA assigns the nearest available city.',
  },
  {
    question: 'Are NATA exam centers TCS iON centers?',
    answer:
      'Yes, NATA 2026 is conducted at TCS iON testing centers across India. TCS iON is the technology partner of the Council of Architecture for NATA exam delivery. These are professional testing facilities with computer workstations, secure login systems, CCTV surveillance, and standardized exam conditions. The drawing section is also done on-screen using TCS iON\'s digital drawing tools.',
  },
  {
    question: 'What if there is no NATA exam center in my city?',
    answer:
      'If your city does not have a NATA exam center, you should select the nearest city that has one. Major cities like Delhi, Mumbai, Chennai, Kolkata, Bangalore, and Hyderabad always have multiple centers. Our tool shows you the nearest centers with distance estimates so you can plan travel and accommodation. Many students choose a center in the nearest metro city for better availability.',
  },
  {
    question: 'Can I change my NATA exam center after registration?',
    answer:
      'Center change requests are generally not entertained after the registration window closes. However, in exceptional circumstances (natural disasters, COVID-related restrictions), COA has historically allowed center changes through the NATA portal. It is important to choose your preferred cities carefully during registration. Our exam center finder helps you explore all available cities before you register so you can make an informed choice.',
  },
];

const steps = [
  {
    number: '1',
    title: 'Search by Location',
    description: 'Enter your state or city name to find NATA 2026 exam centers near your location.',
  },
  {
    number: '2',
    title: 'Browse Center List',
    description: 'See all centers in your area with full addresses, nearby cities, and distance estimates.',
  },
  {
    number: '3',
    title: 'Check Confidence Rating',
    description: 'Each center has a confidence rating based on official data — Confirmed, Likely, or Expected.',
  },
  {
    number: '4',
    title: 'Plan Your Visit',
    description: 'View center details to plan travel, accommodation, and reach the exam venue on time.',
  },
];

const features = [
  '96 exam cities across 26 states and union territories',
  'Search by state, city, or pin code',
  'TCS iON verified center addresses',
  'Confidence ratings — Confirmed, Likely, and Expected centers',
  'Nearby city suggestions if your city has no center',
  'Distance estimates from major landmarks',
  'Updated for both NATA 2026 Session 1 and Session 2',
  'Completely free and mobile-friendly',
];

const stateCoverage = [
  { state: 'Andhra Pradesh', cities: 'Hyderabad, Visakhapatnam, Vijayawada' },
  { state: 'Delhi NCR', cities: 'New Delhi, Noida, Gurugram, Faridabad' },
  { state: 'Karnataka', cities: 'Bangalore, Mysore, Mangalore' },
  { state: 'Maharashtra', cities: 'Mumbai, Pune, Nagpur, Nashik' },
  { state: 'Tamil Nadu', cities: 'Chennai, Coimbatore, Madurai, Tiruchirappalli' },
  { state: 'Uttar Pradesh', cities: 'Lucknow, Noida, Varanasi, Allahabad' },
  { state: 'West Bengal', cities: 'Kolkata, Durgapur, Siliguri' },
  { state: 'Kerala', cities: 'Thiruvananthapuram, Kochi, Kozhikode' },
];

export default function ExamCentersPage() {
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: APP_URL },
      { '@type': 'ListItem', position: 2, name: 'Tools', item: `${APP_URL}/tools` },
      { '@type': 'ListItem', position: 3, name: 'Exam Centers', item: TOOL_URL },
    ],
  };

  const webAppSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: TOOL_NAME,
    applicationCategory: 'EducationalApplication',
    applicationSubCategory: 'Exam Center Locator',
    url: TOOL_URL,
    operatingSystem: 'Web',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
    description:
      'Find NATA 2026 exam centers near you. Search across 96 cities in 26 states with TCS iON verified addresses, confidence ratings, and nearby city suggestions.',
    featureList: features,
    isAccessibleForFree: true,
    provider: {
      '@type': 'EducationalOrganization',
      name: ORG_NAME,
      url: MARKETING_URL,
      sameAs: SOCIAL_PROFILES,
    },
    audience: {
      '@type': 'EducationalAudience',
      educationalRole: 'student',
      audienceType: 'NATA 2026 aspirants looking for exam centers',
    },
  };

  const faqSchema = generateFAQSchema(faqs);

  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={webAppSchema} />
      <JsonLd data={faqSchema} />

      <Box sx={{ py: { xs: 3, md: 6 } }}>
        {/* Hero / Answer-First Section */}
        <Box sx={{ textAlign: 'center', mb: { xs: 4, md: 6 } }}>
          <Typography
            variant="h3"
            component="h1"
            gutterBottom
            sx={{ fontWeight: 700, fontSize: { xs: '1.75rem', md: '2.5rem' }, lineHeight: 1.3 }}
          >
            NATA Exam Centers 2026 — Find Test Centers Near You
          </Typography>

          <Typography
            variant="h6"
            component="p"
            sx={{
              maxWidth: 800,
              mx: 'auto',
              mb: 3,
              fontSize: { xs: '1rem', md: '1.15rem' },
              color: 'text.secondary',
              lineHeight: 1.7,
            }}
          >
            The NATA Exam Center Finder helps you locate NATA 2026 test centers near your city or state.
            NATA 2026 will be conducted across approximately 96 cities in 26 states and union territories
            through TCS iON computer-based testing facilities. This tool lets you search by state, city,
            or pin code to find the nearest centers with their full addresses and confidence ratings
            (Confirmed, Likely, or Expected). If your city does not have a center, the tool suggests
            nearby cities with available centers along with distance estimates. Use this before
            registration to choose your preferred exam cities wisely — you can select up to 4 cities
            during the NATA application process. The data is compiled from official COA announcements and
            historical center allocation patterns.
          </Typography>

          <Button
            component={Link}
            href={PROTECTED_URL}
            variant="contained"
            size="large"
            sx={{ px: 4, py: 1.5, fontSize: { xs: '1rem', md: '1.1rem' }, fontWeight: 600 }}
          >
            Find Centers Near Me
          </Button>
        </Box>

        <Divider sx={{ my: { xs: 3, md: 5 } }} />

        {/* How It Works */}
        <Box sx={{ mb: { xs: 4, md: 6 } }}>
          <Typography
            variant="h4"
            component="h2"
            gutterBottom
            sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', md: '2rem' }, textAlign: 'center', mb: 4 }}
          >
            How the NATA Exam Center Finder Works
          </Typography>

          <Grid container spacing={3}>
            {steps.map((step) => (
              <Grid item xs={12} sm={6} md={3} key={step.number}>
                <Card sx={{ height: '100%', textAlign: 'center', p: 2 }}>
                  <CardContent>
                    <Box
                      sx={{
                        width: 48,
                        height: 48,
                        borderRadius: '50%',
                        bgcolor: 'primary.main',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        mx: 'auto',
                        mb: 2,
                        fontSize: '1.25rem',
                        fontWeight: 700,
                      }}
                    >
                      {step.number}
                    </Box>
                    <Typography variant="h6" gutterBottom fontWeight={600}>
                      {step.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {step.description}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>

        <Divider sx={{ my: { xs: 3, md: 5 } }} />

        {/* Key Features */}
        <Box sx={{ mb: { xs: 4, md: 6 } }}>
          <Typography
            variant="h4"
            component="h2"
            gutterBottom
            sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', md: '2rem' }, textAlign: 'center', mb: 3 }}
          >
            Key Features of the Exam Center Finder
          </Typography>

          <Grid container spacing={2} sx={{ maxWidth: 900, mx: 'auto' }}>
            {features.map((feature) => (
              <Grid item xs={12} sm={6} key={feature}>
                <Paper
                  variant="outlined"
                  sx={{ p: 2, display: 'flex', alignItems: 'flex-start', gap: 1.5 }}
                >
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      bgcolor: 'primary.main',
                      mt: 0.8,
                      flexShrink: 0,
                    }}
                  />
                  <Typography variant="body1">{feature}</Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Box>

        <Divider sx={{ my: { xs: 3, md: 5 } }} />

        {/* State-wise Coverage */}
        <Box sx={{ mb: { xs: 4, md: 6 } }}>
          <Typography
            variant="h4"
            component="h2"
            gutterBottom
            sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', md: '2rem' }, textAlign: 'center', mb: 3 }}
          >
            NATA 2026 Exam Centers — State-wise Coverage
          </Typography>

          <Paper variant="outlined" sx={{ maxWidth: 750, mx: 'auto', overflow: 'hidden' }}>
            {stateCoverage.map((row, i) => (
              <Box
                key={row.state}
                sx={{
                  display: 'flex',
                  flexDirection: { xs: 'column', sm: 'row' },
                  px: 3,
                  py: 1.5,
                  bgcolor: i % 2 === 0 ? 'grey.50' : 'white',
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  gap: { xs: 0.5, sm: 2 },
                }}
              >
                <Typography variant="body1" fontWeight={600} sx={{ minWidth: 160 }}>
                  {row.state}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {row.cities}
                </Typography>
              </Box>
            ))}
            <Box sx={{ px: 3, py: 1.5, bgcolor: 'primary.50', textAlign: 'center' }}>
              <Typography variant="body2" fontWeight={500}>
                + 18 more states — Use the tool to search all 96 cities
              </Typography>
            </Box>
          </Paper>
        </Box>

        <Divider sx={{ my: { xs: 3, md: 5 } }} />

        {/* Who Is This For */}
        <Box sx={{ mb: { xs: 4, md: 6 } }}>
          <Typography
            variant="h4"
            component="h2"
            gutterBottom
            sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', md: '2rem' }, textAlign: 'center', mb: 3 }}
          >
            Who Should Use the Exam Center Finder?
          </Typography>

          <Grid container spacing={2} sx={{ maxWidth: 900, mx: 'auto' }}>
            {[
              {
                title: 'First-time NATA Candidates',
                desc: 'Students registering for NATA 2026 who need to select their 4 preferred exam cities during the application process.',
              },
              {
                title: 'Students in Smaller Cities',
                desc: 'Candidates from towns without a TCS iON center who want to find the nearest available exam city and plan travel.',
              },
              {
                title: 'Parents Helping with Registration',
                desc: 'Parents assisting their children with NATA registration who want to verify center locations and plan logistics.',
              },
              {
                title: 'Session 2 Re-takers',
                desc: 'Students who want to check if additional centers are available for Session 2 or choose a different city for convenience.',
              },
            ].map((item) => (
              <Grid item xs={12} sm={6} key={item.title}>
                <Card variant="outlined" sx={{ height: '100%', p: 2 }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom fontWeight={600}>
                      {item.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {item.desc}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>

        <Divider sx={{ my: { xs: 3, md: 5 } }} />

        {/* FAQ Section */}
        <Box sx={{ mb: { xs: 4, md: 6 } }}>
          <Typography
            variant="h4"
            component="h2"
            gutterBottom
            sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', md: '2rem' }, textAlign: 'center', mb: 3 }}
          >
            Frequently Asked Questions — NATA Exam Centers
          </Typography>

          <Box sx={{ maxWidth: 800, mx: 'auto' }}>
            {faqs.map((faq) => (
              <Accordion key={faq.question} disableGutters>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography fontWeight={600}>{faq.question}</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
                    {faq.answer}
                  </Typography>
                </AccordionDetails>
              </Accordion>
            ))}
          </Box>
        </Box>

        <RelatedTools currentHref="/tools/exam-centers" />

        {/* Final CTA */}
        <Box
          sx={{
            textAlign: 'center',
            py: { xs: 4, md: 6 },
            px: 3,
            bgcolor: 'primary.50',
            borderRadius: 2,
          }}
        >
          <Typography
            variant="h4"
            component="h2"
            gutterBottom
            sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', md: '2rem' } }}
          >
            Find Your Nearest NATA 2026 Exam Center
          </Typography>
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ maxWidth: 600, mx: 'auto', mb: 3, lineHeight: 1.7 }}
          >
            Search by state or city to find TCS iON centers near you. Check addresses, confidence
            ratings, and nearby alternatives before selecting your preferred exam cities. Free to use.
          </Typography>
          <Button
            component={Link}
            href={PROTECTED_URL}
            variant="contained"
            size="large"
            sx={{ px: 5, py: 1.5, fontSize: { xs: '1rem', md: '1.1rem' }, fontWeight: 600 }}
          >
            Use This Tool Free
          </Button>
        </Box>
      </Box>
    </>
  );
}

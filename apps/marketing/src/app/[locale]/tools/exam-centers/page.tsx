import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  generateBreadcrumbSchema,
  generateWebApplicationSchema,
  generateFAQSchema,
} from '@/lib/seo/schemas';
import { buildAlternates, buildOgImage } from '@/lib/seo/metadata';
import {
  Box,
  Container,
  Typography,
  Button,
  Grid,
  Card,
  CardContent,
  Paper,
  Divider,
} from '@neram/ui';
import Link from 'next/link';

const baseUrl = 'https://neramclasses.com';
const appUrl = 'https://app.neramclasses.com';


const faqs = [
  {
    question: 'How many NATA exam centers are there in 2026?',
    answer:
      'NATA 2026 is expected to be conducted in approximately 96 cities across 26 states and union territories in India. The exam is also held in select international cities including Dubai, Muscat, and Kathmandu. The exact center list is published by CoA on the official NATA website after the application window closes.',
  },
  {
    question: 'How are NATA 2026 exam centers allocated?',
    answer:
      'When you fill the NATA 2026 application form, you select 4 preferred test cities. CoA allocates your exam center based on availability and proximity to your first preference. The exact center address (with room number) is printed on your admit card, typically released 10-15 days before the exam date.',
  },
  {
    question: 'Are all NATA exam centers managed by TCS iON?',
    answer:
      'Yes, NATA 2026 is conducted through TCS iON infrastructure. All test centers are TCS iON-approved venues with standardised computer terminals, CCTV monitoring, and biometric verification. This ensures a consistent exam experience across all cities.',
  },
  {
    question: 'Can I change my NATA exam center after registration?',
    answer:
      'Center change requests are allowed during a limited window after the application deadline. CoA announces the center change window on the official website. Changes are subject to seat availability at the new preferred city. You cannot change centers after the admit card is issued.',
  },
  {
    question: 'What facilities are available at NATA exam centers?',
    answer:
      'Each TCS iON center provides individual computer terminals with drawing tablets for the sketching section, rough sheets for calculations, and on-screen calculators. Centers have CCTV surveillance, biometric attendance, and secure locker facilities for personal belongings. Water is provided; food and electronic devices are not allowed inside.',
  },
  {
    question: 'How can I find the nearest NATA exam center to my city?',
    answer:
      'Use our Exam Center Finder tool to search by city name, state, or PIN code. The tool shows all nearby centers with approximate distance, confidence rating (based on historical data), and TCS iON verification status. You can also view centers on a map to plan your travel.',
  },
];

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'NATA Exam Centers 2026: Find Test Centers Near You in 96 Cities',
    description:
      'Find NATA 2026 exam centers near you. Search 96 cities across 26 states with TCS iON verified centers, distance calculator, and confidence ratings. Plan your NATA test day.',
    keywords:
      'NATA exam centers 2026, NATA test center list, NATA exam center near me, TCS iON centers NATA, NATA 2026 city list, NATA exam center allocation',
    alternates: buildAlternates(locale, '/tools/exam-centers'),
    openGraph: {
      title:
        'NATA Exam Centers 2026: Find Test Centers Near You in 96 Cities',
      description:
        'Search NATA 2026 exam centers in 96 cities across 26 states. TCS iON verified, distance calculator, confidence ratings.',
      url:
        locale === 'en'
          ? `${baseUrl}/tools/exam-centers`
          : `${baseUrl}/${locale}/tools/exam-centers`,
      type: 'website',
      images: [
        {
          url: buildOgImage(
            'NATA Exam Centers 2026',
            'Find centers in 96 cities',
            'tool'
          ),
        },
      ],
    },
  };
}

export default function ExamCentersPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);

  return (
    <>
      <JsonLd
        data={[
          generateBreadcrumbSchema([
            { name: 'Home', url: baseUrl },
            { name: 'Tools', url: `${baseUrl}/tools` },
            {
              name: 'Exam Centers',
              url: `${baseUrl}/tools/exam-centers`,
            },
          ]),
          generateWebApplicationSchema({
            name: 'NATA Exam Center Finder 2026',
            description:
              'Search and find NATA 2026 exam centers near you across 96 cities in India with distance calculator and TCS iON verification.',
            url: `${baseUrl}/tools/exam-centers`,
            applicationCategory: 'EducationalApplication',
          }),
          generateFAQSchema(faqs),
        ]}
      />

      {/* Hero Section */}
      <Box
        sx={{
          background: 'linear-gradient(135deg, #2E7D32 0%, #1B5E20 100%)',
          color: 'white',
          py: { xs: 6, md: 10 },
          px: 2,
        }}
      >
        <Container maxWidth="md">
          <Typography
            component="h1"
            sx={{
              fontSize: { xs: '1.75rem', md: '2.5rem' },
              fontWeight: 800,
              mb: 2,
              lineHeight: 1.2,
            }}
          >
            NATA Exam Centers 2026
          </Typography>
          <Typography
            sx={{
              fontSize: { xs: '1rem', md: '1.25rem' },
              mb: 3,
              opacity: 0.95,
              lineHeight: 1.6,
            }}
          >
            Find NATA 2026 exam centers near you with our free Exam Center
            Finder. NATA is conducted across 96 cities in 26 states through TCS
            iON infrastructure. Our tool lets you search centers by city, state,
            or PIN code, view approximate distances from your location, and check
            confidence ratings based on historical center data. Each center
            listing includes TCS iON verification status, seating capacity
            estimates, and nearby transport options. Whether you are in a metro
            city like Chennai, Mumbai, or Delhi, or a smaller city like
            Pudukkottai or Jorhat, find the closest NATA test center and plan
            your exam day logistics well in advance.
          </Typography>
          <Button
            component={Link}
            href={`${appUrl}/tools/nata/exam-centers`}
            variant="contained"
            size="large"
            sx={{
              bgcolor: 'white',
              color: '#2E7D32',
              fontWeight: 700,
              px: 4,
              py: 1.5,
              fontSize: '1.1rem',
              '&:hover': { bgcolor: '#E8F5E9' },
            }}
          >
            Use This Tool Free &rarr;
          </Button>
        </Container>
      </Box>

      {/* How It Works */}
      <Container maxWidth="md" sx={{ py: { xs: 5, md: 8 } }}>
        <Typography
          component="h2"
          sx={{
            fontSize: { xs: '1.5rem', md: '2rem' },
            fontWeight: 700,
            mb: 4,
            textAlign: 'center',
          }}
        >
          How the Exam Center Finder Works
        </Typography>
        <Grid container spacing={3}>
          {[
            {
              step: '1',
              title: 'Search Your City',
              desc: 'Type your city name, state, or PIN code. The tool auto-suggests matching locations and shows all nearby NATA exam centers.',
            },
            {
              step: '2',
              title: 'View Center Details',
              desc: 'Each center shows TCS iON verification status, estimated seating capacity, confidence rating (High/Medium/Low), and the address.',
            },
            {
              step: '3',
              title: 'Check Distance',
              desc: 'See approximate distance from your location to each center. Plan travel time and identify the most convenient option.',
            },
            {
              step: '4',
              title: 'Plan Exam Day',
              desc: 'View nearby hotels, transport options, and exam day tips. Save your preferred center for quick reference on exam day.',
            },
          ].map((item) => (
            <Grid item xs={12} sm={6} key={item.step}>
              <Card
                elevation={0}
                sx={{ border: '1px solid #E0E0E0', height: '100%' }}
              >
                <CardContent sx={{ p: 3 }}>
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      bgcolor: '#2E7D32',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '1.1rem',
                      mb: 2,
                    }}
                  >
                    {item.step}
                  </Box>
                  <Typography
                    component="h3"
                    sx={{ fontWeight: 700, fontSize: '1.1rem', mb: 1 }}
                  >
                    {item.title}
                  </Typography>
                  <Typography sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                    {item.desc}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>

      <Divider />

      {/* Key Features */}
      <Box sx={{ bgcolor: '#FAFAFA', py: { xs: 5, md: 8 } }}>
        <Container maxWidth="md">
          <Typography
            component="h2"
            sx={{
              fontSize: { xs: '1.5rem', md: '2rem' },
              fontWeight: 700,
              mb: 4,
              textAlign: 'center',
            }}
          >
            Key Features
          </Typography>
          <Grid container spacing={3}>
            {[
              {
                title: '96 Cities Covered',
                desc: 'Complete coverage of all NATA 2026 exam cities across 26 states and union territories, including international centers in Dubai, Muscat, and Kathmandu.',
              },
              {
                title: 'TCS iON Verified',
                desc: 'Every listed center is verified against TCS iON infrastructure data. Centers marked as "Verified" have confirmed TCS iON presence from previous exam cycles.',
              },
              {
                title: 'Confidence Ratings',
                desc: 'Each center gets a confidence rating (High, Medium, Low) based on how consistently it has been used as a NATA center in previous years.',
              },
              {
                title: 'Distance Calculator',
                desc: 'Enter your location to see approximate distances to each center. Helps you choose the most convenient option when filling preferences in the NATA form.',
              },
              {
                title: 'State-wise Listing',
                desc: 'Browse centers organised by state. See the number of centers in each state, helping you understand regional availability and plan travel.',
              },
              {
                title: 'Exam Day Checklist',
                desc: 'Each center page includes an exam day checklist: documents to carry, reporting time, prohibited items, and tips for the drawing test setup.',
              },
            ].map((feature) => (
              <Grid item xs={12} sm={6} key={feature.title}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 3,
                    height: '100%',
                    border: '1px solid #E0E0E0',
                    borderRadius: 2,
                  }}
                >
                  <Typography
                    component="h3"
                    sx={{ fontWeight: 700, fontSize: '1rem', mb: 1 }}
                  >
                    {feature.title}
                  </Typography>
                  <Typography
                    sx={{
                      color: 'text.secondary',
                      fontSize: '0.95rem',
                      lineHeight: 1.6,
                    }}
                  >
                    {feature.desc}
                  </Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      <Divider />

      {/* NATA 2026 Exam Center Details */}
      <Container maxWidth="md" sx={{ py: { xs: 5, md: 8 } }}>
        <Typography
          component="h2"
          sx={{
            fontSize: { xs: '1.5rem', md: '2rem' },
            fontWeight: 700,
            mb: 3,
          }}
        >
          NATA 2026 Exam Centers: What You Need to Know
        </Typography>
        <Typography sx={{ mb: 2, lineHeight: 1.8, color: 'text.secondary' }}>
          The Council of Architecture (CoA) conducts NATA through TCS iON
          centres across India. For NATA 2026, the exam is expected in
          approximately 96 cities covering all major metros and many tier-2
          cities. The exam is computer-based for the MCQ sections (Mathematics
          and General Aptitude) and uses digital drawing tablets for the Drawing
          section.
        </Typography>
        <Typography sx={{ mb: 2, lineHeight: 1.8, color: 'text.secondary' }}>
          During the NATA application process, candidates select up to 4
          preferred test cities. CoA allocates centers based on first-come
          availability. Students in smaller towns may need to travel to the
          nearest city with a TCS iON centre. States like Tamil Nadu, Karnataka,
          Maharashtra, and Uttar Pradesh have the highest number of centers (8-12
          each), while northeastern states may have 1-2 centers each.
        </Typography>
        <Typography sx={{ mb: 3, lineHeight: 1.8, color: 'text.secondary' }}>
          Your exact center address appears on the admit card, released 10-15
          days before the exam. We recommend visiting the center a day before the
          exam to familiarise yourself with the location, parking, and entry
          points. Our tool helps you identify the closest center early so you can
          list it as your first preference during application and arrange travel
          and accommodation if needed.
        </Typography>
        <Button
          component={Link}
          href={`${appUrl}/tools/nata/exam-centers`}
          variant="contained"
          size="large"
          sx={{
            bgcolor: '#2E7D32',
            fontWeight: 700,
            px: 4,
            py: 1.5,
            fontSize: '1.1rem',
          }}
        >
          Use This Tool Free &rarr;
        </Button>
      </Container>

      <Divider />

      {/* FAQ Section */}
      <Box sx={{ bgcolor: '#FAFAFA', py: { xs: 5, md: 8 } }}>
        <Container maxWidth="md">
          <Typography
            component="h2"
            sx={{
              fontSize: { xs: '1.5rem', md: '2rem' },
              fontWeight: 700,
              mb: 4,
              textAlign: 'center',
            }}
          >
            Frequently Asked Questions
          </Typography>
          {faqs.map((faq, i) => (
            <Paper
              key={i}
              elevation={0}
              sx={{
                p: 3,
                mb: 2,
                border: '1px solid #E0E0E0',
                borderRadius: 2,
              }}
            >
              <Typography
                component="h3"
                sx={{ fontWeight: 700, fontSize: '1.05rem', mb: 1 }}
              >
                {faq.question}
              </Typography>
              <Typography sx={{ color: 'text.secondary', lineHeight: 1.7 }}>
                {faq.answer}
              </Typography>
            </Paper>
          ))}
        </Container>
      </Box>
    </>
  );
}

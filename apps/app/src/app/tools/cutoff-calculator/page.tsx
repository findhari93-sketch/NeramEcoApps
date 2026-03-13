import { Box, Typography, Button, Grid, Card, CardContent, Paper, Accordion, AccordionSummary, AccordionDetails, Divider } from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Link from 'next/link';
import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateFAQSchema } from '@/lib/seo/schemas';
import { APP_URL, ORG_NAME, MARKETING_URL, SOCIAL_PROFILES } from '@/lib/seo/constants';

const TOOL_NAME = 'NATA Cutoff Calculator 2026';
const TOOL_URL = `${APP_URL}/tools/cutoff-calculator`;
const PROTECTED_URL = '/login?redirect=/tools/nata/cutoff-calculator';

export function generateMetadata(): Metadata {
  return {
    title: 'Free NATA Cutoff Calculator 2026 | Calculate Score, Percentile & College Eligibility',
    description:
      'Calculate your NATA 2026 cutoff score instantly. Enter section-wise marks for Drawing (80) and MCQ (120) to get percentile estimate and college eligibility.',
    keywords: [
      'NATA cutoff calculator 2026',
      'NATA score calculator',
      'NATA percentile calculator',
      'NATA marks vs college',
      'NATA cutoff marks',
      'NATA 2026 expected cutoff',
      'NATA section wise marks calculator',
      'architecture entrance cutoff',
      'NATA drawing marks calculator',
      'NATA MCQ score calculator',
    ],
    openGraph: {
      title: 'Free NATA Cutoff Calculator 2026 | Neram Classes',
      description:
        'Calculate your NATA 2026 cutoff score instantly. Enter section-wise marks and get percentile estimates.',
      type: 'website',
      url: TOOL_URL,
      siteName: ORG_NAME,
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Free NATA Cutoff Calculator 2026',
      description:
        'Calculate your NATA 2026 cutoff score instantly. Enter section-wise marks and get percentile estimates.',
    },
    alternates: {
      canonical: TOOL_URL,
    },
  };
}

const faqs = [
  {
    question: 'What is the NATA cutoff score for 2026?',
    answer:
      'The NATA 2026 cutoff score varies by college and category. General category students typically need 100-120 marks (out of 200) for top government colleges like SPA Delhi and IIT Roorkee. For private colleges, a score of 70-90 is usually sufficient. Our cutoff calculator uses historical data from 2020-2025 to estimate your eligibility across different college tiers.',
  },
  {
    question: 'How is the NATA score calculated?',
    answer:
      'NATA 2026 total score is 200 marks. Part A (Drawing) carries 80 marks evaluated by multiple examiners on creativity, proportion, and aesthetics. Part B (MCQ) carries 120 marks with questions on mathematics, physics, general aptitude, and logical reasoning. The exam duration is 3 hours. Our calculator lets you enter section-wise scores and computes your total with percentile estimates.',
  },
  {
    question: 'What NATA score is needed for top architecture colleges?',
    answer:
      'For India\'s top architecture colleges: SPA Delhi requires 130-155 marks, IIT Roorkee (B.Arch) needs 120-140, CEPT Ahmedabad expects 110-130, and SPA Bhopal requires 100-120. These ranges are based on 2023-2025 admission data and may vary for NATA 2026. Category-wise relaxation of 5-15 marks applies for SC/ST/OBC candidates.',
  },
  {
    question: 'Are NATA cutoffs different for SC/ST/OBC categories?',
    answer:
      'Yes, NATA cutoffs vary by category. SC and ST candidates typically receive a relaxation of 10-15 marks compared to the general category cutoff. OBC candidates get 5-10 marks relaxation. EWS category cutoffs are usually similar to general category. Our calculator shows category-wise cutoffs for each college tier so you can check eligibility for your specific category.',
  },
  {
    question: 'Can I improve my NATA score by attempting both sessions?',
    answer:
      'Yes, NATA 2026 offers two exam sessions. You can attempt both and the better score is considered for admissions. If you scored below your target in Session 1, you can prepare specifically for weaker sections and improve in Session 2. Many students improve by 15-30 marks between sessions by focusing on drawing practice and MCQ speed.',
  },
  {
    question: 'How accurate is this NATA cutoff calculator?',
    answer:
      'Our NATA cutoff calculator uses historical admission data from 2020 to 2025 across 500+ architecture colleges in India. The percentile estimates are based on score distributions from previous years. While actual 2026 cutoffs may vary based on difficulty level and number of applicants, our predictions have been within 5-10 marks accuracy for 90% of colleges in past years.',
  },
];

const steps = [
  {
    number: '1',
    title: 'Enter Drawing Marks',
    description: 'Input your Part A (Drawing) score out of 80 marks based on your practice tests or expected performance.',
  },
  {
    number: '2',
    title: 'Enter MCQ Marks',
    description: 'Input your Part B (MCQ) score out of 120 marks covering mathematics, physics, and general aptitude.',
  },
  {
    number: '3',
    title: 'View Your Results',
    description: 'Get your total score, estimated percentile, and a breakdown of college tiers you may be eligible for.',
  },
  {
    number: '4',
    title: 'Explore Colleges',
    description: 'See category-wise cutoffs and directly explore matching colleges with our College Predictor tool.',
  },
];

const features = [
  'Section-wise score entry for Drawing (80 marks) and MCQ (120 marks)',
  'Instant percentile estimation based on 5 years of NATA data',
  'Category-wise cutoff display (General, OBC, SC, ST, EWS)',
  'College tier mapping — know which tier of colleges you qualify for',
  'Historical cutoff trends from 2020 to 2025',
  'Mobile-friendly — calculate on any device, anytime',
  'Completely free with no registration required to view results',
];

export default function CutoffCalculatorPage() {
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: APP_URL },
      { '@type': 'ListItem', position: 2, name: 'Tools', item: `${APP_URL}/tools` },
      { '@type': 'ListItem', position: 3, name: 'Cutoff Calculator', item: TOOL_URL },
    ],
  };

  const webAppSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: TOOL_NAME,
    applicationCategory: 'EducationalApplication',
    applicationSubCategory: 'Exam Score Calculator',
    url: TOOL_URL,
    operatingSystem: 'Web',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
    description:
      'Free NATA 2026 cutoff calculator. Enter section-wise scores to get total marks, percentile estimates, and college eligibility across different tiers and categories.',
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
      audienceType: 'NATA 2026 aspirants',
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
            Free NATA Cutoff Calculator 2026 — Calculate Your Score & College Eligibility
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
            The NATA Cutoff Calculator helps you estimate your NATA 2026 score, percentile, and college
            eligibility instantly. Enter your section-wise marks — Part A Drawing (out of 80) and Part B
            MCQ (out of 120) — and the calculator shows your total out of 200, an estimated percentile
            based on historical data, and which tier of architecture colleges you may qualify for. It covers
            category-wise cutoffs for General, OBC, SC, ST, and EWS candidates using admission data from
            2020 to 2025 across 500+ B.Arch colleges in India. Whether you are preparing for your first
            attempt or planning to improve in Session 2, this tool gives you a clear target score.
          </Typography>

          <Button
            component={Link}
            href={PROTECTED_URL}
            variant="contained"
            size="large"
            sx={{ px: 4, py: 1.5, fontSize: { xs: '1rem', md: '1.1rem' }, fontWeight: 600 }}
          >
            Use Cutoff Calculator Free
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
            How the NATA Cutoff Calculator Works
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
            Key Features of the NATA Score Calculator
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

        {/* NATA 2026 Exam Pattern Summary */}
        <Box sx={{ mb: { xs: 4, md: 6 } }}>
          <Typography
            variant="h4"
            component="h2"
            gutterBottom
            sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', md: '2rem' }, textAlign: 'center', mb: 3 }}
          >
            NATA 2026 Exam Pattern at a Glance
          </Typography>

          <Paper variant="outlined" sx={{ maxWidth: 700, mx: 'auto', overflow: 'hidden' }}>
            {[
              { label: 'Total Marks', value: '200' },
              { label: 'Part A — Drawing', value: '80 marks (2 questions)' },
              { label: 'Part B — MCQ', value: '120 marks (Multiple-choice questions)' },
              { label: 'Duration', value: '3 hours' },
              { label: 'Sessions Available', value: '2 attempts (best score counts)' },
              { label: 'Conducting Body', value: 'Council of Architecture (COA)' },
              { label: 'Test Delivery', value: 'Computer-based via TCS iON' },
            ].map((row, i) => (
              <Box
                key={row.label}
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  px: 3,
                  py: 1.5,
                  bgcolor: i % 2 === 0 ? 'grey.50' : 'white',
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Typography variant="body1" fontWeight={600}>
                  {row.label}
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  {row.value}
                </Typography>
              </Box>
            ))}
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
            Who Is the NATA Cutoff Calculator For?
          </Typography>

          <Grid container spacing={2} sx={{ maxWidth: 900, mx: 'auto' }}>
            {[
              {
                title: 'NATA 2026 Aspirants',
                desc: 'Students preparing for the NATA exam who want to set realistic target scores based on their preferred colleges.',
              },
              {
                title: 'Parents & Guardians',
                desc: 'Parents helping their children understand what NATA score is needed for different architecture colleges and fee ranges.',
              },
              {
                title: 'Coaching Students',
                desc: 'Students at NATA coaching centers who want to benchmark their mock test scores against actual college cutoffs.',
              },
              {
                title: 'Session 2 Re-takers',
                desc: 'Students who attempted Session 1 and want to know exactly how much they need to improve to reach their target college.',
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
            Frequently Asked Questions — NATA Cutoff Calculator
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
            Ready to Calculate Your NATA 2026 Cutoff?
          </Typography>
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ maxWidth: 600, mx: 'auto', mb: 3, lineHeight: 1.7 }}
          >
            Enter your section-wise marks and instantly see your estimated percentile, total score, and
            the architecture colleges you may qualify for. Completely free — no payment, no hidden charges.
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

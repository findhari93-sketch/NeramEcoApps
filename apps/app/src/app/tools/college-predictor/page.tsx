import { Box, Typography, Button, Grid, Card, CardContent, Paper, Accordion, AccordionSummary, AccordionDetails, Divider } from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Link from 'next/link';
import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateFAQSchema } from '@/lib/seo/schemas';
import { APP_URL, ORG_NAME, MARKETING_URL, SOCIAL_PROFILES } from '@/lib/seo/constants';

const TOOL_NAME = 'NATA College Predictor 2026';
const TOOL_URL = `${APP_URL}/tools/college-predictor`;
const PROTECTED_URL = '/login?redirect=/tools/counseling/college-predictor';

export function generateMetadata(): Metadata {
  return {
    title: 'Free NATA College Predictor 2026 | Find B.Arch Colleges by NATA Score',
    description:
      'Predict which architecture colleges accept your NATA 2026 score. Filter 5000+ B.Arch colleges by state, fee, ranking. Free college prediction tool.',
    keywords: [
      'NATA college predictor 2026',
      'architecture colleges for NATA score',
      'best B.Arch colleges India',
      'NATA score wise college list',
      'NATA college admission predictor',
      'B.Arch colleges by NATA marks',
      'architecture college cutoff',
      'NATA counselling college list',
      'state wise B.Arch colleges',
      'NATA 2026 college prediction',
    ],
    openGraph: {
      title: 'Free NATA College Predictor 2026 | Neram Classes',
      description:
        'Find B.Arch colleges matching your NATA 2026 score. Filter 5000+ colleges by state, fee, and ranking.',
      type: 'website',
      url: TOOL_URL,
      siteName: ORG_NAME,
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Free NATA College Predictor 2026',
      description:
        'Find B.Arch colleges matching your NATA 2026 score. Filter 5000+ colleges by state, fee, and ranking.',
    },
    alternates: {
      canonical: TOOL_URL,
    },
  };
}

const faqs = [
  {
    question: 'How many B.Arch colleges are there in India?',
    answer:
      'India has over 500 colleges offering B.Arch (Bachelor of Architecture) programmes approved by the Council of Architecture (COA). These include government institutions like SPAs and IITs, deemed universities like Manipal and SRM, and private colleges. Our college predictor database covers 5000+ college-programme combinations across all 28 states and 8 union territories, including seat counts, fee structures, and historical cutoff data from 2020 to 2025.',
  },
  {
    question: 'What NATA score is required for IIT B.Arch programmes?',
    answer:
      'IIT Roorkee and IIT Kharagpur offer B.Arch programmes through JEE Advanced + AAT, not directly through NATA. However, many top government colleges accepting NATA scores — such as SPA Delhi, SPA Bhopal, CEPT Ahmedabad, and Jadavpur University — require scores between 110-155 out of 200. Our predictor shows you the exact historical cutoff for each college based on your entered NATA score.',
  },
  {
    question: 'Does the college predictor show state counselling colleges?',
    answer:
      'Yes. Our NATA college predictor includes colleges from both central counselling and state-level counselling processes. Many states like Tamil Nadu, Maharashtra, Karnataka, and West Bengal conduct separate B.Arch admission counselling using NATA scores. The tool lets you filter by state to see all colleges available through your state counselling process along with their expected cutoffs.',
  },
  {
    question: 'Can I filter colleges by fee range?',
    answer:
      'Yes, the college predictor allows filtering by annual fee range. Government B.Arch colleges typically charge Rs 30,000 to Rs 1,50,000 per year, while private colleges range from Rs 1,00,000 to Rs 5,00,000 per year. You can set minimum and maximum fee limits to see only colleges within your budget. The tool shows both tuition fees and estimated total cost including hostel.',
  },
  {
    question: 'How is the NATA college prediction calculated?',
    answer:
      'Our prediction algorithm uses 5 years of historical admission data (2020-2025) including opening and closing ranks, category-wise cutoffs, and seat filling trends. When you enter your NATA score, we calculate your estimated percentile and match it against the closing cutoff of each college. Colleges are categorized as Safe (high chance), Moderate (reasonable chance), and Reach (competitive chance) based on the gap between your score and historical cutoffs.',
  },
  {
    question: 'Is the NATA college predictor completely free?',
    answer:
      'Yes, the NATA college predictor by Neram Classes is 100% free. There are no hidden charges, no premium tiers, and no limits on the number of predictions you can make. You need to create a free account to access the full tool, which takes less than a minute. We believe every NATA aspirant deserves access to quality college guidance without financial barriers.',
  },
];

const steps = [
  {
    number: '1',
    title: 'Enter Your NATA Score',
    description: 'Input your actual or expected NATA 2026 score out of 200. You can also enter scores for both sessions.',
  },
  {
    number: '2',
    title: 'Set Your Preferences',
    description: 'Filter by preferred states, fee range, college type (government/private), and your reservation category.',
  },
  {
    number: '3',
    title: 'View Matching Colleges',
    description: 'See a ranked list of B.Arch colleges categorized as Safe, Moderate, or Reach based on your score.',
  },
  {
    number: '4',
    title: 'Compare & Shortlist',
    description: 'Compare colleges side-by-side on fees, ranking, placement data, and add them to your shortlist for counselling.',
  },
];

const features = [
  '5000+ college-programme combinations across India',
  'State-wise filtering for all 28 states and 8 UTs',
  'Category-wise predictions (General, OBC, SC, ST, EWS)',
  'Fee range filter — find colleges within your budget',
  'Safe / Moderate / Reach classification for each college',
  'Historical cutoff trends from 2020 to 2025',
  'College type filter — Government, Private, Deemed University',
  'Completely free with unlimited predictions',
];

export default function CollegePredictorPage() {
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: APP_URL },
      { '@type': 'ListItem', position: 2, name: 'Tools', item: `${APP_URL}/tools` },
      { '@type': 'ListItem', position: 3, name: 'College Predictor', item: TOOL_URL },
    ],
  };

  const webAppSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: TOOL_NAME,
    applicationCategory: 'EducationalApplication',
    applicationSubCategory: 'College Admission Predictor',
    url: TOOL_URL,
    operatingSystem: 'Web',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
    description:
      'Free NATA 2026 college predictor. Enter your NATA score and find matching B.Arch colleges across India filtered by state, fee, ranking, and category.',
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
      audienceType: 'NATA 2026 aspirants seeking B.Arch admission',
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
            Free NATA College Predictor 2026 — Find B.Arch Colleges by Your Score
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
            The NATA College Predictor tells you which architecture colleges in India match your NATA 2026
            score. Enter your total marks out of 200 and instantly get a list of B.Arch colleges where you
            have a realistic chance of admission. The tool covers 5000+ college-programme combinations
            across all Indian states, with filters for fee range, college type (government or private),
            reservation category, and state preferences. Each college is classified as Safe, Moderate, or
            Reach based on 5 years of historical admission data from 2020 to 2025. Whether you scored 80
            or 160, this predictor shows you every college option available to you — from top government
            SPAs to affordable private institutions — so you can plan your B.Arch counselling strategy
            with confidence.
          </Typography>

          <Button
            component={Link}
            href={PROTECTED_URL}
            variant="contained"
            size="large"
            sx={{ px: 4, py: 1.5, fontSize: { xs: '1rem', md: '1.1rem' }, fontWeight: 600 }}
          >
            Predict My Colleges Free
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
            How the NATA College Predictor Works
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
            Key Features of the College Prediction Tool
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

        {/* College Tiers by Score */}
        <Box sx={{ mb: { xs: 4, md: 6 } }}>
          <Typography
            variant="h4"
            component="h2"
            gutterBottom
            sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', md: '2rem' }, textAlign: 'center', mb: 3 }}
          >
            NATA Score vs College Tiers (2026 Estimates)
          </Typography>

          <Paper variant="outlined" sx={{ maxWidth: 750, mx: 'auto', overflow: 'hidden' }}>
            {[
              { range: '150 - 200', tier: 'Tier 1 — Top Government SPAs & NITs', examples: 'SPA Delhi, CEPT, Jadavpur' },
              { range: '120 - 149', tier: 'Tier 2 — Good Government & Top Private', examples: 'SPA Bhopal, BIT Mesra, Manipal' },
              { range: '90 - 119', tier: 'Tier 3 — State Government & Mid Private', examples: 'State govt colleges, SRM, VIT' },
              { range: '70 - 89', tier: 'Tier 4 — Private Colleges', examples: 'Regional private B.Arch colleges' },
              { range: 'Below 70', tier: 'Tier 5 — Limited Options', examples: 'Select private colleges with lower cutoffs' },
            ].map((row, i) => (
              <Box
                key={row.range}
                sx={{
                  display: 'flex',
                  flexDirection: { xs: 'column', sm: 'row' },
                  px: 3,
                  py: 2,
                  bgcolor: i % 2 === 0 ? 'grey.50' : 'white',
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  gap: { xs: 0.5, sm: 2 },
                }}
              >
                <Typography variant="body1" fontWeight={700} sx={{ minWidth: 100 }}>
                  {row.range}
                </Typography>
                <Box>
                  <Typography variant="body1" fontWeight={600}>
                    {row.tier}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {row.examples}
                  </Typography>
                </Box>
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
            Who Should Use the NATA College Predictor?
          </Typography>

          <Grid container spacing={2} sx={{ maxWidth: 900, mx: 'auto' }}>
            {[
              {
                title: 'NATA 2026 Aspirants',
                desc: 'Students who have taken or are preparing for NATA and want to know which colleges they can realistically target based on their score.',
              },
              {
                title: 'Parents Planning Finances',
                desc: 'Parents who want to understand the fee ranges of colleges their child may qualify for, helping them plan education expenses early.',
              },
              {
                title: 'Counselling Candidates',
                desc: 'Students going through state or central B.Arch counselling who need a quick reference of colleges accepting their score range.',
              },
              {
                title: 'Career Counsellors',
                desc: 'School and independent career counsellors guiding students on architecture career paths and college options after NATA.',
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
            Frequently Asked Questions — NATA College Predictor
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
            Find Your Dream Architecture College Today
          </Typography>
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ maxWidth: 600, mx: 'auto', mb: 3, lineHeight: 1.7 }}
          >
            Enter your NATA score and discover 5000+ B.Arch colleges that match your marks.
            Filter by state, fees, and ranking to build your perfect college shortlist. Completely free.
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

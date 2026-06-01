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
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Stack,
} from '@neram/ui';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  generateOrganizationSchema,
  generateBreadcrumbSchema,
  generateFAQSchema,
  generateItemListSchema,
} from '@/lib/seo/schemas';
import { buildAlternates, buildOgImage } from '@/lib/seo/metadata';
import { BASE_URL } from '@/lib/seo/constants';

export const revalidate = 86400;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const title = 'Neram vs BRDS vs SILICA: Best NATA Online Coaching 2026 Compared';
  const description =
    'Honest comparison of the top 3 NATA online coaching institutes in India: Neram Classes, BRDS, and SILICA. Compare fees, batch size, faculty, mock tests, locations, and success rates side by side.';
  return {
    title,
    description,
    keywords:
      'NATA online coaching comparison, Neram vs BRDS, Neram vs SILICA, BRDS vs SILICA, best NATA coaching institute, NATA coaching fees comparison, top NATA online coaching India, NATA coaching reviews',
    alternates: buildAlternates(locale, '/nata-online-coaching/comparison'),
    openGraph: {
      title,
      description,
      type: 'website',
      url: `${BASE_URL}/nata-online-coaching/comparison`,
      images: [
        {
          url: buildOgImage('NATA Online Coaching Compared', 'Neram vs BRDS vs SILICA', 'coaching'),
          width: 1200,
          height: 630,
          alt: 'NATA Online Coaching Comparison 2026',
        },
      ],
    },
  };
}

interface Institute {
  name: string;
  founded: string;
  presence: string;
  batchSize: string;
  faculty: string;
  feeRange: string;
  mockTests: string;
  drawingFocus: string;
  freeApp: string;
  freeDemo: string;
  publicResults: string;
  languages: string;
  hybridSwitch: string;
}

const institutes: Institute[] = [
  {
    name: 'Neram Classes',
    founded: '2009 (16+ years)',
    presence: '150+ cities, online + offline hybrid, 6 Gulf countries',
    batchSize: 'Max 25 students per batch',
    faculty: 'NIT, IIT, SPA alumni',
    feeRange: 'Rs. 15,000 to Rs. 30,000 (3-month to 2-year)',
    mockTests: '100+ mock tests with detailed analysis',
    drawingFocus: 'Daily 2-hour supervised drawing sessions with live critique',
    freeApp: 'Yes, free AI study app with cutoff calculator, college predictor for 5,000+ colleges, exam centre locator',
    freeDemo: 'Yes, free live demo class',
    publicResults: '99.9% success rate, 10,000+ students trained, 500+ admissions to top colleges in last 3 years',
    languages: '5 languages: English, Tamil, Hindi, Kannada, Malayalam',
    hybridSwitch: 'Yes, switch between online and offline anytime at no extra cost',
  },
  {
    name: 'BRDS',
    founded: 'Stated 2005 on brdsindia.com (19+ years)',
    presence: '72+ centres across India per brdsindia.com',
    batchSize: 'Not specified on public website',
    faculty: 'Architect-led faculty per their website',
    feeRange: 'Not listed publicly on the landing page',
    mockTests: 'Mock tests included, count not publicly stated',
    drawingFocus: 'Drawing coaching included',
    freeApp: 'No dedicated study app listed publicly',
    freeDemo: 'Trial class on request',
    publicResults: '895 NATA 2025 selections per brdsindia.com results page',
    languages: 'Primarily English, regional support not specified',
    hybridSwitch: 'Online + offline batches available; switching policy not stated publicly',
  },
  {
    name: 'SILICA Institute',
    founded: 'Operating multi-city per silica.co.in',
    presence: '25 centres across India per silica.co.in',
    batchSize: 'Not specified on public website',
    faculty: 'Architect-led faculty per their website',
    feeRange: 'Not listed publicly on the landing page',
    mockTests: 'Mock tests included, count not publicly stated',
    drawingFocus: 'Drawing kit and free trial lesson available',
    freeApp: 'No dedicated study app listed publicly',
    freeDemo: 'Free trial lesson advertised',
    publicResults: '734 NATA 2025 selections, 200+ scored above 100 per silica.co.in',
    languages: 'Primarily English',
    hybridSwitch: 'Online + offline batches; switching policy not stated publicly',
  },
];

const comparisonRows: Array<{ label: string; key: keyof Institute; note?: string }> = [
  { label: 'Founded / Experience', key: 'founded' },
  { label: 'Presence', key: 'presence' },
  { label: 'Batch Size', key: 'batchSize', note: 'Smaller batches mean more individual attention.' },
  { label: 'Faculty Profile', key: 'faculty' },
  { label: 'Published Fees', key: 'feeRange', note: 'Transparent pricing helps you budget upfront.' },
  { label: 'Mock Tests', key: 'mockTests' },
  { label: 'Drawing Practice', key: 'drawingFocus' },
  { label: 'Free Study App', key: 'freeApp' },
  { label: 'Free Demo Class', key: 'freeDemo' },
  { label: 'Public Results (NATA 2025)', key: 'publicResults' },
  { label: 'Language Coverage', key: 'languages' },
  { label: 'Online + Offline Switch', key: 'hybridSwitch' },
];

const switchReasons = [
  {
    title: 'Transparent fees from the start',
    body:
      'Neram Classes publishes course fees (Rs. 15,000 to Rs. 30,000) directly on the website. Competitor institutes typically require a form submission and counsellor call before sharing fees, which delays decision-making for parents.',
  },
  {
    title: 'Smaller batch sizes by design',
    body:
      'A max of 25 students per batch is a hard cap at Neram Classes. This gives every student personalised feedback on drawing submissions and direct faculty access, something that is hard to maintain at scale.',
  },
  {
    title: 'Free AI-powered study tools',
    body:
      'The free Neram AI study app includes a NATA cutoff calculator, a college predictor for 5,000+ colleges, an exam centre locator, and a question bank. No other major NATA institute offers a dedicated study app at this depth.',
  },
  {
    title: '5-language coaching',
    body:
      'Tamil, Hindi, Kannada, and Malayalam students can choose a language batch during enrolment. Drawing and aptitude content stays language-neutral; conceptual explanations are delivered in the student\'s chosen language.',
  },
  {
    title: 'Hybrid model with seamless switching',
    body:
      'Students can switch attendance between online and offline batches anytime at no additional fee. Useful for students who relocate mid-program or want offline revision phases before the exam.',
  },
];

export default function NataCoachingComparisonPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);

  const pageUrl = `${BASE_URL}/nata-online-coaching/comparison`;

  const faqs = [
    {
      question: 'Which is the best NATA online coaching in India for 2026?',
      answer:
        'There is no single answer that fits every student. Neram Classes, BRDS, and SILICA all have published track records. Neram differentiates on transparent fees, max 25-student batches, a free AI study app, and 5-language coaching. BRDS leads on per-year selection counts. SILICA leads on multi-exam coverage. Decide based on which of these factors matters most to you.',
    },
    {
      question: 'How do NATA online coaching fees compare?',
      answer:
        'Neram Classes publishes fees from Rs. 15,000 (3-month crash) to Rs. 30,000 (2-year program) directly on the website. BRDS and SILICA do not publicly publish their NATA online coaching fees as of the last public check; students must submit a form or call to get a quote.',
    },
    {
      question: 'Which institute has the smallest batch size?',
      answer:
        'Neram Classes caps batches at 25 students. BRDS and SILICA do not publicly state batch size limits, so verify this directly with each institute before enrolling.',
    },
    {
      question: 'Which institute offers free study tools?',
      answer:
        'Neram Classes is the only major NATA institute with a free AI-powered study app (aiArchitek) covering cutoff calculator, college predictor for 5,000+ colleges, exam centre locator, and a question bank. BRDS and SILICA do not publicly offer a comparable free app.',
    },
    {
      question: 'Can I get NATA online coaching in Tamil or Hindi?',
      answer:
        'Neram Classes offers NATA coaching in 5 languages: English, Tamil, Hindi, Kannada, and Malayalam. BRDS and SILICA primarily teach in English based on their public websites.',
    },
    {
      question: 'How does success rate compare across institutes?',
      answer:
        'Neram publishes a 99.9% success rate (students clearing NATA cutoff) and 10,000+ total students trained since 2009. BRDS publishes 895 NATA 2025 selections (with year-over-year trend on their site). SILICA publishes 734 NATA 2025 selections and 200+ students scoring above 100. Success metrics are measured differently, so compare like-for-like before relying on any single number.',
    },
    {
      question: 'Should I pick the largest institute or a smaller, more focused one?',
      answer:
        'Larger institutes (BRDS, SILICA) have more physical centres and brand depth. Smaller-batch, hybrid institutes (Neram Classes) offer more personalised attention and faster decision support. Match the choice to your learning style: if you need close mentoring and drawing critique, smaller batches matter more.',
    },
  ];

  return (
    <>
      <JsonLd data={generateOrganizationSchema()} />
      <JsonLd
        data={generateItemListSchema(
          institutes.map((inst, index) => ({
            name: inst.name,
            description: `${inst.faculty}, ${inst.presence}. ${inst.publicResults}`,
            ...(index === 0 ? { url: BASE_URL } : {}),
          }))
        )}
      />
      <JsonLd data={generateFAQSchema(faqs)} />
      <JsonLd
        data={generateBreadcrumbSchema([
          { name: 'Home', url: BASE_URL },
          { name: 'NATA Online Coaching', url: `${BASE_URL}/nata-online-coaching` },
          { name: 'Comparison' },
        ])}
      />

      <Box>
        {/* Hero */}
        <Box
          sx={{
            py: { xs: 7, md: 11 },
            background: 'linear-gradient(135deg, #1a237e 0%, #0d47a1 100%)',
            color: 'white',
          }}
        >
          <Container maxWidth="lg">
            <Chip
              label="NATA 2026: Coaching Comparison"
              sx={{ bgcolor: 'white', color: 'primary.main', mb: 2, fontWeight: 600 }}
            />
            <Typography
              variant="h1"
              component="h1"
              gutterBottom
              sx={{ fontWeight: 700, fontSize: { xs: '1.9rem', md: '3rem' }, lineHeight: 1.2 }}
            >
              Neram vs BRDS vs SILICA: NATA online coaching compared
            </Typography>
            <Typography variant="h5" sx={{ opacity: 0.92, lineHeight: 1.6, maxWidth: 820 }}>
              An honest, factual side-by-side comparison of the three most-searched NATA online coaching
              institutes in India. Based on each institute&rsquo;s own public claims.
            </Typography>
          </Container>
        </Box>

        {/* Disclosure */}
        <Box sx={{ py: 3, bgcolor: 'warning.50', borderBottom: '1px solid', borderColor: 'warning.light' }}>
          <Container maxWidth="lg">
            <Typography variant="body2" sx={{ color: 'warning.dark', fontWeight: 500 }}>
              Disclosure: We are Neram Classes. The comparison below is built only from each institute&rsquo;s
              own publicly available website data. We do not republish unverified claims. If any
              competitor publishes more detail in future, this page will be updated.
            </Typography>
          </Container>
        </Box>

        {/* Comparison Table - Desktop */}
        <Box sx={{ py: { xs: 6, md: 9 }, bgcolor: 'background.default' }}>
          <Container maxWidth="lg">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 5 }}>
              Side-by-side comparison
            </Typography>

            <Box sx={{ display: { xs: 'none', md: 'block' } }}>
              <Card>
                <CardContent sx={{ p: 0 }}>
                  {/* Header */}
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: '1.2fr repeat(3, 1fr)',
                      borderBottom: '2px solid',
                      borderColor: 'grey.200',
                    }}
                  >
                    <Box sx={{ p: 2.5, bgcolor: 'grey.100' }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        Feature
                      </Typography>
                    </Box>
                    {institutes.map((inst, idx) => (
                      <Box
                        key={inst.name}
                        sx={{
                          p: 2.5,
                          bgcolor: idx === 0 ? 'primary.main' : 'grey.100',
                          color: idx === 0 ? 'white' : 'inherit',
                        }}
                      >
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                          {inst.name}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                  {/* Rows */}
                  {comparisonRows.map((row) => (
                    <Box
                      key={row.label}
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: '1.2fr repeat(3, 1fr)',
                        borderBottom: '1px solid',
                        borderColor: 'grey.100',
                      }}
                    >
                      <Box sx={{ p: 2.5 }}>
                        <Typography variant="body1" sx={{ fontWeight: 600 }}>
                          {row.label}
                        </Typography>
                        {row.note && (
                          <Typography variant="caption" color="text.secondary">
                            {row.note}
                          </Typography>
                        )}
                      </Box>
                      {institutes.map((inst, idx) => (
                        <Box
                          key={inst.name}
                          sx={{
                            p: 2.5,
                            bgcolor: idx === 0 ? 'primary.50' : 'inherit',
                          }}
                        >
                          <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
                            {inst[row.key]}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  ))}
                </CardContent>
              </Card>
            </Box>

            {/* Comparison Cards - Mobile */}
            <Box sx={{ display: { xs: 'block', md: 'none' } }}>
              {institutes.map((inst, idx) => (
                <Card
                  key={inst.name}
                  sx={{
                    mb: 3,
                    border: idx === 0 ? '2px solid' : '1px solid',
                    borderColor: idx === 0 ? 'primary.main' : 'grey.300',
                  }}
                >
                  <CardContent>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                      <Typography variant="h6" sx={{ fontWeight: 700 }}>
                        {inst.name}
                      </Typography>
                      {idx === 0 && (
                        <Chip label="This Site" size="small" sx={{ bgcolor: 'primary.main', color: 'white', fontWeight: 600 }} />
                      )}
                    </Stack>
                    {comparisonRows.map((row) => (
                      <Box key={row.label} sx={{ mb: 1.5 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                          {row.label}
                        </Typography>
                        <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
                          {inst[row.key]}
                        </Typography>
                      </Box>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </Box>
          </Container>
        </Box>

        {/* Why students switch */}
        <Box sx={{ py: { xs: 6, md: 9 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="lg">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 2 }}>
              Why students switch to Neram Classes
            </Typography>
            <Typography variant="h6" align="center" color="text.secondary" sx={{ mb: 5, maxWidth: 700, mx: 'auto' }}>
              Five factual differentiators that come up most often in counselling calls
            </Typography>
            <Grid container spacing={3}>
              {switchReasons.map((reason, idx) => (
                <Grid item xs={12} md={6} key={reason.title}>
                  <Card sx={{ height: '100%', p: 3 }}>
                    <Stack direction="row" alignItems="flex-start" spacing={2}>
                      <Box
                        sx={{
                          minWidth: 40,
                          height: 40,
                          borderRadius: '50%',
                          bgcolor: 'primary.main',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                        }}
                      >
                        {idx + 1}
                      </Box>
                      <Box>
                        <Typography variant="h6" gutterBottom sx={{ fontWeight: 700 }}>
                          {reason.title}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
                          {reason.body}
                        </Typography>
                      </Box>
                    </Stack>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* FAQ */}
        <Box sx={{ py: { xs: 6, md: 9 }, bgcolor: 'background.default' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 5 }}>
              Comparison FAQ
            </Typography>
            {faqs.map((faq) => (
              <Accordion
                key={faq.question}
                disableGutters
                sx={{
                  '&:before': { display: 'none' },
                  mb: 1,
                  borderRadius: 1,
                  overflow: 'hidden',
                }}
              >
                <AccordionSummary
                  expandIcon={<Typography sx={{ fontSize: '1.2rem', fontWeight: 600 }}>+</Typography>}
                  sx={{ bgcolor: 'white', minHeight: 48, '&:hover': { bgcolor: 'grey.100' } }}
                >
                  <Typography sx={{ fontWeight: 600 }}>{faq.question}</Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ bgcolor: 'white' }}>
                  <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.8 }}>
                    {faq.answer}
                  </Typography>
                </AccordionDetails>
              </Accordion>
            ))}
          </Container>
        </Box>

        {/* CTA */}
        <Box
          sx={{
            py: { xs: 8, md: 12 },
            pb: { xs: 14, md: 12 },
            background: 'linear-gradient(135deg, #0d47a1 0%, #1565c0 100%)',
            color: 'white',
            textAlign: 'center',
          }}
        >
          <Container maxWidth="md">
            <Typography variant="h3" component="h2" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '1.7rem', md: '2.4rem' } }}>
              Try a free demo before you decide
            </Typography>
            <Typography variant="h6" sx={{ mb: 4, opacity: 0.9, lineHeight: 1.6 }}>
              Attend a live Neram Classes session, meet the faculty, and compare for yourself. No commitment.
            </Typography>
            <Stack direction="row" spacing={2} justifyContent="center" flexWrap="wrap" useFlexGap>
              <Button
                variant="contained"
                size="large"
                component={Link}
                href="/demo-class"
                sx={{ bgcolor: 'white', color: 'primary.main', fontWeight: 600, px: 4, minHeight: 48 }}
              >
                Book Free Demo
              </Button>
              <Button
                variant="outlined"
                size="large"
                component={Link}
                href="/nata-online-coaching"
                sx={{ borderColor: 'white', color: 'white', fontWeight: 600, px: 4, minHeight: 48 }}
              >
                Back to NATA Online Coaching
              </Button>
            </Stack>
          </Container>
        </Box>
      </Box>
    </>
  );
}

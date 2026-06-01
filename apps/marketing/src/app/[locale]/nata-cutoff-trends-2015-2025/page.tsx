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
  generateArticleSchema,
} from '@/lib/seo/schemas';
import { buildAlternates, buildOgImage } from '@/lib/seo/metadata';
import { BASE_URL } from '@/lib/seo/constants';

export const revalidate = 86400;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const title = 'NATA Cutoff Trends 2015 to 2025: Year-Wise Analysis | Neram Classes';
  const description =
    'A 10-year NATA cutoff trend analysis covering top architecture colleges in India. Year-wise qualifying scores, college-level cutoff patterns, and what they mean for NATA 2026 aspirants.';
  return {
    title,
    description,
    keywords:
      'NATA cutoff, NATA cutoff trends, NATA qualifying score, NATA cutoff 2025, NATA cutoff 2024, NATA cutoff 2023, NATA cutoff history, NATA score for SPA Delhi, NATA score for NIT Trichy, NATA cutoff for top colleges, architecture college cutoff',
    alternates: buildAlternates(locale, '/nata-cutoff-trends-2015-2025'),
    openGraph: {
      title,
      description,
      type: 'article',
      url: `${BASE_URL}/nata-cutoff-trends-2015-2025`,
      images: [
        {
          url: buildOgImage('NATA Cutoff Trends 2015 to 2025', 'Year-wise architecture college cutoffs', 'nata'),
          width: 1200,
          height: 630,
          alt: 'NATA Cutoff Trends 2015 to 2025',
        },
      ],
    },
  };
}

interface TrendPeriod {
  range: string;
  qualifyingScore: string;
  topCollegeBand: string;
  takeaway: string;
}

const trendPeriods: TrendPeriod[] = [
  {
    range: '2015 to 2017',
    qualifyingScore: 'Around 70 to 80 marks out of 200',
    topCollegeBand: 'SPA Delhi, CEPT, NIT Trichy: aspirants scoring 130+ admitted',
    takeaway:
      'Pre-revision era. NATA was a paper-based exam with one drawing test and an aesthetic-sensitivity test.',
  },
  {
    range: '2018 to 2019',
    qualifyingScore: 'Stabilised at 75 marks out of 200',
    topCollegeBand: 'Top colleges admitted students scoring 120 to 140',
    takeaway:
      'CoA introduced computer-based MCQ section. Drawing weightage redistributed; raw scoring became less predictable year-over-year.',
  },
  {
    range: '2020 to 2021',
    qualifyingScore: 'Around 75 marks; multiple test attempts allowed',
    topCollegeBand: 'Cutoffs for SPA Delhi, NIT Trichy hovered around 130 to 145',
    takeaway:
      'Pandemic disruption: NATA was held in 3 phases (2020) and 2 phases (2021). Best-of-multiple-attempts policy raised effective median scores.',
  },
  {
    range: '2022 to 2023',
    qualifyingScore: '75 to 80 marks out of 200 across phases',
    topCollegeBand: 'NIT Trichy: ~140 to 150; SPA Bhopal: ~125 to 135; state-tier colleges: 100 to 115',
    takeaway:
      'Drawing test moved fully online (digital tablet input experimented). Aspirant pool grew; tier-2 college cutoffs climbed roughly 5 to 10 marks.',
  },
  {
    range: '2024 to 2025',
    qualifyingScore: '75 marks qualifying, 70th percentile cutoff for top institutes',
    topCollegeBand: 'NIT Trichy B.Arch: 145+, SPA Delhi: 140+, top state institutes: 120+',
    takeaway:
      'Percentile-based scoring (Phase 1) reduced raw-mark predictability. Coaching focus shifted from rote drawing to multi-modal aptitude.',
  },
];

const collegeBandRows = [
  {
    band: 'AIR top tier (SPA Delhi, NIT Trichy, CEPT, IIT Roorkee/Kharagpur B.Arch)',
    nataScoreBand: '140 to 160',
    note: 'JEE Paper 2 + NATA combined cycle recommended.',
  },
  {
    band: 'Premier state (SPA Bhopal, JJ Mumbai, Anna University SAP, Chandigarh CoA)',
    nataScoreBand: '125 to 145',
    note: 'NATA dominant, state cutoff varies by category.',
  },
  {
    band: 'Tier-2 state institutes (MEASI, BMS, RV, Hindustan, JNAFAU, Karpagam)',
    nataScoreBand: '105 to 130',
    note: 'Score band stable over 5 years. Drawing scoring tightened.',
  },
  {
    band: 'Tier-3 / private colleges',
    nataScoreBand: '80 to 110',
    note: 'NATA-qualified status enough; institute fee structures vary widely.',
  },
];

const faqs = [
  {
    question: 'What is a good NATA score for top architecture colleges?',
    answer:
      'For 2026 admissions, a score of 140+ out of 200 is competitive for top-tier institutes like SPA Delhi, NIT Trichy, and CEPT Ahmedabad. State-premier institutes (SPA Bhopal, JJ Mumbai, Anna University SAP) typically admit students scoring 125 to 145. Tier-2 institutes admit from a wider range of 105 to 130.',
  },
  {
    question: 'Has the NATA cutoff increased over the years?',
    answer:
      'Cutoffs for top-tier colleges (SPA Delhi, NIT Trichy) have risen modestly over the last 5 years as the aspirant pool grew and percentile-based scoring tightened the top end. Tier-2 college cutoffs have been more stable. The "qualifying score" at 75 out of 200 has stayed largely consistent across years.',
  },
  {
    question: 'Why is NATA cutoff different from the qualifying score?',
    answer:
      'The NATA "qualifying score" (around 75 out of 200) is the minimum mark the Council of Architecture sets to declare a candidate NATA-qualified. The "cutoff" for any specific college is the lowest NATA score it actually admitted in a given year, which can be much higher. Always compare your score to the specific college\'s historical cutoff, not just the qualifying score.',
  },
  {
    question: 'What is the trend for SPA Delhi NATA cutoff?',
    answer:
      'Based on publicly available SPA Delhi B.Arch admissions data, the indicative NATA score band for admission has trended from ~130 (2017) to ~140+ (2024). Final cutoff depends on JEE Paper 2 score (SPA admits via both routes) and category-wise reservation.',
  },
  {
    question: 'Do private architecture colleges have NATA cutoffs?',
    answer:
      'Most private architecture colleges in India require a valid NATA score for B.Arch admission but do not publish strict cutoffs. They admit any NATA-qualified candidate (75+ score), then apply their own merit criteria (10+2 marks, drawing portfolio, personal interview).',
  },
  {
    question: 'How do I check the live cutoff for a specific college?',
    answer:
      'Use the Neram Classes free Cutoff Calculator. Enter your NATA score, expected category, and preferred state, and the calculator returns your admission probability for 5,000+ colleges including SPA Delhi, NIT Trichy, CEPT, Anna University, and major state institutes.',
  },
  {
    question: 'Will the NATA 2026 cutoff increase compared to 2025?',
    answer:
      'Most likely yes for top-tier colleges, because (a) the NATA aspirant pool keeps growing year-over-year, and (b) percentile-based scoring rewards the top of the distribution. Tier-2 cutoffs are likely to stay stable. Plan your preparation to target 140+ out of 200 if you are aiming for SPA Delhi, NIT Trichy, or CEPT.',
  },
];

export default function NataCutoffTrendsPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);

  const pageUrl = `${BASE_URL}/nata-cutoff-trends-2015-2025`;

  return (
    <>
      <JsonLd data={generateOrganizationSchema()} />
      <JsonLd
        data={generateArticleSchema({
          title: 'NATA Cutoff Trends 2015 to 2025: 10-Year Analysis',
          description:
            'A 10-year analysis of NATA qualifying scores and top architecture college cutoffs in India, with year-wise trend commentary for NATA 2026 aspirants.',
          url: pageUrl,
          publishedAt: '2026-05-21',
          modifiedAt: '2026-05-21',
          author: 'Neram Classes',
          category: 'NATA Exam Analysis',
        })}
      />
      <JsonLd data={generateFAQSchema(faqs)} />
      <JsonLd
        data={generateBreadcrumbSchema([
          { name: 'Home', url: BASE_URL },
          { name: 'NATA 2026', url: `${BASE_URL}/nata-2026` },
          { name: 'NATA Cutoff Trends 2015 to 2025' },
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
              label="10-Year Analysis: NATA 2015 to 2025"
              sx={{ bgcolor: 'white', color: 'primary.main', mb: 2, fontWeight: 600 }}
            />
            <Typography
              variant="h1"
              component="h1"
              gutterBottom
              sx={{ fontWeight: 700, fontSize: { xs: '1.9rem', md: '3rem' }, lineHeight: 1.2 }}
            >
              NATA Cutoff Trends 2015 to 2025
            </Typography>
            <Typography variant="h5" sx={{ opacity: 0.92, lineHeight: 1.6, maxWidth: 820 }}>
              How NATA qualifying scores and top architecture college cutoffs have shifted across a decade.
              Plan your NATA 2026 target with data, not guesswork.
            </Typography>
          </Container>
        </Box>

        {/* Intro */}
        <Box sx={{ py: { xs: 5, md: 7 }, bgcolor: 'background.default' }}>
          <Container maxWidth="md">
            <Typography variant="body1" sx={{ lineHeight: 1.8, fontSize: '1.05rem', color: 'text.secondary', mb: 3 }}>
              The Council of Architecture (CoA) sets the NATA qualifying score every year, and individual
              architecture colleges set their own admission cutoffs on top of that. This page tracks how
              both have moved across the last decade, so you know what score to aim for in NATA 2026.
            </Typography>
            <Typography variant="body1" sx={{ lineHeight: 1.8, fontSize: '1.05rem', color: 'text.secondary' }}>
              We synthesise data from the CoA portal, JoSAA and CSAB closing ranks, TNEA B.Arch counselling
              data, and state-level admission records to build this trend view. For live admission
              probability against your exact score, use our free NATA cutoff calculator.
            </Typography>
            <Box sx={{ mt: 3 }}>
              <Button
                variant="contained"
                size="large"
                component={Link}
                href="/tools/cutoff-calculator"
                sx={{ fontWeight: 600, minHeight: 48 }}
              >
                Try Free NATA Cutoff Calculator
              </Button>
            </Box>
          </Container>
        </Box>

        {/* Trend timeline */}
        <Box sx={{ py: { xs: 6, md: 9 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="lg">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 5 }}>
              NATA cutoff trend by period
            </Typography>
            <Grid container spacing={3}>
              {trendPeriods.map((period) => (
                <Grid item xs={12} md={6} lg={4} key={period.range}>
                  <Card sx={{ height: '100%', p: 3, borderTop: '4px solid', borderColor: 'primary.main' }}>
                    <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>
                      {period.range}
                    </Typography>
                    <List dense>
                      <ListItem sx={{ px: 0 }}>
                        <ListItemIcon sx={{ minWidth: 28 }}>
                          <Typography color="primary.main" sx={{ fontWeight: 700 }}>
                            ·
                          </Typography>
                        </ListItemIcon>
                        <ListItemText
                          primary="Qualifying score"
                          secondary={period.qualifyingScore}
                          primaryTypographyProps={{ fontWeight: 600, fontSize: '0.95rem' }}
                          secondaryTypographyProps={{ fontSize: '0.95rem' }}
                        />
                      </ListItem>
                      <ListItem sx={{ px: 0 }}>
                        <ListItemIcon sx={{ minWidth: 28 }}>
                          <Typography color="primary.main" sx={{ fontWeight: 700 }}>
                            ·
                          </Typography>
                        </ListItemIcon>
                        <ListItemText
                          primary="Top college admission band"
                          secondary={period.topCollegeBand}
                          primaryTypographyProps={{ fontWeight: 600, fontSize: '0.95rem' }}
                          secondaryTypographyProps={{ fontSize: '0.95rem' }}
                        />
                      </ListItem>
                    </List>
                    <Typography variant="body2" sx={{ color: 'text.secondary', mt: 2, fontStyle: 'italic', lineHeight: 1.6 }}>
                      {period.takeaway}
                    </Typography>
                  </Card>
                </Grid>
              ))}
            </Grid>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 3, textAlign: 'center' }}>
              Indicative bands compiled from CoA portal, JoSAA / CSAB closing ranks, TNEA B.Arch
              counselling data, and college-published admission lists. Bands vary by category and round.
            </Typography>
          </Container>
        </Box>

        {/* College band table */}
        <Box sx={{ py: { xs: 6, md: 9 }, bgcolor: 'background.default' }}>
          <Container maxWidth="lg">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 5 }}>
              NATA 2026 target scores by college tier
            </Typography>

            <Box sx={{ display: { xs: 'none', md: 'block' } }}>
              <Card>
                <CardContent sx={{ p: 0 }}>
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 1fr 2fr',
                      borderBottom: '2px solid',
                      borderColor: 'grey.200',
                    }}
                  >
                    <Box sx={{ p: 2.5, bgcolor: 'grey.100' }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        College Tier
                      </Typography>
                    </Box>
                    <Box sx={{ p: 2.5, bgcolor: 'primary.main', color: 'white' }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        NATA Score Band (out of 200)
                      </Typography>
                    </Box>
                    <Box sx={{ p: 2.5, bgcolor: 'grey.100' }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        Notes
                      </Typography>
                    </Box>
                  </Box>
                  {collegeBandRows.map((row) => (
                    <Box
                      key={row.band}
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: '2fr 1fr 2fr',
                        borderBottom: '1px solid',
                        borderColor: 'grey.100',
                      }}
                    >
                      <Box sx={{ p: 2.5 }}>
                        <Typography variant="body1" sx={{ fontWeight: 600 }}>
                          {row.band}
                        </Typography>
                      </Box>
                      <Box sx={{ p: 2.5, bgcolor: 'primary.50' }}>
                        <Typography variant="body1" sx={{ fontWeight: 700, color: 'primary.dark' }}>
                          {row.nataScoreBand}
                        </Typography>
                      </Box>
                      <Box sx={{ p: 2.5 }}>
                        <Typography variant="body2" color="text.secondary">
                          {row.note}
                        </Typography>
                      </Box>
                    </Box>
                  ))}
                </CardContent>
              </Card>
            </Box>

            <Box sx={{ display: { xs: 'block', md: 'none' } }}>
              {collegeBandRows.map((row) => (
                <Card key={row.band} sx={{ mb: 2 }}>
                  <CardContent>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                      {row.band}
                    </Typography>
                    <Chip
                      label={`${row.nataScoreBand} out of 200`}
                      sx={{ bgcolor: 'primary.main', color: 'white', fontWeight: 600, mb: 1 }}
                    />
                    <Typography variant="body2" color="text.secondary">
                      {row.note}
                    </Typography>
                  </CardContent>
                </Card>
              ))}
            </Box>
          </Container>
        </Box>

        {/* Key takeaways */}
        <Box sx={{ py: { xs: 6, md: 9 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 4 }}>
              5 takeaways for NATA 2026 aspirants
            </Typography>
            <Stack spacing={3}>
              {[
                {
                  title: 'Aim for 140+ if top-tier is your target',
                  body:
                    'SPA Delhi, NIT Trichy, CEPT, and IIT B.Arch admissions in 2024 to 2025 clustered around the 140 to 160 NATA score band. Plan your preparation around this number.',
                },
                {
                  title: 'Tier-2 cutoffs are stable, do not over-stress',
                  body:
                    'For state-premier and tier-2 colleges (Anna University, JNAFAU, MEASI, BMS, RV), the 105 to 130 band has been stable for 5+ years. A focused 90-day prep plan can hit this range.',
                },
                {
                  title: 'Drawing scoring tightened in 2023',
                  body:
                    'Since the CoA shifted drawing evaluation to a standardised rubric, raw drawing marks have less variance. Invest more time in aptitude and mathematics for marginal score gains.',
                },
                {
                  title: 'Multi-attempt strategy raises effective median',
                  body:
                    'NATA allows up to 2 attempts in Phase 1. Plan for both, with revision blocks between attempts. Best-of-both scoring has helped many students lift their final score by 10 to 15 marks.',
                },
                {
                  title: 'Percentile beats raw marks for SPA Delhi',
                  body:
                    'Top institutes increasingly weight percentile rank. A 140 in a high-competition cohort may be the 95th percentile, the actual admission threshold. Watch percentile, not just marks.',
                },
              ].map((item, idx) => (
                <Card key={item.title} sx={{ p: 3 }}>
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
                        {item.title}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
                        {item.body}
                      </Typography>
                    </Box>
                  </Stack>
                </Card>
              ))}
            </Stack>
          </Container>
        </Box>

        {/* FAQ */}
        <Box sx={{ py: { xs: 6, md: 9 }, bgcolor: 'background.default' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 5 }}>
              NATA cutoff FAQ
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
            background: 'linear-gradient(135deg, #0d47a1 0%, #1565c0 100%)',
            color: 'white',
            textAlign: 'center',
          }}
        >
          <Container maxWidth="md">
            <Typography variant="h3" component="h2" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '1.7rem', md: '2.4rem' } }}>
              Use the live NATA cutoff calculator for your exact score
            </Typography>
            <Typography variant="h6" sx={{ mb: 4, opacity: 0.9, lineHeight: 1.6 }}>
              Free tool. Enter your expected NATA score and get admission probability for 5,000+ colleges.
            </Typography>
            <Stack direction="row" spacing={2} justifyContent="center" flexWrap="wrap" useFlexGap>
              <Button
                variant="contained"
                size="large"
                component={Link}
                href="/tools/cutoff-calculator"
                sx={{ bgcolor: 'white', color: 'primary.main', fontWeight: 600, px: 4, minHeight: 48 }}
              >
                Open Cutoff Calculator
              </Button>
              <Button
                variant="outlined"
                size="large"
                component={Link}
                href="/nata-online-coaching"
                sx={{ borderColor: 'white', color: 'white', fontWeight: 600, px: 4, minHeight: 48 }}
              >
                NATA Online Coaching
              </Button>
            </Stack>
          </Container>
        </Box>
      </Box>
    </>
  );
}

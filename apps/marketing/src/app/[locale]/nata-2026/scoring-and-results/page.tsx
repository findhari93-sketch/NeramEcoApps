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
} from '@neram/ui';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema, generateFAQSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import { APP_URL } from '@/lib/seo/constants';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'NATA 2026 Scoring, Qualifying Marks & Results',
    description:
      'NATA 2026 scoring system, qualifying marks (minimum 20 in Part A, 20 in Part B, 60 overall), result dates, multiple attempt scoring rules, and score validity.',
    keywords:
      'NATA 2026 results, NATA qualifying marks, NATA passing marks, NATA score validity, NATA 2026 cutoff, NATA scoring system',
    alternates: buildAlternates(locale, '/nata-2026/scoring-and-results'),
  };
}

interface PageProps {
  params: { locale: string };
}

const faqs = [
  {
    question: 'What are the minimum qualifying marks for NATA 2026?',
    answer:
      'To qualify in NATA 2026, you must score a minimum of 20 marks in Part A (out of 80), 20 marks in Part B (out of 120), and 60 marks overall (out of 200). All three criteria must be met simultaneously.',
  },
  {
    question: 'If I attempt NATA multiple times, which score is considered?',
    answer:
      'The best score among all your attempts is considered for admission. For example, if you score 100 in Attempt 1, 120 in Attempt 2, and 110 in Attempt 3, your score of 120 will be used.',
  },
  {
    question: 'How long is the NATA 2026 score valid?',
    answer:
      'The NATA score is valid for 2 academic years from the date of result declaration. So your NATA 2026 score can be used for admissions in both 2026-27 and 2027-28 academic sessions.',
  },
  {
    question: 'Is there any normalized scoring in NATA?',
    answer:
      'Yes, since Part B is an adaptive test, the scores are normalized across different difficulty levels. The normalization ensures that candidates who get harder questions are not at a disadvantage compared to those who get easier ones.',
  },
];

export default function ScoringResultsPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);
  const baseUrl = 'https://neramclasses.com';

  return (
    <>
      <JsonLd data={generateBreadcrumbSchema([{ name: 'Home', url: baseUrl }, { name: 'NATA 2026', url: `${baseUrl}/${locale}/nata-2026` }, { name: 'Scoring & Results' }])} />
      <JsonLd data={generateFAQSchema(faqs)} />

      <Box>
        {/* Hero */}
        <Box sx={{ py: { xs: 8, md: 12 }, background: 'linear-gradient(135deg, #1a237e 0%, #0d47a1 100%)', color: 'white' }}>
          <Container maxWidth="lg">
            <Chip label="NATA 2026" sx={{ bgcolor: 'white', color: 'primary.main', mb: 2, fontWeight: 600 }} />
            <Typography variant="h1" component="h1" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '2rem', sm: '2.5rem', md: '3.5rem' } }}>
              NATA 2026 Scoring & Results
            </Typography>
            <Typography variant="h5" sx={{ mb: 2, opacity: 0.9, fontSize: { xs: '1.1rem', md: '1.5rem' } }}>
              To qualify in NATA 2026, you need minimum 20 marks in Part A, minimum 20 marks in Part B, and minimum 60 marks overall out of 200. Your best score across all attempts is considered for admission.
            </Typography>
          </Container>
        </Box>

        {/* Qualifying Criteria */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 6, fontWeight: 700 }}>
              Qualifying Marks
            </Typography>

            <Grid container spacing={3}>
              {[
                { part: 'Part A (Drawing)', total: 80, min: 20, color: 'primary.main' },
                { part: 'Part B (MCQ/NCQ)', total: 120, min: 20, color: 'secondary.main' },
                { part: 'Overall', total: 200, min: 60, color: 'success.main' },
              ].map((item) => (
                <Grid item xs={12} sm={4} key={item.part}>
                  <Card sx={{ textAlign: 'center', p: 3, border: '2px solid', borderColor: item.color }}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{item.part}</Typography>
                    <Typography variant="h3" sx={{ fontWeight: 800, color: item.color }}>{item.min}</Typography>
                    <Typography variant="body2" color="text.secondary">out of {item.total}</Typography>
                  </Card>
                </Grid>
              ))}
            </Grid>

            <Card sx={{ mt: 4, bgcolor: 'warning.light', p: 3 }}>
              <Typography variant="body1" sx={{ fontWeight: 600, textAlign: 'center' }}>
                All three criteria must be met simultaneously. Failing even one means you do not qualify.
              </Typography>
            </Card>
          </Container>
        </Box>

        {/* Multiple Attempt Rules */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" gutterBottom sx={{ mb: 4, fontWeight: 700 }}>
              Multiple Attempt Scoring
            </Typography>
            <Card>
              <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                {[
                  'You can attempt NATA up to 3 times per year.',
                  'Each attempt is scored independently.',
                  'Your BEST score among all attempts is considered for admission.',
                  'Colleges use only the best score — they do not see individual attempt scores.',
                  'Registering for all 3 attempts is optional — you can choose any number.',
                  'Each attempt requires separate registration and fee payment.',
                ].map((rule, idx) => (
                  <Box key={idx} sx={{ display: 'flex', gap: 2, py: 1.5, borderBottom: idx < 5 ? '1px solid' : 'none', borderColor: 'divider' }}>
                    <Typography sx={{ fontWeight: 700, color: 'primary.main', minWidth: 24 }}>{idx + 1}.</Typography>
                    <Typography variant="body1" color="text.secondary">{rule}</Typography>
                  </Box>
                ))}
              </CardContent>
            </Card>
          </Container>
        </Box>

        {/* Score Validity */}
        <Box sx={{ py: { xs: 6, md: 8 }, bgcolor: 'background.default' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" gutterBottom sx={{ mb: 3, fontWeight: 700 }}>Score Validity</Typography>
            <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.8 }}>
              The NATA score is valid for <strong>2 academic years</strong> from the date of the result. This means:
            </Typography>
            <Card sx={{ mt: 3, p: 3 }}>
              <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.8 }}>
                If you appear in NATA 2026 and get your result in May 2026, your score is valid for admissions in:{'\n\n'}
                {'\u2022'} Academic year 2026-27 (immediate session){'\n'}
                {'\u2022'} Academic year 2027-28 (next session){'\n\n'}
                This gives you flexibility if you want to take a gap year or improve your score.
              </Typography>
            </Card>
          </Container>
        </Box>

        {/* CTA: Cutoff Calculator */}
        <Box sx={{ py: { xs: 4, md: 6 }, bgcolor: 'grey.50', textAlign: 'center' }}>
          <Container maxWidth="md">
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>Check Which Colleges You Can Get Into</Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              Use our free Cutoff Calculator to see colleges you qualify for based on your expected NATA score.
            </Typography>
            <Button variant="contained" size="large" component="a" href={`${APP_URL}/tools/nata/cutoff-calculator`} target="_blank" rel="noopener noreferrer">
              Open Cutoff Calculator (Free)
            </Button>
          </Container>
        </Box>

        {/* Also Read */}
        <Box sx={{ py: { xs: 6, md: 8 }, bgcolor: 'background.default' }}>
          <Container maxWidth="md">
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>Also Read</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              {[
                { title: 'NATA 2026 Exam Pattern', slug: 'exam-pattern' },
                { title: 'NATA 2026 Syllabus', slug: 'syllabus' },
                { title: 'Cutoff Calculator', slug: 'cutoff-calculator' },
                { title: 'Important Dates', slug: 'important-dates' },
              ].map((item) => (
                <Link key={item.slug} href={`/${locale}/nata-2026/${item.slug}`} style={{ textDecoration: 'none' }}>
                  <Card sx={{ p: 2, color: 'inherit', transition: 'box-shadow 0.2s', '&:hover': { boxShadow: 3 } }}>
                    <Typography variant="subtitle1" color="primary.main" sx={{ fontWeight: 600 }}>{item.title} &rarr;</Typography>
                  </Card>
                </Link>
              ))}
            </Box>
          </Container>
        </Box>

        {/* FAQ */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 4, fontWeight: 700 }}>FAQs — NATA 2026 Scoring & Results</Typography>
            {faqs.map((faq, index) => (
              <Accordion key={index} disableGutters sx={{ '&:before': { display: 'none' }, mb: 1, borderRadius: 1, overflow: 'hidden' }}>
                <AccordionSummary expandIcon={<Typography sx={{ fontSize: '1.2rem', fontWeight: 600 }}>+</Typography>} sx={{ bgcolor: 'white', '&:hover': { bgcolor: 'grey.100' } }}>
                  <Typography sx={{ fontWeight: 600 }}>{faq.question}</Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ bgcolor: 'white' }}>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.8 }}>{faq.answer}</Typography>
                </AccordionDetails>
              </Accordion>
            ))}
          </Container>
        </Box>

        {/* CTA Banner */}
        <Box sx={{ py: { xs: 6, md: 10 }, background: 'linear-gradient(135deg, #0d47a1 0%, #1565c0 100%)', color: 'white', textAlign: 'center' }}>
          <Container maxWidth="md">
            <Typography variant="h3" component="h2" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '1.75rem', md: '2.5rem' } }}>
              Prepare for NATA 2026 with Neram Classes
            </Typography>
            <Typography variant="h6" sx={{ mb: 4, opacity: 0.9 }}>Maximize your score with expert coaching and free tools.</Typography>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button variant="contained" size="large" component={Link} href="/apply" sx={{ background: '#ffffff', color: '#0d47a1', fontWeight: 700, px: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', '&:hover': { background: '#f0f0f0' } }}>Start Free Trial</Button>
              <Button variant="outlined" size="large" component={Link} href={`/${locale}/nata-2026`} sx={{ borderColor: 'white', color: 'white' }}>Back to NATA 2026 Guide</Button>
            </Box>
          </Container>
        </Box>
      </Box>
    </>
  );
}

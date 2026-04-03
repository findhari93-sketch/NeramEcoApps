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
import LastUpdatedBadge from '@/components/nata/LastUpdatedBadge';


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
      'No minimum Raw Score is prescribed for qualifying in NATA 2026. The Final Scorecard issued by the Council, indicating the best Raw Score and the corresponding non-zero Percentile Score, shall be the valid qualifying NATA score.',
  },
  {
    question: 'If I attempt NATA multiple times, which score is considered?',
    answer:
      'In Phase 1, you can take up to 2 attempts. Your best raw score is used for percentile calculation. For example, if you score 100 in Attempt 1 and 120 in Attempt 2, your score of 120 will be used for percentile computation.',
  },
  {
    question: 'How long is the NATA 2026 score valid?',
    answer:
      'The NATA 2026 score is valid for the academic session 2026-2027 only. If you have a valid NATA 2025 score and do not appear in NATA 2026, the 2025 score remains valid for the 2026-27 session as well.',
  },
  {
    question: 'What is the percentile-based scoring system?',
    answer:
      'NATA 2026 adopts percentile-based scoring for Phase 1. After all test sessions in Phase 1 (April–June 2026), the final percentile score is calculated based on your best raw score relative to the entire population of examinees. Phase 2 (August) uses only raw scores without percentile.',
  },
  {
    question: 'Can I use my NATA 2025 score for 2026-27 admissions?',
    answer:
      'Yes, if you have a valid qualifying NATA 2025 score and have not taken admission during 2025-26, your score remains valid for 2026-27. However, if you take even one attempt in NATA 2026, your 2025 score becomes invalid.',
  },
];

export default function ScoringResultsPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);
  const baseUrl = 'https://neramclasses.com';
  const localeUrl = (path: string) => locale === 'en' ? `${baseUrl}${path}` : `${baseUrl}/${locale}${path}`;

  return (
    <>
      <JsonLd data={generateBreadcrumbSchema([{ name: 'Home', url: localeUrl('') }, { name: 'NATA 2026', url: localeUrl('/nata-2026') }, { name: 'Scoring & Results' }])} />
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
              NATA 2026 uses a percentile-based scoring system. No minimum Raw Score is prescribed. Your best raw score across attempts is used for percentile calculation. Score is valid for academic session 2026-2027.
            </Typography>
            <LastUpdatedBadge date="March 13, 2026" />
          </Container>
        </Box>

        {/* Scoring System */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 6, fontWeight: 700 }}>
              Percentile-Based Scoring
            </Typography>

            <Grid container spacing={3}>
              {[
                { part: 'Part A (Drawing)', total: 80, label: '80 marks', color: 'primary.main' },
                { part: 'Part B (MCQ/NCQ)', total: 120, label: '120 marks', color: 'secondary.main' },
                { part: 'Total', total: 200, label: '200 marks', color: 'success.main' },
              ].map((item) => (
                <Grid item xs={12} sm={4} key={item.part}>
                  <Card sx={{ textAlign: 'center', p: 3, border: '2px solid', borderColor: item.color }}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{item.part}</Typography>
                    <Typography variant="h3" sx={{ fontWeight: 800, color: item.color }}>{item.total}</Typography>
                    <Typography variant="body2" color="text.secondary">{item.label}</Typography>
                  </Card>
                </Grid>
              ))}
            </Grid>

            <Card sx={{ mt: 4, bgcolor: 'success.light', p: 3 }}>
              <Typography variant="body1" sx={{ fontWeight: 600, textAlign: 'center' }}>
                No minimum Raw Score is prescribed for qualifying in NATA 2026. The Final Scorecard with a non-zero Percentile Score is the valid qualifying NATA score.
              </Typography>
            </Card>

            <Card sx={{ mt: 3, p: { xs: 3, md: 4 } }}>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>How Percentile Scoring Works</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.8 }}>
                {'\u2022'} Phase 1 (April–June): Percentile score computed after all test sessions end, based on your best raw score relative to the entire population.{'\n'}
                {'\u2022'} Phase 2 (August): Only Raw Scores issued — no percentile calculation.{'\n'}
                {'\u2022'} Phase 1 scores (with Percentile) are used for Centralized Admission Counselling (CAP).{'\n'}
                {'\u2022'} Phase 2 scores (Raw only) are used for admission against vacant seats after CAP.{'\n'}
                {'\u2022'} Admission authorities may use either best Raw Score or Percentile Score per their rules.
              </Typography>
            </Card>
          </Container>
        </Box>

        {/* Multiple Attempt Rules */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" gutterBottom sx={{ mb: 4, fontWeight: 700 }}>
              Attempt Structure & Scoring
            </Typography>
            <Card>
              <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                {[
                  'Phase 1 (April 4 – June 13, 2026): Up to 2 attempts for Centralized Admission Counselling (CAP).',
                  'Phase 2 (August 7 & 8, 2026): 1 attempt only, for vacant seats after CAP.',
                  'You can appear in only ONE phase — either Phase 1 or Phase 2, not both.',
                  'Each attempt generates a raw score. A Statement of Marks is issued after each attempt.',
                  'In Phase 1, your BEST raw score is used for final percentile computation.',
                  'In Phase 2, only raw scores are issued — no percentile score.',
                  'Each attempt requires separate fee payment.',
                ].map((rule, idx) => (
                  <Box key={idx} sx={{ display: 'flex', gap: 2, py: 1.5, borderBottom: idx < 6 ? '1px solid' : 'none', borderColor: 'divider' }}>
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
              The NATA 2026 score is valid for <strong>the academic session 2026-2027 only</strong>.
            </Typography>
            <Card sx={{ mt: 3, p: 3 }}>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>NATA 2025 Score Carryover</Typography>
              <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.8 }}>
                Candidates with a valid NATA 2025 score who have NOT taken admission during 2025-26 and do NOT appear in NATA 2026:{'\n\n'}
                {'\u2022'} Will be assigned a Percentile Score for CAP round admissions in 2026-27.{'\n'}
                {'\u2022'} For vacant seat admissions, the best NATA 2025 score is treated as Raw Score.{'\n\n'}
                However, if you take any attempt in NATA 2026, your NATA 2025 score becomes invalid.{'\n'}
                NATA 2025 scores are also invalid for candidates who already secured admission based on NATA 2025.
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

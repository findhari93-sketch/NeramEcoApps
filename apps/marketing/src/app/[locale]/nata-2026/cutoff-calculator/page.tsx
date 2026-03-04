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
    title: 'NATA 2026 Cutoff Calculator — Check Your College Eligibility',
    description:
      'Use the free NATA 2026 cutoff calculator to check which architecture colleges you can get into based on your expected score, category, and state. Database covers 5000+ colleges.',
    keywords:
      'NATA 2026 cutoff, NATA cutoff calculator, NATA college cutoff, NATA passing marks, NATA minimum score for college, B.Arch cutoff',
    alternates: buildAlternates(locale, '/nata-2026/cutoff-calculator'),
  };
}

interface PageProps {
  params: { locale: string };
}

const faqs = [
  {
    question: 'What is the expected NATA 2026 cutoff for top colleges?',
    answer:
      'Top government architecture colleges like SPA Delhi, SPA Bhopal, and IITs typically require NATA scores above 130-150 out of 200. The exact cutoff varies by category, state, and counselling round. Use our cutoff calculator for personalized predictions.',
  },
  {
    question: 'Is the NATA cutoff same for all categories?',
    answer:
      'No, the NATA cutoff varies by category. SC/ST/OBC/PwD candidates typically have lower cutoffs compared to General category. Each college sets its own cutoff based on NATA score, category, and available seats.',
  },
  {
    question: 'How accurate is the NATA cutoff calculator?',
    answer:
      'Our cutoff calculator uses data from previous years (2019-2025) and covers 5000+ architecture colleges across India. While past data is a strong predictor, actual cutoffs may vary. Use the predictions as a guide, not a guarantee.',
  },
  {
    question: 'Can I get into a good college with 100 marks in NATA?',
    answer:
      'Yes, scoring 100 out of 200 in NATA qualifies you and opens up many good private and aided architecture colleges. For top government colleges, you may need 130+ marks. Use our cutoff calculator to see exact college options for your score.',
  },
];

export default function CutoffCalculatorPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);
  const baseUrl = 'https://neramclasses.com';

  return (
    <>
      <JsonLd data={generateBreadcrumbSchema([{ name: 'Home', url: baseUrl }, { name: 'NATA 2026', url: `${baseUrl}/${locale}/nata-2026` }, { name: 'Cutoff Calculator' }])} />
      <JsonLd data={generateFAQSchema(faqs)} />

      <Box>
        {/* Hero */}
        <Box sx={{ py: { xs: 8, md: 12 }, background: 'linear-gradient(135deg, #1a237e 0%, #0d47a1 100%)', color: 'white' }}>
          <Container maxWidth="lg">
            <Chip label="NATA 2026" sx={{ bgcolor: 'white', color: 'primary.main', mb: 2, fontWeight: 600 }} />
            <Typography variant="h1" component="h1" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '2rem', sm: '2.5rem', md: '3.5rem' } }}>
              NATA 2026 Cutoff Calculator
            </Typography>
            <Typography variant="h5" sx={{ mb: 2, opacity: 0.9, fontSize: { xs: '1.1rem', md: '1.5rem' } }}>
              Enter your expected NATA 2026 score to see which architecture colleges you can get into. Our free cutoff calculator covers 5000+ colleges across India with data from 2019-2025.
            </Typography>
          </Container>
        </Box>

        {/* Qualification Check */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 2, fontWeight: 700 }}>
              Quick Qualification Check
            </Typography>
            <Typography variant="body1" align="center" color="text.secondary" sx={{ mb: 6, lineHeight: 1.8 }}>
              Before using the cutoff calculator, make sure you meet the minimum qualifying criteria for NATA 2026:
            </Typography>

            <Grid container spacing={3} sx={{ mb: 4 }}>
              {[
                { label: 'Part A (Drawing)', min: '20 marks', total: 'out of 80' },
                { label: 'Part B (MCQ/NCQ)', min: '20 marks', total: 'out of 120' },
                { label: 'Overall', min: '60 marks', total: 'out of 200' },
              ].map((item) => (
                <Grid item xs={12} sm={4} key={item.label}>
                  <Card sx={{ textAlign: 'center', p: 3 }}>
                    <Typography variant="body2" color="text.secondary">{item.label}</Typography>
                    <Typography variant="h4" sx={{ fontWeight: 800, color: 'primary.main', my: 1 }}>{item.min}</Typography>
                    <Typography variant="caption" color="text.secondary">{item.total}</Typography>
                  </Card>
                </Grid>
              ))}
            </Grid>

            <Typography variant="body1" color="text.secondary" sx={{ textAlign: 'center', lineHeight: 1.8, mb: 4 }}>
              If you meet all three criteria, you are qualified! Now use the cutoff calculator to find colleges matching your score.
            </Typography>
          </Container>
        </Box>

        {/* CTA: Cutoff Calculator Tool */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="md" sx={{ textAlign: 'center' }}>
            <Typography variant="h4" sx={{ mb: 1 }}>🧮</Typography>
            <Typography variant="h3" gutterBottom sx={{ fontWeight: 700 }}>
              Use the Free Cutoff Calculator
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4, maxWidth: 600, mx: 'auto', lineHeight: 1.8 }}>
              Enter your NATA score, category, and preferred state to get a personalized list of colleges you can apply to. Data from 5000+ colleges across India.
            </Typography>
            <Button
              variant="contained"
              size="large"
              component="a"
              href={`${APP_URL}/tools/nata/cutoff-calculator`}
              target="_blank"
              rel="noopener noreferrer"
              sx={{ px: 6, py: 1.5, fontSize: '1.1rem' }}
            >
              Open Cutoff Calculator (Free)
            </Button>
          </Container>
        </Box>

        {/* Score Ranges */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 6, fontWeight: 700 }}>
              What Can You Expect at Different Scores?
            </Typography>

            {[
              { range: '150 - 200', label: 'Excellent', desc: 'Top government colleges (SPA, NITs, IITs). State-rank holders. Best scholarships available.', color: 'success.main' },
              { range: '120 - 149', label: 'Very Good', desc: 'Good government colleges, top private colleges. Multiple options across states.', color: 'info.main' },
              { range: '100 - 119', label: 'Good', desc: 'Many private and aided colleges. Some government college options depending on category and state.', color: 'primary.main' },
              { range: '60 - 99', label: 'Qualifying', desc: 'Qualified for admission. Private college options available. Consider retaking for better options.', color: 'warning.main' },
            ].map((item) => (
              <Card key={item.range} sx={{ mb: 2, borderLeft: '4px solid', borderColor: item.color }}>
                <CardContent sx={{ p: { xs: 2, md: 3 }, display: 'flex', gap: 3, alignItems: 'center', flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
                  <Box sx={{ minWidth: 100 }}>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: item.color }}>{item.range}</Typography>
                    <Chip label={item.label} size="small" sx={{ bgcolor: item.color, color: 'white', fontWeight: 600 }} />
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.8 }}>{item.desc}</Typography>
                </CardContent>
              </Card>
            ))}
          </Container>
        </Box>

        {/* Also Read */}
        <Box sx={{ py: { xs: 6, md: 8 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="md">
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>Also Read</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              {[
                { title: 'Scoring & Results', slug: 'scoring-and-results' },
                { title: 'NATA 2026 Exam Pattern', slug: 'exam-pattern' },
                { title: 'NATA 2026 Eligibility', slug: 'eligibility' },
                { title: 'NATA 2026 Fee Structure', slug: 'fee-structure' },
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
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 4, fontWeight: 700 }}>FAQs — NATA 2026 Cutoffs</Typography>
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
            <Typography variant="h6" sx={{ mb: 4, opacity: 0.9 }}>Score higher with expert coaching and reach your dream college.</Typography>
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

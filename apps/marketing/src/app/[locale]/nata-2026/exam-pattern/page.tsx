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

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'NATA 2026 Exam Pattern — Part A & Part B Detailed Breakdown',
    description:
      'Complete NATA 2026 exam pattern with Part A (Drawing, 80 marks, offline) and Part B (MCQ/NCQ, 120 marks, online adaptive). Duration, marking scheme, and question types explained.',
    keywords:
      'NATA 2026 exam pattern, NATA paper pattern, NATA marking scheme, NATA Part A Part B, NATA question types, NATA 2026 marks distribution',
    alternates: buildAlternates(locale, '/nata-2026/exam-pattern'),
  };
}

interface PageProps {
  params: { locale: string };
}

const faqs = [
  {
    question: 'How many questions are there in NATA 2026?',
    answer:
      'NATA 2026 has 3 drawing questions in Part A (offline) and approximately 50 MCQ/NCQ questions in Part B (online). Part A is worth 80 marks and Part B is worth 120 marks, totaling 200 marks.',
  },
  {
    question: 'Is NATA 2026 Part B adaptive?',
    answer:
      'Yes, Part B of NATA 2026 uses Computer Adaptive Testing (CAT). The difficulty of questions adjusts based on your performance — correct answers lead to harder questions (worth more marks) and incorrect ones lead to easier questions.',
  },
  {
    question: 'Can I use a calculator in NATA?',
    answer:
      'No, calculators are not allowed in NATA. However, the online Part B interface may provide an on-screen basic calculator for numerical calculations. You should practice mental math.',
  },
  {
    question: 'What materials can I bring for Part A drawing?',
    answer:
      'For Part A, you must bring your own drawing materials: HB/2B pencils, eraser, sharpener, geometry box (compass, scale, set squares, protractor), and coloring materials (color pencils, pastels, or watercolors). A4 drawing sheets are provided by the exam center.',
  },
];

export default function ExamPatternPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);
  const baseUrl = 'https://neramclasses.com';

  return (
    <>
      <JsonLd data={generateBreadcrumbSchema([{ name: 'Home', url: baseUrl }, { name: 'NATA 2026', url: `${baseUrl}/${locale}/nata-2026` }, { name: 'Exam Pattern' }])} />
      <JsonLd data={generateFAQSchema(faqs)} />

      <Box>
        {/* Hero */}
        <Box sx={{ py: { xs: 8, md: 12 }, background: 'linear-gradient(135deg, #1a237e 0%, #0d47a1 100%)', color: 'white' }}>
          <Container maxWidth="lg">
            <Chip label="NATA 2026" sx={{ bgcolor: 'white', color: 'primary.main', mb: 2, fontWeight: 600 }} />
            <Typography variant="h1" component="h1" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '2rem', sm: '2.5rem', md: '3.5rem' } }}>
              NATA 2026 Exam Pattern
            </Typography>
            <Typography variant="h5" sx={{ mb: 2, opacity: 0.9, fontSize: { xs: '1.1rem', md: '1.5rem' } }}>
              NATA 2026 is a 200-mark exam divided into two parts: Part A (Drawing Test, 80 marks, offline, 90 minutes) and Part B (MCQ/NCQ, 120 marks, online adaptive, 90 minutes). There is no negative marking.
            </Typography>
          </Container>
        </Box>

        {/* Part A & Part B */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
          <Container maxWidth="lg">
            <Grid container spacing={4}>
              {/* Part A */}
              <Grid item xs={12} md={6}>
                <Card sx={{ height: '100%', border: '2px solid', borderColor: 'primary.main' }}>
                  <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                    <Chip label="PART A" size="small" color="primary" sx={{ mb: 2 }} />
                    <Typography variant="h4" sx={{ fontWeight: 700, mb: 2 }}>Drawing Test</Typography>
                    {[
                      { label: 'Mode', value: 'Offline (Pen & Paper)' },
                      { label: 'Marks', value: '80' },
                      { label: 'Duration', value: '90 minutes' },
                      { label: 'Questions', value: '3 drawing questions' },
                      { label: 'Medium', value: 'English' },
                      { label: 'Negative Marking', value: 'No' },
                    ].map((row, idx) => (
                      <Box key={idx} sx={{ display: 'flex', justifyContent: 'space-between', py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                        <Typography variant="body2" color="text.secondary">{row.label}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{row.value}</Typography>
                      </Box>
                    ))}
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 2, lineHeight: 1.8 }}>
                      Questions test: free-hand sketching, composition with shapes, imaginative drawing, perspective, proportion, and shading.
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              {/* Part B */}
              <Grid item xs={12} md={6}>
                <Card sx={{ height: '100%', border: '2px solid', borderColor: 'secondary.main' }}>
                  <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                    <Chip label="PART B" size="small" color="secondary" sx={{ mb: 2 }} />
                    <Typography variant="h4" sx={{ fontWeight: 700, mb: 2 }}>MCQ / NCQ</Typography>
                    {[
                      { label: 'Mode', value: 'Online (Computer Adaptive)' },
                      { label: 'Marks', value: '120' },
                      { label: 'Duration', value: '90 minutes' },
                      { label: 'Questions', value: '~50 (varies due to adaptive)' },
                      { label: 'Medium', value: 'English and Hindi' },
                      { label: 'Negative Marking', value: 'No' },
                    ].map((row, idx) => (
                      <Box key={idx} sx={{ display: 'flex', justifyContent: 'space-between', py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                        <Typography variant="body2" color="text.secondary">{row.label}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{row.value}</Typography>
                      </Box>
                    ))}
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 2, lineHeight: 1.8 }}>
                      Topics: Mathematics, General Aptitude, Logical Reasoning, Architecture Awareness. MCQ = Multiple Choice, NCQ = Numerical Choice (type your answer).
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Container>
        </Box>

        {/* Exam Day Schedule */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 4, fontWeight: 700 }}>
              Exam Day Schedule
            </Typography>
            <Card>
              <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                {[
                  { time: '08:30 AM', event: 'Gate opens, reporting begins' },
                  { time: '09:00 AM', event: 'Identity verification and seating' },
                  { time: '09:30 AM', event: 'Part A (Drawing) starts' },
                  { time: '11:00 AM', event: 'Part A ends, break begins' },
                  { time: '11:30 AM', event: 'Part B (Online) starts' },
                  { time: '01:00 PM', event: 'Part B ends, exam over' },
                ].map((row, idx) => (
                  <Box key={idx} sx={{ display: 'flex', gap: 3, py: 1.5, borderBottom: idx < 5 ? '1px solid' : 'none', borderColor: 'divider' }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 100, color: 'primary.main' }}>{row.time}</Typography>
                    <Typography variant="body2" color="text.secondary">{row.event}</Typography>
                  </Box>
                ))}
                <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
                  * Approximate schedule based on NATA 2025. Actual timings may vary. Check your appointment card for exact schedule.
                </Typography>
              </CardContent>
            </Card>
          </Container>
        </Box>

        {/* Also Read */}
        <Box sx={{ py: { xs: 6, md: 8 }, bgcolor: 'background.default' }}>
          <Container maxWidth="md">
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>Also Read</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              {[
                { title: 'NATA 2026 Syllabus', slug: 'syllabus' },
                { title: 'Scoring & Results', slug: 'scoring-and-results' },
                { title: "Do's & Don'ts", slug: 'dos-and-donts' },
                { title: 'Photo & Signature Requirements', slug: 'photo-signature-requirements' },
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
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 4, fontWeight: 700 }}>FAQs — NATA 2026 Exam Pattern</Typography>
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
            <Typography variant="h6" sx={{ mb: 4, opacity: 0.9 }}>Master both Part A and Part B with expert coaching.</Typography>
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

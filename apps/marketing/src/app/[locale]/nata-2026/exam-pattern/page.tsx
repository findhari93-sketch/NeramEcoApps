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
import LastUpdatedBadge from '@/components/nata/LastUpdatedBadge';


export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'NATA 2026 Exam Pattern: Part A & Part B Detailed Breakdown',
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
      'NATA 2026 has 3 questions in Part A (offline, 80 marks) and 50 questions in Part B (online, 120 marks): 42 MCQs and 8 NCQs. The total is 200 marks. Part A tests drawing and composition skills while Part B is a computer-based adaptive test.',
  },
  {
    question: 'Is NATA 2026 Part B adaptive?',
    answer:
      'Yes, Part B of NATA 2026 uses Computer Adaptive Testing (CAT). You get 108 seconds per question. The difficulty adjusts based on your performance. Correct answers lead to harder questions and incorrect ones lead to easier questions.',
  },
  {
    question: 'Can I use a calculator in NATA?',
    answer:
      'No, calculators, mobile phones, Bluetooth devices, slide rules, log tables, and electronic watches with calculator facilities are strictly not allowed in the examination hall. Possession of such items may lead to cancellation of candidature.',
  },
  {
    question: 'What materials can I bring for Part A drawing?',
    answer:
      'For Part A, you must bring: pencils, erasers, dry colors, and a scale (up to 15 cm only). No geometry box, compass, set squares, or other instruments are allowed. The exam center provides drawing paper/material and rough sheets.',
  },
  {
    question: 'How many attempts are available in NATA 2026?',
    answer:
      'You can take up to 2 attempts in Phase 1 (April–June 2026) for Centralized Admission Counselling, OR 1 attempt in Phase 2 (August 7–8, 2026) for vacant seats. You cannot appear in both phases. Your best raw score is used for percentile calculation.',
  },
  {
    question: 'What is the new 3D Composition question in Part A?',
    answer:
      'Question A3 (30 marks) requires creating an interesting 3D composition for a given situation using a kit provided at the test center. This tests your ability to think in three dimensions and create spatial compositions.',
  },
];

export default function ExamPatternPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);
  const baseUrl = 'https://neramclasses.com';
  const localeUrl = (path: string) => locale === 'en' ? `${baseUrl}${path}` : `${baseUrl}/${locale}${path}`;

  return (
    <>
      <JsonLd data={generateBreadcrumbSchema([{ name: 'Home', url: localeUrl('') }, { name: 'NATA 2026', url: localeUrl('/nata-2026') }, { name: 'Exam Pattern' }])} />
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
              NATA 2026 is a 200-mark exam in two parts: Part A, Drawing & Composition (80 marks, offline, 90 minutes) and Part B, MCQ/NCQ (120 marks, online adaptive, 90 minutes). The medium is English and Hindi.
            </Typography>
            <LastUpdatedBadge date="March 13, 2026" />
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
                    <Typography variant="h4" sx={{ fontWeight: 700, mb: 2 }}>Drawing & Composition Test</Typography>
                    {[
                      { label: 'Mode', value: 'Offline (Pen & Paper)' },
                      { label: 'Marks', value: '80' },
                      { label: 'Duration', value: '90 minutes' },
                      { label: 'Questions', value: '3 questions' },
                      { label: 'Medium', value: 'English and Hindi' },
                      { label: 'Negative Marking', value: 'No' },
                    ].map((row, idx) => (
                      <Box key={idx} sx={{ display: 'flex', justifyContent: 'space-between', py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                        <Typography variant="body2" color="text.secondary">{row.label}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{row.value}</Typography>
                      </Box>
                    ))}
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>Question Breakdown:</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.8 }}>
                        A1: Composition & Color (25 marks): Create compositions and color them appropriately.{'\n'}
                        A2: Sketching & Composition B&W (25 marks): Draw buildings, people, environment with scale, proportion, shading.{'\n'}
                        A3: 3D Composition (30 marks): Create a 3D composition using a kit provided at the center.
                      </Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 2, fontStyle: 'italic' }}>
                      Materials to bring: Pencils, erasers, dry colors, scale (up to 15 cm). No geometry box or other instruments allowed.
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              {/* Part B */}
              <Grid item xs={12} md={6}>
                <Card sx={{ height: '100%', border: '2px solid', borderColor: 'secondary.main' }}>
                  <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                    <Chip label="PART B" size="small" color="secondary" sx={{ mb: 2 }} />
                    <Typography variant="h4" sx={{ fontWeight: 700, mb: 2 }}>MCQ / NCQ (Adaptive)</Typography>
                    {[
                      { label: 'Mode', value: 'Online (Computer Adaptive)' },
                      { label: 'Marks', value: '120' },
                      { label: 'Duration', value: '90 minutes (108 sec/question)' },
                      { label: 'Questions', value: '50 (42 MCQ + 8 NCQ)' },
                      { label: 'Medium', value: 'English and Hindi' },
                      { label: 'Negative Marking', value: 'No' },
                    ].map((row, idx) => (
                      <Box key={idx} sx={{ display: 'flex', justifyContent: 'space-between', py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                        <Typography variant="body2" color="text.secondary">{row.label}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{row.value}</Typography>
                      </Box>
                    ))}
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>Topics Covered:</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.8 }}>
                        {'\u2022'} Visual Reasoning: 2D/3D composition understanding{'\n'}
                        {'\u2022'} Logical Derivation: Decoding situations and drawing conclusions{'\n'}
                        {'\u2022'} GK, Architecture & Design: Buildings, history, materials{'\n'}
                        {'\u2022'} Language Interpretation: Grammar, word meanings{'\n'}
                        {'\u2022'} Design Sensitivity & Thinking: Observation, critical thinking{'\n'}
                        {'\u2022'} Numerical Ability: Math with creative/geometric applications
                      </Typography>
                    </Box>
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

            {/* Session 1 */}
            <Typography variant="h5" sx={{ fontWeight: 600, mb: 2, color: 'primary.main' }}>Session 1 (Morning)</Typography>
            <Card sx={{ mb: 4 }}>
              <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                {[
                  { time: '09:00 AM', event: 'Report to Examination Centre' },
                  { time: '09:15 AM', event: 'Gate opens to examination hall' },
                  { time: '09:45 AM', event: 'Registration must be completed' },
                  { time: '10:00 AM', event: 'Gate closes, examination begins (Part A + Part B)' },
                  { time: '10:15 AM', event: 'Late entry cutoff. No entry after this.' },
                  { time: '01:00 PM', event: 'Examination ends, exit allowed' },
                ].map((row, idx) => (
                  <Box key={idx} sx={{ display: 'flex', gap: 3, py: 1.5, borderBottom: idx < 5 ? '1px solid' : 'none', borderColor: 'divider' }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 100, color: 'primary.main' }}>{row.time}</Typography>
                    <Typography variant="body2" color="text.secondary">{row.event}</Typography>
                  </Box>
                ))}
              </CardContent>
            </Card>

            {/* Session 2 */}
            <Typography variant="h5" sx={{ fontWeight: 600, mb: 2, color: 'secondary.main' }}>Session 2 (Afternoon)</Typography>
            <Card>
              <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                {[
                  { time: '12:30 PM', event: 'Report to Examination Centre' },
                  { time: '12:45 PM', event: 'Gate opens to examination hall' },
                  { time: '01:15 PM', event: 'Registration must be completed' },
                  { time: '01:30 PM', event: 'Gate closes, examination begins (Part A + Part B)' },
                  { time: '01:45 PM', event: 'Late entry cutoff. No entry after this.' },
                  { time: '04:30 PM', event: 'Examination ends, exit allowed' },
                ].map((row, idx) => (
                  <Box key={idx} sx={{ display: 'flex', gap: 3, py: 1.5, borderBottom: idx < 5 ? '1px solid' : 'none', borderColor: 'divider' }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 100, color: 'secondary.main' }}>{row.time}</Typography>
                    <Typography variant="body2" color="text.secondary">{row.event}</Typography>
                  </Box>
                ))}
              </CardContent>
            </Card>

            <Card sx={{ mt: 3, bgcolor: 'warning.light', p: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'center' }}>
                Fridays: 1 session (afternoon only). Saturdays: 2 sessions. Total duration: 3 hours (Part A 90 min + Part B 90 min). No exit before exam ends.
              </Typography>
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
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 4, fontWeight: 700 }}>FAQs: NATA 2026 Exam Pattern</Typography>
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

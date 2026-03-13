import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import {
  Box,
  Container,
  Typography,
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
} from '@neram/ui';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema, generateFAQSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import { APP_URL } from '@/lib/seo/constants';
import LastUpdatedBadge from '@/components/nata/LastUpdatedBadge';
import Breadcrumbs from '@/components/seo/Breadcrumbs';

export const revalidate = 86400;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'NATA Previous Year Question Papers (2020-2025) — Download & Analysis',
    description:
      'Download NATA previous year question papers from 2020 to 2025. Year-wise analysis of question patterns, difficulty trends, and topic-wise weightage. Free practice resources for NATA 2026.',
    keywords:
      'NATA previous year papers, NATA question papers, NATA 2025 paper, NATA paper analysis, NATA practice papers',
    alternates: buildAlternates(locale, '/nata-2026/previous-year-papers'),
  };
}

interface PageProps {
  params: { locale: string };
}

const yearWiseData = [
  {
    year: '2025',
    mode: 'Hybrid (Offline Drawing + Online MCQ)',
    difficulty: 'Moderate to High',
    changes: 'Introduced 3D Composition section with physical kit; increased drawing weightage',
  },
  {
    year: '2024',
    mode: 'Hybrid (Offline Drawing + Online MCQ)',
    difficulty: 'Moderate',
    changes: 'PCM-based aptitude questions; similar format to 2023',
  },
  {
    year: '2023',
    mode: 'Online + Offline',
    difficulty: 'Moderate',
    changes: 'Drawing weight increased; more emphasis on spatial reasoning',
  },
  {
    year: '2022',
    mode: 'Hybrid (First Year)',
    difficulty: 'Moderate',
    changes: 'First year of hybrid mode combining offline drawing and online MCQ',
  },
  {
    year: '2021',
    mode: 'Fully Online',
    difficulty: 'Easy to Moderate',
    changes: 'Fully online due to COVID-19; drawing tested via digital tools',
  },
  {
    year: '2020',
    mode: 'Fully Online',
    difficulty: 'Moderate',
    changes: 'First fully online NATA exam due to pandemic; reduced question count',
  },
];

const topicWeightage = [
  { topic: 'Mathematics (Numerical Ability)', weightage: '~20%', marks: '~40 marks', trend: 'Stable across years' },
  { topic: 'General Aptitude (Visual Reasoning, GK, Language)', weightage: '~40%', marks: '~80 marks', trend: 'Increasing focus on design sensitivity' },
  { topic: 'Drawing & Composition (Part A)', weightage: '~40%', marks: '~80 marks', trend: '3D Composition added from 2025' },
];

const pyqTips = [
  'Start with the most recent papers (2024-2025) to understand the current format and difficulty.',
  'Time yourself strictly — 90 minutes for Part A and 90 minutes for Part B.',
  'Analyze your mistakes after each paper. Note which topics need more practice.',
  'Focus on understanding the marking scheme — no negative marking means attempt every question.',
  'Practice the 3D Composition questions separately since this is a newer format.',
  'Compare question patterns across years to identify frequently tested topics.',
  'Use PYQs to build speed in drawing — aim to complete each drawing question in 30 minutes.',
  'Recreate drawing questions from memory to improve visualization skills.',
];

const faqs = [
  {
    question: 'Does CoA officially release NATA previous year question papers?',
    answer:
      'No, the Council of Architecture (CoA) does not officially release full NATA question papers. However, solved sample papers and reconstructed questions from past exams are available through coaching platforms like Neram Classes. CoA does publish sample question formats and guidelines on nata.in.',
  },
  {
    question: 'Where can I find NATA previous year papers for free?',
    answer:
      'While official papers are not released, you can access reconstructed NATA papers and practice questions through Neram Classes\' free question bank at app.neramclasses.com. These are based on actual exam patterns and include year-wise analysis of topics and difficulty levels.',
  },
  {
    question: 'How many years of NATA papers should I practice?',
    answer:
      'Practice at least 3-5 years of papers (2020-2025) for comprehensive preparation. Focus more on 2022-2025 papers since the hybrid format started in 2022. Papers from 2020-2021 are still useful for aptitude and mathematics practice, though the exam format was different (fully online).',
  },
  {
    question: 'Has the NATA exam pattern changed significantly over the years?',
    answer:
      'Yes. From 2020-2021, NATA was fully online. In 2022, the hybrid format was introduced (offline drawing + online MCQ). In 2025, the 3D Composition section was added. The overall structure remains Part A (Drawing) and Part B (MCQ/NCQ), but the specific question types and weightage have evolved.',
  },
  {
    question: 'Are NATA previous year papers enough for preparation?',
    answer:
      'PYQs are essential but not sufficient alone. They help you understand the pattern, difficulty, and question types. Combine PYQ practice with: (1) daily drawing practice, (2) mathematics from NCERT/RD Sharma, (3) general knowledge reading, and (4) mock tests under timed conditions. Neram Classes provides structured preparation covering all these areas.',
  },
];

export default function PreviousYearPapersPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);
  const baseUrl = 'https://neramclasses.com';
  const localeUrl = (path: string) => locale === 'en' ? `${baseUrl}${path}` : `${baseUrl}/${locale}${path}`;

  return (
    <>
      <JsonLd data={generateBreadcrumbSchema([{ name: 'Home', url: localeUrl('') }, { name: 'NATA 2026', url: localeUrl('/nata-2026') }, { name: 'Previous Year Papers' }])} />
      <JsonLd data={generateFAQSchema(faqs)} />

      <Box>
        {/* Hero */}
        <Box sx={{ py: { xs: 8, md: 12 }, background: 'linear-gradient(135deg, #1a237e 0%, #0d47a1 100%)', color: 'white' }}>
          <Container maxWidth="lg">
            <Breadcrumbs
              variant="light"
              items={[
                { name: 'Home', href: `/${locale}` },
                { name: 'NATA 2026', href: `/${locale}/nata-2026` },
                { name: 'Previous Year Papers' },
              ]}
            />
            <Chip label="NATA 2026" sx={{ bgcolor: 'white', color: 'primary.main', mb: 2, fontWeight: 600 }} />
            <Typography variant="h1" component="h1" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '2rem', sm: '2.5rem', md: '3.5rem' } }}>
              NATA Previous Year Question Papers (2020–2025)
            </Typography>
            <Typography variant="h5" sx={{ mb: 2, opacity: 0.9, fontSize: { xs: '1.1rem', md: '1.5rem' } }}>
              NATA previous year question papers from 2020–2025 are essential for understanding the exam pattern and difficulty level. While CoA does not officially release full question papers, solved sample papers and reconstructed questions from past exams are available through coaching platforms like Neram Classes.
            </Typography>
            <LastUpdatedBadge date="March 13, 2026" />
          </Container>
        </Box>

        {/* Year-wise Paper Analysis */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" gutterBottom sx={{ mb: 2, fontWeight: 700 }}>
              Year-wise Paper Analysis (2020–2025)
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4, lineHeight: 1.8 }}>
              Here is a comprehensive analysis of how the NATA exam has evolved over the past six years, including format changes, difficulty levels, and major updates.
            </Typography>

            {yearWiseData.map((item, idx) => (
              <Card key={idx} sx={{ mb: 2 }}>
                <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1, flexWrap: 'wrap' }}>
                    <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.main' }}>NATA {item.year}</Typography>
                    <Chip label={item.difficulty} size="small" color={item.difficulty.includes('High') ? 'warning' : 'default'} />
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5, lineHeight: 1.8 }}>
                    <strong>Mode:</strong> {item.mode}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.8 }}>
                    <strong>Key Changes:</strong> {item.changes}
                  </Typography>
                </CardContent>
              </Card>
            ))}
          </Container>
        </Box>

        {/* Topic-wise Weightage Trends */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" gutterBottom sx={{ mb: 2, fontWeight: 700 }}>
              Topic-wise Weightage Trends
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4, lineHeight: 1.8 }}>
              Based on analysis of previous years, here is the approximate topic-wise weightage in NATA.
            </Typography>

            {topicWeightage.map((item, idx) => (
              <Card key={idx} sx={{ mb: 2 }}>
                <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1, flexWrap: 'wrap' }}>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>{item.topic}</Typography>
                    <Chip label={item.weightage} size="small" color="primary" />
                    <Chip label={item.marks} size="small" variant="outlined" />
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.8 }}>
                    <strong>Trend:</strong> {item.trend}
                  </Typography>
                </CardContent>
              </Card>
            ))}
          </Container>
        </Box>

        {/* How to Use PYQs Effectively */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" gutterBottom sx={{ mb: 2, fontWeight: 700 }}>
              How to Use PYQs Effectively
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4, lineHeight: 1.8 }}>
              Practicing previous year questions is one of the best strategies for NATA preparation. Here is how to make the most of them.
            </Typography>

            <Card>
              <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                <List>
                  {pyqTips.map((tip, idx) => (
                    <ListItem key={idx} sx={{ px: 0 }}>
                      <ListItemIcon sx={{ minWidth: 28 }}>
                        <Typography color="primary.main" sx={{ fontWeight: 700 }}>{idx + 1}.</Typography>
                      </ListItemIcon>
                      <ListItemText primary={tip} />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Container>
        </Box>

        {/* Free Practice Resources CTA */}
        <Box sx={{ py: { xs: 4, md: 6 }, bgcolor: 'grey.50', textAlign: 'center' }}>
          <Container maxWidth="md">
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>Free NATA Practice Resources</Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              Access our free NATA question bank with topic-wise practice questions based on previous year patterns.
            </Typography>
            <Button variant="contained" size="large" component="a" href={`${APP_URL}/tools/nata/question-bank`} target="_blank" rel="noopener noreferrer">
              Open Question Bank (Free)
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
                { title: 'Preparation Tips', slug: 'preparation-tips' },
                { title: 'Drawing Test Guide', slug: 'drawing-test' },
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
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 4, fontWeight: 700 }}>FAQs — NATA Previous Year Papers</Typography>
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
            <Typography variant="h6" sx={{ mb: 4, opacity: 0.9 }}>Practice with curated question banks based on previous year patterns.</Typography>
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

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
    title: 'NATA 2026 Syllabus — Simplified Topics with Sample Questions',
    description:
      'Complete NATA 2026 syllabus for Part A (Drawing Test) and Part B (MCQ/NCQ). Topic-wise breakdown with simplified explanations. Includes important topics and preparation tips.',
    keywords:
      'NATA 2026 syllabus, NATA syllabus topics, NATA Part A syllabus, NATA Part B syllabus, NATA drawing test syllabus, NATA MCQ topics',
    alternates: buildAlternates(locale, '/nata-2026/syllabus'),
  };
}

interface PageProps {
  params: { locale: string };
}

const partATopics = [
  {
    title: 'A1 — Composition and Color (25 marks)',
    desc: 'Creating suitable compositions for various situations and coloring them appropriately. Re-arranging various shapes in a visually appealing manner and coloring it suitably. Tests your sense of color harmony and composition skills.',
  },
  {
    title: 'A2 — Sketching & Composition, Black and White (25 marks)',
    desc: 'Ability to draw, visualize, and depict a situation involving buildings/its components, people, environment, and products with an understanding of scale, proportions, textures, shades, and shadow.',
  },
  {
    title: 'A3 — 3D Composition (30 marks)',
    desc: 'Creating interesting 3D compositions for a given situation using a kit provided at the test center. This is a new format that tests your spatial thinking and ability to work with physical materials in three dimensions.',
  },
];

const partBTopics = [
  {
    category: 'Visual Reasoning',
    topics: [
      'Understanding and reconstructing 2D and 3D compositions',
      'Knowledge about composition and technical concepts',
      'Mirror images, paper folding, figure completion',
      'Spatial visualization — 2D to 3D and vice versa',
    ],
  },
  {
    category: 'Logical Derivation',
    topics: [
      'Decoding a situation, composition, or context to generate meaning',
      'Understanding minute information hidden in a particular situation',
      'Drawing conclusions from given data or visual inputs',
      'Pattern recognition and logical sequences',
    ],
  },
  {
    category: 'General Knowledge, Architecture & Design',
    topics: [
      'General awareness of architecture and design, current issues',
      'Knowledge about important buildings and historical progression',
      'Innovation in materials and construction technology',
      'Famous architects and their contributions',
      'Urban planning basics and sustainability concepts',
    ],
  },
  {
    category: 'Language Interpretation',
    topics: [
      'Ability to correctly and logically generate meaning of words and sentences',
      'Understanding of English grammar',
      'Reading comprehension and inference',
    ],
  },
  {
    category: 'Design Sensitivity and Thinking',
    topics: [
      'Ability to observe, record, and analyse people, space, product, and environment',
      'Critical thinking, reasoning, and identifying subtle communications',
      'Understanding semantics and metaphors',
      'Problem identification, definition, and analysis of given situations',
    ],
  },
  {
    category: 'Numerical Ability',
    topics: [
      'Basic Mathematics and its association with creative thinking',
      'Unfolding space with use of geometry',
      'Algebra, trigonometry, coordinate geometry, calculus basics',
      'Statistics, probability, and number series',
    ],
  },
];

const faqs = [
  {
    question: 'Is NATA syllabus same as JEE Maths?',
    answer:
      'NATA 2026 Part B includes Numerical Ability which overlaps with basic Maths (algebra, trigonometry, geometry). However, NATA focuses more on visual reasoning, design sensitivity, language interpretation, and architecture awareness — areas JEE does not cover. Part A is entirely drawing-based.',
  },
  {
    question: 'How do I prepare for the 3D Composition question (A3)?',
    answer:
      'The 3D Composition question (30 marks) requires creating spatial compositions using a kit provided at the center. Practice with paper folding, origami, clay modeling, and geometric solids. Focus on understanding volume, space, and three-dimensional relationships.',
  },
  {
    question: 'What is the difference between MCQ and NCQ in Part B?',
    answer:
      'MCQ (Multiple Choice Questions) have 4 options to choose from — there are 42 of these. NCQ (No Choice Questions) require you to type a numerical answer without any options — there are 8 of these. Both types have no negative marking.',
  },
  {
    question: 'Are there negative marks in NATA?',
    answer:
      'No, there are no negative marks in NATA 2026. Both Part A (drawing & composition) and Part B (MCQ/NCQ) do not penalize for wrong answers, so attempt all questions.',
  },
  {
    question: 'What topics come under Design Sensitivity and Thinking?',
    answer:
      'This includes observation and analysis of people, space, products, and environment. Also covers critical thinking, reasoning, identifying subtle communications, understanding semantics and metaphors, problem identification and definition, and analysis of given situations.',
  },
];

export default function SyllabusPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);
  const baseUrl = 'https://neramclasses.com';
  const localeUrl = (path: string) => locale === 'en' ? `${baseUrl}${path}` : `${baseUrl}/${locale}${path}`;

  return (
    <>
      <JsonLd data={generateBreadcrumbSchema([{ name: 'Home', url: localeUrl('') }, { name: 'NATA 2026', url: localeUrl('/nata-2026') }, { name: 'Syllabus' }])} />
      <JsonLd data={generateFAQSchema(faqs)} />

      <Box>
        {/* Hero */}
        <Box sx={{ py: { xs: 8, md: 12 }, background: 'linear-gradient(135deg, #1a237e 0%, #0d47a1 100%)', color: 'white' }}>
          <Container maxWidth="lg">
            <Chip label="NATA 2026" sx={{ bgcolor: 'white', color: 'primary.main', mb: 2, fontWeight: 600 }} />
            <Typography variant="h1" component="h1" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '2rem', sm: '2.5rem', md: '3.5rem' } }}>
              NATA 2026 Syllabus
            </Typography>
            <Typography variant="h5" sx={{ mb: 2, opacity: 0.9, fontSize: { xs: '1.1rem', md: '1.5rem' } }}>
              NATA 2026 has two parts: Part A tests drawing skills (80 marks, offline) and Part B tests mathematics, general aptitude, and architecture awareness (120 marks, online). Here is the complete topic-wise syllabus.
            </Typography>
            <LastUpdatedBadge date="March 13, 2026" />
          </Container>
        </Box>

        {/* Part A */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" gutterBottom sx={{ mb: 2, fontWeight: 700 }}>
              Part A — Drawing Test (80 Marks)
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4, lineHeight: 1.8 }}>
              Part A is conducted offline on paper. You get 90 minutes to complete 3 questions. The test center provides paper/base material. You must bring: pencils, erasers, dry colors, and scale (up to 15 cm). No geometry box or other instruments allowed.
            </Typography>

            <Grid container spacing={3}>
              {partATopics.map((topic, idx) => (
                <Grid item xs={12} key={idx}>
                  <Card>
                    <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                      <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>{topic.title}</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.8 }}>{topic.desc}</Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* Part B */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" gutterBottom sx={{ mb: 2, fontWeight: 700 }}>
              Part B — MCQ/NCQ (120 Marks)
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4, lineHeight: 1.8 }}>
              Part B is conducted online in a computer-based adaptive test format. You get 90 minutes (108 seconds per question) to answer 50 questions — 42 MCQs (Multiple Choice) and 8 NCQs (No Choice / Numerical). No negative marking. Medium: English and Hindi.
            </Typography>

            {partBTopics.map((section, idx) => (
              <Card key={idx} sx={{ mb: 3 }}>
                <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                  <Typography variant="h5" sx={{ fontWeight: 600, color: 'primary.main', mb: 2 }}>{section.category}</Typography>
                  <List dense>
                    {section.topics.map((topic, tidx) => (
                      <ListItem key={tidx} sx={{ px: 0 }}>
                        <ListItemIcon sx={{ minWidth: 28 }}>
                          <Typography color="success.main">&#x2713;</Typography>
                        </ListItemIcon>
                        <ListItemText primary={topic} />
                      </ListItem>
                    ))}
                  </List>
                </CardContent>
              </Card>
            ))}
          </Container>
        </Box>

        {/* CTA: Question Bank */}
        <Box sx={{ py: { xs: 4, md: 6 }, bgcolor: 'background.default', textAlign: 'center' }}>
          <Container maxWidth="md">
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>Practice NATA Questions</Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              Access our free NATA Question Bank with topic-wise practice questions.
            </Typography>
            <Button variant="contained" size="large" component="a" href={`${APP_URL}/tools/nata/question-bank`} target="_blank" rel="noopener noreferrer">
              Open Question Bank (Free)
            </Button>
          </Container>
        </Box>

        {/* Also Read */}
        <Box sx={{ py: { xs: 6, md: 8 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="md">
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>Also Read</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              {[
                { title: 'NATA 2026 Exam Pattern', slug: 'exam-pattern' },
                { title: 'Scoring & Results', slug: 'scoring-and-results' },
                { title: "Do's & Don'ts", slug: 'dos-and-donts' },
                { title: 'Cutoff Calculator', slug: 'cutoff-calculator' },
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
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 4, fontWeight: 700 }}>FAQs — NATA 2026 Syllabus</Typography>
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
            <Typography variant="h6" sx={{ mb: 4, opacity: 0.9 }}>Expert coaching for drawing and aptitude with proven results.</Typography>
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

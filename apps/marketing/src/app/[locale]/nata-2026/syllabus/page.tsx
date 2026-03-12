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
    title: 'Question 1 — Drawing Based (25 marks)',
    desc: 'Free-hand drawing of a given object or scene from memory. Tests observation, proportion, composition, and shading abilities.',
  },
  {
    title: 'Question 2 — Drawing Based (25 marks)',
    desc: 'Drawing a composition using given geometric shapes and forms. Tests ability to create meaningful compositions with 2D/3D elements.',
  },
  {
    title: 'Question 3 — Drawing Based (30 marks)',
    desc: 'Drawing based on a given situation or theme. Tests imagination, creativity, and ability to visualize and express ideas through drawing.',
  },
];

const partBTopics = [
  {
    category: 'Mathematics (~20 questions)',
    topics: [
      'Algebra — Logarithms, AP/GP, quadratic equations, permutations & combinations',
      'Matrices — Types, operations, determinants, inverse',
      'Trigonometry — Identities, heights & distances, properties of triangles',
      'Coordinate Geometry — Straight lines, circles, conic sections',
      'Calculus — Limits, differentiation, integration, applications',
      'Statistics & Probability — Mean, median, mode, probability basics',
      '3D Geometry — Direction cosines, planes, lines in space',
    ],
  },
  {
    category: 'General Aptitude (~15 questions)',
    topics: [
      'Logical Reasoning — Sequences, patterns, analogies, coding-decoding',
      'Visual Reasoning — Mirror images, paper folding, figure completion',
      'Numerical Ability — Ratio, proportion, percentages, number series',
      'Sets and Relations — Venn diagrams, basic set operations',
      'General Knowledge — Current affairs, general science, geography',
    ],
  },
  {
    category: 'Architecture Awareness (~15 questions)',
    topics: [
      'Famous Buildings & Monuments — World and India heritage sites',
      'Famous Architects — Works and contributions of notable architects',
      'Architectural Terminology — Basic architectural terms and concepts',
      'Building Materials — Properties, uses of common materials',
      'Urban Planning Basics — City planning concepts, sustainability',
      'Spatial Awareness — 2D to 3D visualization, plan and elevation reading',
      'Color Theory — Primary, secondary, tertiary colors, color wheel',
      'Textures and Patterns — Visual textures, natural patterns',
    ],
  },
];

const faqs = [
  {
    question: 'Is NATA syllabus same as JEE Maths?',
    answer:
      'The Mathematics portion of NATA syllabus overlaps significantly with JEE syllabus (11th and 12th Maths). However, NATA does not test Physics and Chemistry. NATA adds drawing, general aptitude, and architectural awareness which JEE does not cover.',
  },
  {
    question: 'How do I prepare for NATA drawing test?',
    answer:
      'Practice free-hand sketching daily for at least 1 hour. Focus on proportion, shading, perspective, and composition. Draw from observation (objects, scenes, people). Practice creating compositions with geometric shapes. Time yourself to complete drawings within 30 minutes.',
  },
  {
    question: 'Is NCERT sufficient for NATA preparation?',
    answer:
      'NCERT Mathematics (Class 11 & 12) covers most of the Math syllabus. However, for General Aptitude and Architecture Awareness, you will need additional resources and practice. Drawing practice needs a separate regimen.',
  },
  {
    question: 'Are there negative marks in NATA?',
    answer:
      'No, there are no negative marks in NATA 2026. Both Part A (drawing) and Part B (MCQ/NCQ) do not penalize for wrong answers, so attempt all questions.',
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
          </Container>
        </Box>

        {/* Part A */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" gutterBottom sx={{ mb: 2, fontWeight: 700 }}>
              Part A — Drawing Test (80 Marks)
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4, lineHeight: 1.8 }}>
              Part A is conducted offline on paper. You get 90 minutes to complete 3 drawing questions. Materials provided: A4 drawing sheets. You must bring your own pencils, erasers, colors, and drawing instruments.
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
              Part B is conducted online in an adaptive test format. You get 90 minutes to answer approximately 50 questions. Questions are Multiple Choice (MCQ) and Numerical Choice (NCQ) type. No negative marking.
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

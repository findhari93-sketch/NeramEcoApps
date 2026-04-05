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
import { generateBreadcrumbSchema, generateFAQSchema, generateHowToSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import { APP_URL } from '@/lib/seo/constants';
import LastUpdatedBadge from '@/components/nata/LastUpdatedBadge';
import Breadcrumbs from '@/components/seo/Breadcrumbs';


export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'NATA 2026 Drawing Test: Complete Guide to Scoring 80/80',
    description:
      'Complete guide to NATA 2026 Drawing Test (Part A). Covers all 3 sections: 2D Composition & Color (25 marks), 3D Composition (25 marks), and Visualization through Sketching (30 marks). Tips, marking scheme, and practice strategy.',
    keywords:
      'NATA drawing test, NATA 2026 drawing, NATA Part A, NATA 3D composition, NATA sketching, NATA drawing marks, NATA composition test',
    alternates: buildAlternates(locale, '/nata-2026/drawing-test'),
  };
}

interface PageProps {
  params: { locale: string };
}

const faqs = [
  {
    question: 'What is the NATA drawing test format in 2026?',
    answer:
      'The NATA 2026 drawing test (Part A) is 80 marks across 3 sections: 2D Composition & Colour (25 marks, 45 min), 3D Composition (25 marks, 45 min), and Visualization through Sketching (30 marks, 45 min). The total duration is 135 minutes and it is conducted offline on A4 drawing sheets.',
  },
  {
    question: 'What is the 3D Composition section in NATA?',
    answer:
      'Introduced in 2025, the 3D Composition section (25 marks) requires candidates to create a three-dimensional model or composition using a physical kit provided at the test center. It tests spatial understanding, form, structure, and the ability to think in three dimensions.',
  },
  {
    question: 'What materials can I bring to the NATA drawing test?',
    answer:
      'You can bring pencils (HB, 2B, 4B, 6B), erasers, sharpener, color pencils, crayons, geometry box (compass, set squares, protractor, scale), watercolors, poster colors, and sketch pens. Oil paints, acrylic paints, electronic gadgets, calculators, and reference materials are not allowed.',
  },
  {
    question: 'How is the NATA drawing test evaluated?',
    answer:
      'Drawing sheets are evaluated by a panel of expert evaluators from architecture and design backgrounds. Each sheet is assessed by multiple evaluators independently, and the average score is taken. Key factors include composition, creativity, proportion, perspective accuracy, use of color, and neatness.',
  },
  {
    question: 'How much time do I get for the drawing test?',
    answer:
      'You get 135 minutes total for Part A (Drawing Test). This is divided across 3 sections of approximately 45 minutes each: 2D Composition & Colour, 3D Composition, and Visualization through Sketching.',
  },
  {
    question: 'Can I use watercolors in the NATA drawing test?',
    answer:
      'Yes, watercolors and poster colors are allowed in the NATA drawing test. You may also use color pencils, crayons, and sketch pens. However, oil paints and acrylic paints are not permitted.',
  },
];

const howToSteps = [
  {
    name: 'Master Basic Composition',
    text: 'Learn the principles of 2D composition including balance, rhythm, contrast, harmony, and unity. Practice creating compositions with geometric shapes, organic forms, and color schemes daily.',
  },
  {
    name: 'Practice 3D Visualization',
    text: 'Practice drawing isometric views, perspective drawings (1-point, 2-point, and 3-point), and converting 2D plans/elevations into 3D sketches. Build small physical models to understand form and space.',
  },
  {
    name: 'Learn Color Theory',
    text: 'Study the color wheel, complementary colors, analogous colors, triadic color schemes, warm and cool colors. Practice applying color theory in your compositions for visual impact.',
  },
  {
    name: 'Practice Time Management',
    text: 'Set a strict 45-minute timer for each section during practice. Learn to plan your composition in the first 5 minutes, execute in 35 minutes, and refine in the last 5 minutes.',
  },
  {
    name: 'Attempt Mock Drawing Tests',
    text: 'Take full-length mock drawing tests under exam conditions using the same materials you will use in the actual exam. Get feedback from architecture professionals or experienced teachers.',
  },
];

export default function DrawingTestPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);
  const baseUrl = 'https://neramclasses.com';
  const localeUrl = (path: string) => locale === 'en' ? `${baseUrl}${path}` : `${baseUrl}/${locale}${path}`;

  return (
    <>
      <JsonLd
        data={generateBreadcrumbSchema([
          { name: 'Home', url: localeUrl('') },
          { name: 'NATA 2026', url: localeUrl('/nata-2026') },
          { name: 'Drawing Test' },
        ])}
      />
      <JsonLd data={generateFAQSchema(faqs)} />
      <JsonLd
        data={generateHowToSchema({
          name: 'How to Prepare for NATA Drawing Test',
          description:
            'Step-by-step preparation guide for the NATA 2026 Drawing Test (Part A) covering composition, 3D visualization, color theory, time management, and mock tests.',
          steps: howToSteps,
          totalTime: 'P90D',
        })}
      />

      <Box>
        {/* Hero */}
        <Box sx={{ py: { xs: 8, md: 12 }, background: 'linear-gradient(135deg, #1a237e 0%, #0d47a1 100%)', color: 'white' }}>
          <Container maxWidth="lg">
            <Breadcrumbs
              variant="light"
              items={[
                { name: 'Home', href: `/${locale}` },
                { name: 'NATA 2026', href: `/${locale}/nata-2026` },
                { name: 'Drawing Test' },
              ]}
            />
            <Chip label="NATA 2026" sx={{ bgcolor: 'white', color: 'primary.main', mb: 2, fontWeight: 600 }} />
            <Typography variant="h1" component="h1" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '2rem', sm: '2.5rem', md: '3.5rem' } }}>
              NATA 2026 Drawing Test: Complete Guide
            </Typography>
            <Typography variant="h5" sx={{ mb: 2, opacity: 0.9, fontSize: { xs: '1.1rem', md: '1.5rem' } }}>
              The NATA 2026 Drawing Test (Part A) is worth 80 out of 200 marks and is conducted offline on A4 drawing sheets. It consists of 3 sections: 2D Composition & Colour (25 marks), 3D Composition (25 marks), and Visualization through Sketching (30 marks), with a total duration of 135 minutes.
            </Typography>
            <LastUpdatedBadge date="March 13, 2026" />
          </Container>
        </Box>

        {/* Overview Section */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" gutterBottom sx={{ mb: 4, fontWeight: 700 }}>
              Drawing Test Overview: Part A (80 Marks)
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4, lineHeight: 1.8 }}>
              The Drawing Test is the offline portion of NATA, conducted on physical A4 drawing sheets at the exam center. Unlike Part B (the online MCQ section), Part A tests your hands-on drawing, composition, and spatial visualization skills. It carries 80 out of 200 total marks and is divided into 3 distinct sections.
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 3 }}>
              {/* Card 1: 2D Composition */}
              <Card sx={{ height: '100%' }}>
                <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                  <Typography variant="h6" gutterBottom sx={{ fontWeight: 700, color: 'primary.main' }}>
                    Section A1: 2D Composition & Colour
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                    <Chip label="25 Marks" size="small" color="primary" variant="outlined" />
                    <Chip label="45 Min" size="small" variant="outlined" />
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7, mb: 2 }}>
                    Compose a 2D design using given elements such as shapes, colors, and themes. Tests your sense of composition, color harmony, and creative expression.
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
                    <strong>Medium:</strong> Color pencils, crayons, watercolors, or poster colors on A4 sheet.
                  </Typography>
                </CardContent>
              </Card>

              {/* Card 2: 3D Composition */}
              <Card sx={{ height: '100%', position: 'relative', overflow: 'visible' }}>
                <Chip
                  label="NEW"
                  size="small"
                  sx={{
                    position: 'absolute',
                    top: -10,
                    right: 16,
                    bgcolor: '#ff6d00',
                    color: 'white',
                    fontWeight: 700,
                    fontSize: '0.7rem',
                  }}
                />
                <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                  <Typography variant="h6" gutterBottom sx={{ fontWeight: 700, color: 'primary.main' }}>
                    Section A2: 3D Composition
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                    <Chip label="25 Marks" size="small" color="primary" variant="outlined" />
                    <Chip label="45 Min" size="small" variant="outlined" />
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7, mb: 2 }}>
                    Create a 3D model or composition using a physical kit provided at the center. Introduced in 2025, this section tests spatial understanding, form, and structure.
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
                    <strong>Medium:</strong> Physical kit provided at the exam center.
                  </Typography>
                </CardContent>
              </Card>

              {/* Card 3: Visualization through Sketching */}
              <Card sx={{ height: '100%' }}>
                <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                  <Typography variant="h6" gutterBottom sx={{ fontWeight: 700, color: 'primary.main' }}>
                    Section A3: Visualization through Sketching
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                    <Chip label="30 Marks" size="small" color="primary" variant="outlined" />
                    <Chip label="45 Min" size="small" variant="outlined" />
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7, mb: 2 }}>
                    Sketch a 3D perspective from given 2D plan and elevation views. Tests your ability to visualize three-dimensional forms from two-dimensional drawings.
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
                    <strong>Medium:</strong> Pencils (HB, 2B, 4B, 6B) on A4 sheet.
                  </Typography>
                </CardContent>
              </Card>
            </Box>
          </Container>
        </Box>

        {/* Materials Allowed Section */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" gutterBottom sx={{ mb: 4, fontWeight: 700 }}>
              Materials Allowed in the Drawing Test
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 3 }}>
              {/* Allowed */}
              <Card>
                <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                  <Typography variant="h6" gutterBottom sx={{ fontWeight: 700, color: 'success.main' }}>
                    Allowed
                  </Typography>
                  <List dense>
                    {[
                      'Pencils (HB, 2B, 4B, 6B)',
                      'Erasers',
                      'Sharpener',
                      'Color pencils',
                      'Crayons',
                      'Geometry box (compass, set squares, protractor, scale)',
                      'Watercolors',
                      'Poster colors',
                      'Sketch pens',
                    ].map((item, idx) => (
                      <ListItem key={idx} sx={{ px: 0 }}>
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          <Typography color="success.main" sx={{ fontWeight: 700 }}>&#x2713;</Typography>
                        </ListItemIcon>
                        <ListItemText primary={item} />
                      </ListItem>
                    ))}
                  </List>
                </CardContent>
              </Card>

              {/* Not Allowed */}
              <Card>
                <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                  <Typography variant="h6" gutterBottom sx={{ fontWeight: 700, color: 'error.main' }}>
                    Not Allowed
                  </Typography>
                  <List dense>
                    {[
                      'Oil paints',
                      'Acrylic paints',
                      'Electronic gadgets',
                      'Calculators',
                      'Textbooks',
                      'Reference materials',
                      'Pre-drawn sheets',
                    ].map((item, idx) => (
                      <ListItem key={idx} sx={{ px: 0 }}>
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          <Typography color="error.main" sx={{ fontWeight: 700 }}>&#x2717;</Typography>
                        </ListItemIcon>
                        <ListItemText primary={item} />
                      </ListItem>
                    ))}
                  </List>
                </CardContent>
              </Card>
            </Box>
          </Container>
        </Box>

        {/* Marking Scheme Section */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" gutterBottom sx={{ mb: 4, fontWeight: 700 }}>
              How the Drawing Test is Evaluated
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3, lineHeight: 1.8 }}>
              The drawing sheets are evaluated by a panel of expert evaluators from architecture and design backgrounds. Each drawing sheet is independently assessed by multiple evaluators, and the average score is taken to ensure fairness.
            </Typography>
            <Card sx={{ mb: 4 }}>
              <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>Key Evaluation Factors</Typography>
                <List>
                  {[
                    'Composition: Layout, balance, and visual hierarchy of the design',
                    'Creativity: Originality and imaginative use of given elements',
                    'Proportion: Accuracy of scale and relative sizes of objects',
                    'Perspective Accuracy: Correct representation of depth and 3D space',
                    'Use of Color: Effective application of color theory and harmony',
                    'Neatness: Clean execution, tidy lines, and overall presentation',
                  ].map((item, idx) => (
                    <ListItem key={idx} sx={{ px: 0 }}>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <Typography color="primary.main" sx={{ fontWeight: 700 }}>{idx + 1}.</Typography>
                      </ListItemIcon>
                      <ListItemText primary={item} />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Container>
        </Box>

        {/* Tips for Scoring High */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" gutterBottom sx={{ mb: 4, fontWeight: 700 }}>
              Tips to Score High in NATA Drawing Test
            </Typography>
            <Card>
              <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                <List>
                  {[
                    { primary: 'Practice daily', secondary: 'Draw at least 2-3 compositions per day. Consistency is more important than spending hours in one sitting.' },
                    { primary: 'Master 3D perspective', secondary: 'Practice isometric and perspective drawings (1-point, 2-point, 3-point). This is essential for Section A3.' },
                    { primary: 'Understand color theory', secondary: 'Learn complementary, analogous, and triadic color schemes. Good color use can significantly boost your Section A1 score.' },
                    { primary: 'Time management', secondary: 'Allocate 45 minutes per section strictly. Practice with a timer to build discipline.' },
                    { primary: 'Study architectural landmarks', secondary: 'Studying famous buildings and structures gives you a library of forms and compositions to draw from during the exam.' },
                    { primary: 'Practice with actual materials', secondary: 'Use the same pencils, colors, and drawing sheets you will use in the exam. Familiarity with your tools reduces exam-day anxiety.' },
                  ].map((item, idx) => (
                    <ListItem key={idx} sx={{ px: 0, alignItems: 'flex-start' }}>
                      <ListItemIcon sx={{ minWidth: 32, mt: 0.5 }}>
                        <Typography color="primary.main" sx={{ fontWeight: 700 }}>{idx + 1}.</Typography>
                      </ListItemIcon>
                      <ListItemText
                        primary={<Typography sx={{ fontWeight: 600 }}>{item.primary}</Typography>}
                        secondary={item.secondary}
                      />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Container>
        </Box>

        {/* CTA: Drawing Practice Tool */}
        <Box sx={{ py: { xs: 4, md: 6 }, bgcolor: 'background.default', textAlign: 'center' }}>
          <Container maxWidth="md">
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>
              Practice Drawing for NATA 2026
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              Use our free Drawing Practice tool with sample prompts, timer, and expert tips to sharpen your skills.
            </Typography>
            <Button variant="contained" size="large" component="a" href={`${APP_URL}/tools/nata/drawing-practice`} target="_blank" rel="noopener noreferrer">
              Start Drawing Practice (Free)
            </Button>
          </Container>
        </Box>

        {/* Also Read */}
        <Box sx={{ py: { xs: 6, md: 8 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="md">
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>Also Read</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              {[
                { title: 'NATA 2026 Syllabus', slug: 'syllabus' },
                { title: 'NATA 2026 Exam Pattern', slug: 'exam-pattern' },
                { title: 'Dos and Don\'ts for NATA', slug: 'dos-and-donts' },
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
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 4, fontWeight: 700 }}>FAQs: NATA 2026 Drawing Test</Typography>
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
            <Typography variant="h6" sx={{ mb: 4, opacity: 0.9 }}>Expert coaching, free tools, and personalized guidance.</Typography>
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

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
    title: 'NATA 2026 Preparation Tips: Expert Strategy & Study Plan',
    description:
      'Expert NATA 2026 preparation strategy with month-wise study plan. Section-wise tips for Drawing (80 marks), Mathematics & Aptitude (120 marks). Daily schedule, recommended resources, and common mistakes to avoid.',
    keywords:
      'NATA preparation tips, NATA study plan, how to prepare for NATA, NATA preparation strategy, NATA drawing tips, NATA 2026 preparation',
    alternates: buildAlternates(locale, '/nata-2026/preparation-tips'),
  };
}

interface PageProps {
  params: { locale: string };
}

const faqs = [
  {
    question: 'How many months should I prepare for NATA?',
    answer:
      'At least 6 months of dedicated preparation is recommended for NATA 2026. This gives you enough time to build drawing fundamentals (2 months), practice and improve (2 months), and take mock tests with focused revision (2 months). Students who start earlier can afford a more relaxed schedule.',
  },
  {
    question: 'How many hours should I study daily for NATA?',
    answer:
      '3-4 hours of focused daily study is ideal. Split your time with 1.5 hours on drawing practice, 1.5 hours on mathematics, and 1 hour on general aptitude and revision. Consistency matters more than long hours. Studying 3 hours daily for 6 months beats 8 hours daily for 2 months.',
  },
  {
    question: 'Should I join coaching for NATA preparation?',
    answer:
      'While self-study is possible with discipline, professional coaching provides structured guidance, expert feedback on drawings, curated mock tests, and peer learning. Coaching is especially helpful for the drawing section where subjective evaluation makes self-assessment difficult. Neram Classes offers both online and offline NATA coaching.',
  },
  {
    question: 'What is the best way to prepare for the NATA drawing test?',
    answer:
      'Practice daily compositions with themes like urban scenes, nature, abstract concepts, and architectural spaces. Study famous architectural landmarks and their design elements. Master color theory and shading techniques. Practice 3D visualization and perspective drawing. Time yourself, as you get limited time per drawing in the actual exam.',
  },
  {
    question: 'Can I prepare for NATA and JEE Paper 2 simultaneously?',
    answer:
      'Yes, there is significant overlap between NATA and JEE Paper 2 (B.Arch). Both test drawing ability, mathematical aptitude, and general awareness. The mathematics syllabus is largely common. However, JEE Paper 2 has a slightly different drawing format. Preparing for both together is efficient. Just practice the specific drawing formats of each exam separately.',
  },
  {
    question: 'What score should I target in NATA 2026?',
    answer:
      'Aim for 140+ out of 200 for admission to top architecture colleges. The drawing section (80 marks) is where most students can maximize scores with consistent practice. For mathematics and aptitude (120 marks), target 80+ by focusing on accuracy over speed. A balanced performance across both sections is key.',
  },
];

const studyPlanPhases = [
  {
    phase: 'Phase 1',
    months: 'Month 1-2',
    title: 'Foundation Building',
    color: '#1565c0',
    items: [
      'Learn basics of freehand drawing: lines, shapes, proportions',
      'Study fundamental math concepts: algebra, trigonometry basics',
      'Build aptitude foundation: logical reasoning, pattern recognition',
      'Practice basic 2D compositions and sketching daily',
      'Study famous architectural styles and landmarks',
      'Start a drawing journal and sketch one object daily',
    ],
  },
  {
    phase: 'Phase 2',
    months: 'Month 3-4',
    title: 'Practice & Improvement',
    color: '#2e7d32',
    items: [
      'Practice 2-3 full compositions daily with time limits',
      'Solve advanced math problems: coordinate geometry, mensuration',
      'Build general knowledge of architecture and current affairs',
      'Practice color theory and shading techniques',
      'Attempt section-wise mock tests weekly',
      'Analyze mistakes and maintain an error log',
    ],
  },
  {
    phase: 'Phase 3',
    months: 'Month 5-6',
    title: 'Mock Tests & Revision',
    color: '#e65100',
    items: [
      'Take 2-3 full-length mock tests per week',
      'Focus on weak areas identified from mock test analysis',
      'Master time management by practicing completing sections within limits',
      'Revise all math formulas and aptitude shortcuts',
      'Practice drawing under exam-like pressure',
      'Review previous year NATA papers for pattern familiarity',
    ],
  },
];

const sectionStrategies = [
  {
    title: 'Drawing & Composition',
    marks: '80 marks',
    color: '#1565c0',
    tips: [
      'Practice 2-3 compositions daily on diverse themes (urban, nature, abstract)',
      'Study architectural landmarks: Taj Mahal, Lotus Temple, Fallingwater, Guggenheim',
      'Master color theory: understand complementary, analogous, and triadic schemes',
      'Practice 3D visualization: isometric views, perspective drawing, shadow casting',
      'Develop your own unique style while maintaining technical accuracy',
      'Time yourself strictly, as exam conditions have limited time per drawing',
    ],
  },
  {
    title: 'Mathematics',
    marks: '40 marks (Part B)',
    color: '#2e7d32',
    tips: [
      'Focus on algebra, trigonometry, coordinate geometry, and mensuration',
      'Practice mental math for speed and avoid calculator dependency',
      'Master formulas: areas, volumes, trigonometric identities',
      'Solve 20-30 problems daily from each topic',
      'Learn shortcut methods for common calculation patterns',
      'Practice with previous year NATA math questions',
    ],
  },
  {
    title: 'General Aptitude',
    marks: '80 marks (Part B)',
    color: '#7b1fa2',
    tips: [
      'Build general knowledge of Indian and world architecture',
      'Stay updated with current affairs related to design and architecture',
      'Practice logical reasoning: sequences, analogies, classifications',
      'Develop visual perception: identify patterns, symmetry, spatial relationships',
      'Study basic physics concepts: light, color, materials, structures',
      'Read about famous architects and their signature styles',
    ],
  },
];

const dailySchedule = [
  { time: '6:00 - 7:30 AM', activity: 'Drawing Practice', duration: '1.5 hrs', description: 'Freehand compositions, sketching, perspective drawing', color: '#1565c0' },
  { time: '8:00 - 9:30 AM', activity: 'Mathematics', duration: '1.5 hrs', description: 'Problem solving, formula practice, previous year questions', color: '#2e7d32' },
  { time: '4:00 - 5:30 PM', activity: 'General Aptitude & GK', duration: '1.5 hrs', description: 'Reasoning, architecture GK, current affairs, visual perception', color: '#7b1fa2' },
  { time: '7:00 - 8:00 PM', activity: 'Mock Test / Revision', duration: '1 hr', description: 'Timed mock tests or revision of weak areas', color: '#e65100' },
];

const commonMistakes = [
  'Ignoring the drawing section, which carries 80 marks and is the easiest to improve with practice',
  'Not practicing under timed conditions. Speed and time management are critical in NATA',
  'Skipping 3D composition practice. Spatial visualization questions are high-weightage',
  'Memorizing instead of understanding math concepts. NATA tests application, not rote learning',
  'Not taking enough full-length mock tests. Mock tests build exam temperament and identify weak areas',
  'Starting preparation too late. 6 months minimum is needed for a strong foundation',
];

const howToSteps = [
  { name: 'Understand the Exam Pattern', text: 'Study the NATA 2026 exam structure: Part A (Drawing, 80 marks) and Part B (Mathematics 40 marks + General Aptitude 80 marks). Understand marking scheme, duration, and question types.' },
  { name: 'Build Drawing Fundamentals', text: 'Start with basic freehand drawing skills: lines, shapes, proportions, and perspectives. Practice daily sketching and study architectural compositions. Build a foundation in color theory and shading.' },
  { name: 'Master Mathematics Topics', text: 'Cover algebra, trigonometry, coordinate geometry, mensuration, and 3D geometry. Practice problem-solving daily and learn shortcut methods for common calculations.' },
  { name: 'Develop General Aptitude', text: 'Build knowledge of architecture, design principles, logical reasoning, and visual perception. Stay updated with current affairs related to architecture and design.' },
  { name: 'Practice with Mock Tests', text: 'Start taking section-wise mock tests from Month 3 and full-length mock tests from Month 5. Analyze your performance, identify weak areas, and track improvement over time.' },
  { name: 'Review and Revise', text: 'In the final month, focus on revision of formulas, practice weak areas, and take mock tests under exam conditions. Maintain an error log and review it regularly.' },
];

export default function PreparationTipsPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);
  const baseUrl = 'https://neramclasses.com';
  const localeUrl = (path: string) => locale === 'en' ? `${baseUrl}${path}` : `${baseUrl}/${locale}${path}`;

  return (
    <>
      <JsonLd
        data={generateBreadcrumbSchema([
          { name: 'Home', url: localeUrl('') },
          { name: 'NATA 2026', url: localeUrl('/nata-2026') },
          { name: 'Preparation Tips' },
        ])}
      />
      <JsonLd data={generateFAQSchema(faqs)} />
      <JsonLd
        data={generateHowToSchema({
          name: 'How to Prepare for NATA 2026',
          description: 'A step-by-step guide to prepare for NATA 2026 exam with a 6-month study plan covering drawing, mathematics, and general aptitude.',
          steps: howToSteps,
          totalTime: 'P180D',
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
                { name: 'Preparation Tips' },
              ]}
            />
            <Chip label="NATA 2026" sx={{ bgcolor: 'white', color: 'primary.main', mb: 2, mt: 2, fontWeight: 600 }} />
            <Typography variant="h1" component="h1" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '2rem', sm: '2.5rem', md: '3.5rem' } }}>
              NATA 2026 Preparation Tips
            </Typography>
            <Typography variant="h5" sx={{ mb: 2, opacity: 0.9, fontSize: { xs: '1.1rem', md: '1.5rem' } }}>
              Start your NATA 2026 preparation at least 6 months before the exam. Focus 60% of your time on Drawing &amp; Composition (80 marks) and 40% on Mathematics &amp; General Aptitude (120 marks). Daily practice of 3-4 hours with structured mock tests is the proven strategy for scoring above 140.
            </Typography>
            <LastUpdatedBadge date="March 13, 2026" />
          </Container>
        </Box>

        {/* Month-wise Study Plan */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" gutterBottom sx={{ mb: 4, fontWeight: 700 }}>
              Month-wise NATA 2026 Study Plan
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4, lineHeight: 1.8 }}>
              A structured 6-month study plan divided into three phases. Each phase builds on the previous one, gradually increasing difficulty and exam readiness.
            </Typography>
            {studyPlanPhases.map((phase) => (
              <Card key={phase.phase} sx={{ mb: 3 }}>
                <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                    <Chip label={phase.phase} sx={{ bgcolor: phase.color, color: 'white', fontWeight: 600 }} />
                    <Typography variant="subtitle2" color="text.secondary">{phase.months}</Typography>
                  </Box>
                  <Typography variant="h6" gutterBottom sx={{ fontWeight: 700 }}>{phase.title}</Typography>
                  <List>
                    {phase.items.map((item, idx) => (
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
            ))}
          </Container>
        </Box>

        {/* Section-wise Strategy */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" gutterBottom sx={{ mb: 4, fontWeight: 700 }}>
              Section-wise Preparation Strategy
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4, lineHeight: 1.8 }}>
              NATA 2026 has two parts: Drawing (Part A, 80 marks) and MCQ (Part B, 120 marks). Here is a detailed strategy for each section.
            </Typography>
            {sectionStrategies.map((section) => (
              <Card key={section.title} sx={{ mb: 3 }}>
                <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>{section.title}</Typography>
                    <Chip label={section.marks} size="small" sx={{ bgcolor: section.color, color: 'white', fontWeight: 600 }} />
                  </Box>
                  <List>
                    {section.tips.map((tip, idx) => (
                      <ListItem key={idx} sx={{ px: 0 }}>
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          <Typography sx={{ fontWeight: 700, color: section.color }}>&#x2022;</Typography>
                        </ListItemIcon>
                        <ListItemText primary={tip} />
                      </ListItem>
                    ))}
                  </List>
                </CardContent>
              </Card>
            ))}
          </Container>
        </Box>

        {/* Daily Schedule */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" gutterBottom sx={{ mb: 4, fontWeight: 700 }}>
              Recommended Daily Study Schedule
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4, lineHeight: 1.8 }}>
              A balanced daily schedule of 5.5 hours covering all sections. Adjust timings to fit your routine, but maintain the proportions.
            </Typography>
            {dailySchedule.map((slot) => (
              <Card key={slot.time} sx={{ mb: 2 }}>
                <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
                  <Box sx={{ display: 'flex', alignItems: { xs: 'flex-start', md: 'center' }, gap: { xs: 1, md: 3 }, flexDirection: { xs: 'column', md: 'row' } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: { md: 160 } }}>
                      <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: slot.color, flexShrink: 0 }} />
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{slot.time}</Typography>
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{slot.activity}</Typography>
                        <Chip label={slot.duration} size="small" variant="outlined" />
                      </Box>
                      <Typography variant="body2" color="text.secondary">{slot.description}</Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Container>
        </Box>

        {/* Common Mistakes to Avoid */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" gutterBottom sx={{ mb: 4, fontWeight: 700 }}>
              Common Mistakes NATA Aspirants Make
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3, lineHeight: 1.8 }}>
              Avoid these common pitfalls that can cost you valuable marks and preparation time.
            </Typography>
            <Card>
              <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                <List>
                  {commonMistakes.map((mistake, idx) => (
                    <ListItem key={idx} sx={{ px: 0 }}>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <Typography color="error.main" sx={{ fontWeight: 700, fontSize: '1.1rem' }}>&#x2717;</Typography>
                      </ListItemIcon>
                      <ListItemText primary={mistake} />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Container>
        </Box>

        {/* CTA: Tools */}
        <Box sx={{ py: { xs: 4, md: 6 }, bgcolor: 'background.default', textAlign: 'center' }}>
          <Container maxWidth="md">
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>
              Practice with our free NATA tools
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              Use our free mock tests, drawing practice tools, and score predictor to boost your NATA preparation.
            </Typography>
            <Button variant="contained" size="large" component="a" href={`${APP_URL}/tools/nata`} target="_blank" rel="noopener noreferrer">
              Explore NATA Tools (Free)
            </Button>
          </Container>
        </Box>

        {/* Also Read */}
        <Box sx={{ py: { xs: 6, md: 8 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="md">
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>Also Read</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              {[
                { title: 'NATA 2026 Drawing Test', slug: 'drawing-test' },
                { title: 'NATA 2026 Syllabus', slug: 'syllabus' },
                { title: 'NATA 2026 Exam Pattern', slug: 'exam-pattern' },
                { title: 'Scoring & Results', slug: 'scoring-and-results' },
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
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 4, fontWeight: 700 }}>FAQs: NATA 2026 Preparation</Typography>
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

import { Box, Typography, Button, Grid, Card, CardContent, Paper, Accordion, AccordionSummary, AccordionDetails, Divider } from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Link from 'next/link';
import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateFAQSchema } from '@/lib/seo/schemas';
import { APP_URL, ORG_NAME, MARKETING_URL, SOCIAL_PROFILES } from '@/lib/seo/constants';
import { RelatedTools } from '@/components/seo/RelatedTools';

const TOOL_NAME = 'NATA Question Bank 2026';
const TOOL_URL = `${APP_URL}/tools/question-bank`;
const PROTECTED_URL = '/login?redirect=/tools/nata/question-bank';

export function generateMetadata(): Metadata {
  return {
    title: 'Free NATA Question Bank 2026 | Practice Questions, Previous Year Papers & Mock Tests',
    description:
      'Practice NATA 2026 questions for free. Community-contributed question bank with section-wise practice, difficulty ratings, and topic-wise filtering.',
    keywords: [
      'NATA question bank',
      'NATA previous year questions',
      'NATA practice questions',
      'NATA mock test questions',
      'NATA 2026 sample papers',
      'NATA drawing questions',
      'NATA MCQ practice',
      'NATA aptitude questions',
      'NATA mathematics questions',
      'NATA preparation questions free',
    ],
    openGraph: {
      title: 'Free NATA Question Bank 2026 | Neram Classes',
      description:
        'Practice NATA 2026 questions for free. Section-wise practice with difficulty ratings and topic-wise filtering.',
      type: 'website',
      url: TOOL_URL,
      siteName: ORG_NAME,
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Free NATA Question Bank 2026',
      description:
        'Practice NATA 2026 questions for free. Section-wise practice with difficulty ratings and topic-wise filtering.',
    },
    alternates: {
      canonical: TOOL_URL,
    },
  };
}

const faqs = [
  {
    question: 'Is the NATA question bank completely free?',
    answer:
      'Yes, the NATA question bank by Neram Classes is 100% free. You can access all questions, practice by topic, and track your performance without any payment. We believe every NATA aspirant should have access to quality practice material regardless of their financial situation. Create a free account to start practising — it takes less than a minute.',
  },
  {
    question: 'How many questions are in the NATA question bank?',
    answer:
      'Our NATA question bank currently contains hundreds of questions across all sections — Mathematics, Physics, General Aptitude, Logical Reasoning, and Drawing. The bank is continuously growing as our community of students and educators contributes new questions. Questions are reviewed and verified before being added to maintain quality. New questions are added weekly based on the NATA 2026 syllabus.',
  },
  {
    question: 'Are these questions from real NATA exams?',
    answer:
      'The question bank includes a mix of sources: questions based on patterns from previous NATA exams (2018-2025), original questions created by architecture educators aligned with the NATA syllabus, and community-contributed questions from students and teachers. While we cannot publish actual NATA exam papers due to copyright, all questions follow the exact pattern, difficulty level, and topic distribution of the real NATA exam.',
  },
  {
    question: 'Can I contribute questions to the NATA question bank?',
    answer:
      'Yes, our question bank is community-powered. After creating a free account, you can submit questions in any NATA topic. Submitted questions go through a moderation process where they are reviewed for accuracy, difficulty level, and alignment with the NATA syllabus. Approved contributions earn you recognition in the community. This collaborative approach ensures a diverse and comprehensive question collection.',
  },
  {
    question: 'Does the question bank cover Drawing section questions?',
    answer:
      'Yes, the question bank includes Drawing section practice with visual prompts, reference images, and evaluation criteria. Drawing questions cover perspective drawing, 2D composition, 3D visualization, creating aesthetically pleasing compositions, and imagination-based sketching — all aligned with NATA Part A (80 marks). While you cannot replicate the exact digital drawing experience of the TCS iON platform, these practice prompts help you build creativity and speed.',
  },
  {
    question: 'How is the question bank different from mock tests?',
    answer:
      'The question bank allows topic-wise, untimed practice so you can focus on weak areas at your own pace. You can filter by subject (Mathematics, Physics, Aptitude), difficulty (Easy, Medium, Hard), and specific topics. Mock tests, on the other hand, simulate the full NATA exam with time limits and section rules. We recommend using the question bank for daily practice and targeted improvement, and mock tests for exam simulation closer to the test date.',
  },
];

const steps = [
  {
    number: '1',
    title: 'Choose a Section',
    description: 'Select from Mathematics, Physics, General Aptitude, Logical Reasoning, or Drawing practice.',
  },
  {
    number: '2',
    title: 'Filter by Topic & Difficulty',
    description: 'Narrow down to specific topics like Trigonometry, 3D Visualization, or Perspective Drawing. Set difficulty level.',
  },
  {
    number: '3',
    title: 'Practice Questions',
    description: 'Attempt questions one by one with instant feedback, detailed solutions, and explanation for each answer.',
  },
  {
    number: '4',
    title: 'Track Your Progress',
    description: 'See your accuracy by topic, identify weak areas, and revisit incorrectly answered questions for revision.',
  },
];

const features = [
  'Section-wise practice for all NATA subjects',
  'Difficulty ratings — Easy, Medium, and Hard for each question',
  'Topic-wise filtering for targeted preparation',
  'Detailed solutions and explanations for every question',
  'Community-contributed and expert-reviewed questions',
  'Drawing section prompts with visual references',
  'Progress tracking to identify weak topics',
  'Completely free — no premium tier or hidden charges',
];

const sections = [
  {
    name: 'Mathematics',
    topics: 'Algebra, Trigonometry, Coordinate Geometry, 3D Geometry, Calculus, Statistics',
    marks: '~40 marks in Part B',
  },
  {
    name: 'Physics',
    topics: 'Mechanics, Heat, Optics, Electricity, Modern Physics',
    marks: '~20 marks in Part B',
  },
  {
    name: 'General Aptitude',
    topics: 'Architecture awareness, Visual reasoning, Current affairs, Design thinking',
    marks: '~30 marks in Part B',
  },
  {
    name: 'Logical Reasoning',
    topics: 'Pattern recognition, Series completion, Spatial ability, Analytical reasoning',
    marks: '~30 marks in Part B',
  },
  {
    name: 'Drawing (Part A)',
    topics: 'Perspective drawing, 2D/3D composition, Imagination sketching, Aesthetic sensitivity',
    marks: '80 marks (2 questions)',
  },
];

export default function QuestionBankPage() {
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: APP_URL },
      { '@type': 'ListItem', position: 2, name: 'Tools', item: `${APP_URL}/tools` },
      { '@type': 'ListItem', position: 3, name: 'Question Bank', item: TOOL_URL },
    ],
  };

  const webAppSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: TOOL_NAME,
    applicationCategory: 'EducationalApplication',
    applicationSubCategory: 'Exam Practice Question Bank',
    url: TOOL_URL,
    operatingSystem: 'Web',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
    description:
      'Free NATA 2026 question bank with section-wise practice questions, difficulty ratings, detailed solutions, and community contributions. Practice Mathematics, Physics, Aptitude, Reasoning, and Drawing.',
    featureList: features,
    isAccessibleForFree: true,
    provider: {
      '@type': 'EducationalOrganization',
      name: ORG_NAME,
      url: MARKETING_URL,
      sameAs: SOCIAL_PROFILES,
    },
    audience: {
      '@type': 'EducationalAudience',
      educationalRole: 'student',
      audienceType: 'NATA 2026 aspirants preparing for the exam',
    },
  };

  const faqSchema = generateFAQSchema(faqs);

  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={webAppSchema} />
      <JsonLd data={faqSchema} />

      <Box sx={{ py: { xs: 3, md: 6 } }}>
        {/* Hero / Answer-First Section */}
        <Box sx={{ textAlign: 'center', mb: { xs: 4, md: 6 } }}>
          <Typography
            variant="h3"
            component="h1"
            gutterBottom
            sx={{ fontWeight: 700, fontSize: { xs: '1.75rem', md: '2.5rem' }, lineHeight: 1.3 }}
          >
            Free NATA Question Bank 2026 — Practice Questions by Topic & Difficulty
          </Typography>

          <Typography
            variant="h6"
            component="p"
            sx={{
              maxWidth: 800,
              mx: 'auto',
              mb: 3,
              fontSize: { xs: '1rem', md: '1.15rem' },
              color: 'text.secondary',
              lineHeight: 1.7,
            }}
          >
            The NATA Question Bank is a free, community-powered collection of practice questions for
            NATA 2026 exam preparation. It covers all five sections of the exam — Mathematics, Physics,
            General Aptitude, Logical Reasoning, and Drawing — with questions rated by difficulty level
            (Easy, Medium, Hard) and organized by specific topics. Each question comes with a detailed
            solution and explanation so you understand the concept, not just the answer. The bank is
            continuously updated with new questions contributed by students and verified by educators.
            Whether you want to strengthen a weak topic like Trigonometry, practice 3D visualization
            problems, or attempt drawing prompts for Part A (80 marks), this tool helps you prepare
            systematically for the NATA exam which carries a total of 200 marks across a 3-hour
            computer-based test.
          </Typography>

          <Button
            component={Link}
            href={PROTECTED_URL}
            variant="contained"
            size="large"
            sx={{ px: 4, py: 1.5, fontSize: { xs: '1rem', md: '1.1rem' }, fontWeight: 600 }}
          >
            Start Practising Free
          </Button>
        </Box>

        <Divider sx={{ my: { xs: 3, md: 5 } }} />

        {/* How It Works */}
        <Box sx={{ mb: { xs: 4, md: 6 } }}>
          <Typography
            variant="h4"
            component="h2"
            gutterBottom
            sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', md: '2rem' }, textAlign: 'center', mb: 4 }}
          >
            How the NATA Question Bank Works
          </Typography>

          <Grid container spacing={3}>
            {steps.map((step) => (
              <Grid item xs={12} sm={6} md={3} key={step.number}>
                <Card sx={{ height: '100%', textAlign: 'center', p: 2 }}>
                  <CardContent>
                    <Box
                      sx={{
                        width: 48,
                        height: 48,
                        borderRadius: '50%',
                        bgcolor: 'primary.main',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        mx: 'auto',
                        mb: 2,
                        fontSize: '1.25rem',
                        fontWeight: 700,
                      }}
                    >
                      {step.number}
                    </Box>
                    <Typography variant="h6" gutterBottom fontWeight={600}>
                      {step.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {step.description}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>

        <Divider sx={{ my: { xs: 3, md: 5 } }} />

        {/* Key Features */}
        <Box sx={{ mb: { xs: 4, md: 6 } }}>
          <Typography
            variant="h4"
            component="h2"
            gutterBottom
            sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', md: '2rem' }, textAlign: 'center', mb: 3 }}
          >
            Key Features of the NATA Practice Question Bank
          </Typography>

          <Grid container spacing={2} sx={{ maxWidth: 900, mx: 'auto' }}>
            {features.map((feature) => (
              <Grid item xs={12} sm={6} key={feature}>
                <Paper
                  variant="outlined"
                  sx={{ p: 2, display: 'flex', alignItems: 'flex-start', gap: 1.5 }}
                >
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      bgcolor: 'primary.main',
                      mt: 0.8,
                      flexShrink: 0,
                    }}
                  />
                  <Typography variant="body1">{feature}</Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Box>

        <Divider sx={{ my: { xs: 3, md: 5 } }} />

        {/* Section-wise Breakdown */}
        <Box sx={{ mb: { xs: 4, md: 6 } }}>
          <Typography
            variant="h4"
            component="h2"
            gutterBottom
            sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', md: '2rem' }, textAlign: 'center', mb: 3 }}
          >
            NATA 2026 Sections Covered in the Question Bank
          </Typography>

          <Paper variant="outlined" sx={{ maxWidth: 750, mx: 'auto', overflow: 'hidden' }}>
            {sections.map((section, i) => (
              <Box
                key={section.name}
                sx={{
                  px: 3,
                  py: 2,
                  bgcolor: i % 2 === 0 ? 'grey.50' : 'white',
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                  <Typography variant="body1" fontWeight={700}>
                    {section.name}
                  </Typography>
                  <Typography variant="body2" color="primary.main" fontWeight={600}>
                    {section.marks}
                  </Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  {section.topics}
                </Typography>
              </Box>
            ))}
          </Paper>
        </Box>

        <Divider sx={{ my: { xs: 3, md: 5 } }} />

        {/* Who Is This For */}
        <Box sx={{ mb: { xs: 4, md: 6 } }}>
          <Typography
            variant="h4"
            component="h2"
            gutterBottom
            sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', md: '2rem' }, textAlign: 'center', mb: 3 }}
          >
            Who Should Use the NATA Question Bank?
          </Typography>

          <Grid container spacing={2} sx={{ maxWidth: 900, mx: 'auto' }}>
            {[
              {
                title: 'Self-study NATA Aspirants',
                desc: 'Students preparing for NATA on their own who need structured practice material organized by topic and difficulty level.',
              },
              {
                title: 'Coaching Center Students',
                desc: 'Students enrolled in NATA coaching who want additional practice beyond classroom material to strengthen weak topics.',
              },
              {
                title: 'Last-minute Revisers',
                desc: 'Students close to the exam date who want to quickly revise important topics by practising curated questions section-wise.',
              },
              {
                title: 'NATA Educators & Tutors',
                desc: 'Teachers and private tutors who want a ready-made question bank to assign practice work or conduct topic tests for their students.',
              },
            ].map((item) => (
              <Grid item xs={12} sm={6} key={item.title}>
                <Card variant="outlined" sx={{ height: '100%', p: 2 }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom fontWeight={600}>
                      {item.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {item.desc}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>

        <Divider sx={{ my: { xs: 3, md: 5 } }} />

        {/* FAQ Section */}
        <Box sx={{ mb: { xs: 4, md: 6 } }}>
          <Typography
            variant="h4"
            component="h2"
            gutterBottom
            sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', md: '2rem' }, textAlign: 'center', mb: 3 }}
          >
            Frequently Asked Questions — NATA Question Bank
          </Typography>

          <Box sx={{ maxWidth: 800, mx: 'auto' }}>
            {faqs.map((faq) => (
              <Accordion key={faq.question} disableGutters>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography fontWeight={600}>{faq.question}</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
                    {faq.answer}
                  </Typography>
                </AccordionDetails>
              </Accordion>
            ))}
          </Box>
        </Box>

        <RelatedTools currentHref="/tools/question-bank" />

        {/* Final CTA */}
        <Box
          sx={{
            textAlign: 'center',
            py: { xs: 4, md: 6 },
            px: 3,
            bgcolor: 'primary.50',
            borderRadius: 2,
          }}
        >
          <Typography
            variant="h4"
            component="h2"
            gutterBottom
            sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', md: '2rem' } }}
          >
            Start Practising NATA Questions Today
          </Typography>
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ maxWidth: 600, mx: 'auto', mb: 3, lineHeight: 1.7 }}
          >
            Access hundreds of NATA practice questions organized by section, topic, and difficulty.
            Get detailed solutions for every question. Completely free — no payment required.
          </Typography>
          <Button
            component={Link}
            href={PROTECTED_URL}
            variant="contained"
            size="large"
            sx={{ px: 5, py: 1.5, fontSize: { xs: '1rem', md: '1.1rem' }, fontWeight: 600 }}
          >
            Use This Tool Free
          </Button>
        </Box>
      </Box>
    </>
  );
}

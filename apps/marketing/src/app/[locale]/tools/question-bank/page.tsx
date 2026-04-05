import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  generateBreadcrumbSchema,
  generateWebApplicationSchema,
  generateFAQSchema,
} from '@/lib/seo/schemas';
import { buildAlternates, buildOgImage } from '@/lib/seo/metadata';
import {
  Box,
  Container,
  Typography,
  Button,
  Grid,
  Card,
  CardContent,
  Paper,
  Divider,
} from '@neram/ui';
import Link from 'next/link';

const baseUrl = 'https://neramclasses.com';
const appUrl = 'https://app.neramclasses.com';


const faqs = [
  {
    question: 'Where do the questions in the NATA Question Bank come from?',
    answer:
      'The NATA Question Bank includes community-contributed questions from students and teachers, questions modelled on previous year NATA papers, and original questions designed by our expert faculty. Each question is reviewed for accuracy and tagged by section, topic, and difficulty level before being published.',
  },
  {
    question: 'How many questions are available in the NATA Question Bank?',
    answer:
      'The question bank currently contains 1000+ questions across all three NATA sections: Mathematics, General Aptitude, and Drawing. New questions are added weekly by our community and faculty. You can filter by section, topic, and difficulty to focus your practice.',
  },
  {
    question: 'Does the Question Bank cover all NATA 2026 sections?',
    answer:
      'Yes. The Question Bank covers all three sections of NATA 2026: Mathematics (PCM topics: algebra, trigonometry, calculus, coordinate geometry, 3D geometry), General Aptitude (visual perception, spatial reasoning, colour theory, architecture awareness, logical reasoning), and Drawing (2D composition, 3D visualisation, perspective drawing, design sense).',
  },
  {
    question: 'Are the questions based on the latest NATA 2026 syllabus?',
    answer:
      'Yes. All questions are mapped to the official NATA 2026 syllabus published by the Council of Architecture. When the syllabus changes, questions are re-tagged and new questions are added for any new topics. The difficulty distribution mirrors the actual exam pattern.',
  },
  {
    question: 'Can I track my progress and performance?',
    answer:
      'Yes. When you practice in the Neram Classes app, your performance is tracked automatically. You can see section-wise accuracy, time per question, weak topics, improvement trends, and compare your performance with other students. Detailed analytics help you focus on areas that need the most work.',
  },
  {
    question: 'Is the NATA Question Bank free?',
    answer:
      'Yes, the core question bank is completely free. You can practice unlimited questions, view answers with explanations, and track basic progress, all without payment. Premium features like timed mock tests, detailed analytics, and AI-powered weak topic analysis are available with a Neram Classes subscription.',
  },
];

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title:
      'NATA Question Bank 2026: Free Practice Questions for Architecture Entrance',
    description:
      'Free NATA 2026 question bank with 1000+ practice questions. Section-wise practice for Mathematics, General Aptitude, and Drawing. Difficulty ratings, topic filters, and detailed solutions.',
    keywords:
      'NATA question bank, NATA practice questions, NATA mock test, NATA previous year questions free, NATA 2026 questions, NATA preparation questions, architecture entrance practice',
    alternates: buildAlternates(locale, '/tools/question-bank'),
    openGraph: {
      title:
        'NATA Question Bank 2026: Free Practice Questions for Architecture Entrance',
      description:
        'Free NATA question bank with 1000+ practice questions across Mathematics, General Aptitude, and Drawing sections.',
      url:
        locale === 'en'
          ? `${baseUrl}/tools/question-bank`
          : `${baseUrl}/${locale}/tools/question-bank`,
      type: 'website',
      images: [
        {
          url: buildOgImage(
            'NATA Question Bank 2026',
            'Free practice questions',
            'tool'
          ),
        },
      ],
    },
  };
}

export default function QuestionBankPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);

  return (
    <>
      <JsonLd
        data={[
          generateBreadcrumbSchema([
            { name: 'Home', url: baseUrl },
            { name: 'Tools', url: `${baseUrl}/tools` },
            {
              name: 'Question Bank',
              url: `${baseUrl}/tools/question-bank`,
            },
          ]),
          generateWebApplicationSchema({
            name: 'NATA Question Bank 2026',
            description:
              'Free NATA 2026 question bank with 1000+ practice questions across Mathematics, General Aptitude, and Drawing sections.',
            url: `${baseUrl}/tools/question-bank`,
            applicationCategory: 'EducationalApplication',
          }),
          generateFAQSchema(faqs),
        ]}
      />

      {/* Hero Section */}
      <Box
        sx={{
          background: 'linear-gradient(135deg, #7B1FA2 0%, #4A148C 100%)',
          color: 'white',
          py: { xs: 6, md: 10 },
          px: 2,
        }}
      >
        <Container maxWidth="md">
          <Typography
            component="h1"
            sx={{
              fontSize: { xs: '1.75rem', md: '2.5rem' },
              fontWeight: 800,
              mb: 2,
              lineHeight: 1.2,
            }}
          >
            NATA Question Bank 2026
          </Typography>
          <Typography
            sx={{
              fontSize: { xs: '1rem', md: '1.25rem' },
              mb: 3,
              opacity: 0.95,
              lineHeight: 1.6,
            }}
          >
            Practice for NATA 2026 with our free question bank containing 1000+
            questions across all three exam sections. The NATA Question Bank
            gives you section-wise practice for Mathematics, General Aptitude,
            and Drawing, the three pillars of the architecture entrance exam.
            Every question is tagged by topic, difficulty level (Easy, Medium,
            Hard), and section, so you can focus your preparation exactly where
            you need it. Community-contributed questions add real variety, while
            faculty-designed questions match the actual exam pattern. Whether you
            are starting your NATA preparation or doing last-minute revision,
            targeted practice with our question bank builds the speed and
            accuracy you need to score above 120.
          </Typography>
          <Button
            component={Link}
            href={`${appUrl}/tools/nata/question-bank`}
            variant="contained"
            size="large"
            sx={{
              bgcolor: 'white',
              color: '#7B1FA2',
              fontWeight: 700,
              px: 4,
              py: 1.5,
              fontSize: '1.1rem',
              '&:hover': { bgcolor: '#F3E5F5' },
            }}
          >
            Use This Tool Free &rarr;
          </Button>
        </Container>
      </Box>

      {/* How It Works */}
      <Container maxWidth="md" sx={{ py: { xs: 5, md: 8 } }}>
        <Typography
          component="h2"
          sx={{
            fontSize: { xs: '1.5rem', md: '2rem' },
            fontWeight: 700,
            mb: 4,
            textAlign: 'center',
          }}
        >
          How the Question Bank Works
        </Typography>
        <Grid container spacing={3}>
          {[
            {
              step: '1',
              title: 'Choose a Section',
              desc: 'Select from Mathematics (PCM), General Aptitude (visual/spatial reasoning), or Drawing. Each section has dedicated question sets matching the NATA 2026 pattern.',
            },
            {
              step: '2',
              title: 'Filter by Topic & Difficulty',
              desc: 'Narrow down to specific topics like trigonometry, colour theory, or 3D visualisation. Choose Easy, Medium, or Hard difficulty to match your current level.',
            },
            {
              step: '3',
              title: 'Practice & Learn',
              desc: 'Attempt questions one at a time or in sets. View detailed solutions after each answer. Understand the reasoning, not just the correct option.',
            },
            {
              step: '4',
              title: 'Track Your Progress',
              desc: 'See your accuracy by topic, time per question, and improvement over time. Identify weak areas and focus your remaining study time effectively.',
            },
          ].map((item) => (
            <Grid item xs={12} sm={6} key={item.step}>
              <Card
                elevation={0}
                sx={{ border: '1px solid #E0E0E0', height: '100%' }}
              >
                <CardContent sx={{ p: 3 }}>
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      bgcolor: '#7B1FA2',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '1.1rem',
                      mb: 2,
                    }}
                  >
                    {item.step}
                  </Box>
                  <Typography
                    component="h3"
                    sx={{ fontWeight: 700, fontSize: '1.1rem', mb: 1 }}
                  >
                    {item.title}
                  </Typography>
                  <Typography sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                    {item.desc}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>

      <Divider />

      {/* Key Features */}
      <Box sx={{ bgcolor: '#FAFAFA', py: { xs: 5, md: 8 } }}>
        <Container maxWidth="md">
          <Typography
            component="h2"
            sx={{
              fontSize: { xs: '1.5rem', md: '2rem' },
              fontWeight: 700,
              mb: 4,
              textAlign: 'center',
            }}
          >
            Key Features
          </Typography>
          <Grid container spacing={3}>
            {[
              {
                title: '1000+ Practice Questions',
                desc: 'A growing library of questions covering the entire NATA 2026 syllabus. New questions are added weekly by our faculty and student community.',
              },
              {
                title: 'Section-wise Practice',
                desc: 'Dedicated question sets for Mathematics (algebra, trig, calculus, geometry), General Aptitude (visual perception, spatial reasoning, colour theory), and Drawing (composition, perspective).',
              },
              {
                title: 'Difficulty Levels',
                desc: 'Every question is rated Easy, Medium, or Hard. Start with easy questions to build confidence, then progress to exam-level difficulty for realistic preparation.',
              },
              {
                title: 'Topic-wise Filters',
                desc: 'Filter questions by specific topics: coordinate geometry, logarithms, architectural awareness, texture recognition, 3D visualisation, and more.',
              },
              {
                title: 'Detailed Solutions',
                desc: 'Every question comes with a step-by-step solution explaining the approach, formulas used, and common mistakes to avoid. Learn from each question, not just answer it.',
              },
              {
                title: 'Community Contributions',
                desc: 'Students and teachers contribute questions, keeping the bank diverse and up-to-date. All community questions are moderated and verified before publishing.',
              },
            ].map((feature) => (
              <Grid item xs={12} sm={6} key={feature.title}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 3,
                    height: '100%',
                    border: '1px solid #E0E0E0',
                    borderRadius: 2,
                  }}
                >
                  <Typography
                    component="h3"
                    sx={{ fontWeight: 700, fontSize: '1rem', mb: 1 }}
                  >
                    {feature.title}
                  </Typography>
                  <Typography
                    sx={{
                      color: 'text.secondary',
                      fontSize: '0.95rem',
                      lineHeight: 1.6,
                    }}
                  >
                    {feature.desc}
                  </Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      <Divider />

      {/* NATA 2026 Exam Pattern Context */}
      <Container maxWidth="md" sx={{ py: { xs: 5, md: 8 } }}>
        <Typography
          component="h2"
          sx={{
            fontSize: { xs: '1.5rem', md: '2rem' },
            fontWeight: 700,
            mb: 3,
          }}
        >
          NATA 2026 Exam Pattern & Question Types
        </Typography>
        <Typography sx={{ mb: 2, lineHeight: 1.8, color: 'text.secondary' }}>
          NATA 2026 consists of three sections with a total of 200 marks.
          Understanding the question types in each section is essential for
          effective preparation. The Mathematics section (Part A) has 20
          multiple-choice questions worth 40 marks, covering topics from 10+2
          level PCM: algebra, matrices, trigonometry, calculus, coordinate
          geometry, and 3D geometry. Questions are straightforward but require
          quick calculation.
        </Typography>
        <Typography sx={{ mb: 2, lineHeight: 1.8, color: 'text.secondary' }}>
          The General Aptitude section (Part B) has 40 questions worth 80 marks.
          This is the most diverse section, covering visual perception, spatial
          ability, colour theory, architectural awareness, general knowledge
          related to architecture, logical reasoning, and numerical ability.
          Questions include image-based problems, pattern recognition, mental
          rotation, and visual analogy. This section rewards students who have
          strong observation skills and spatial thinking.
        </Typography>
        <Typography sx={{ mb: 2, lineHeight: 1.8, color: 'text.secondary' }}>
          The Drawing section (Part C) has 2 questions worth 80 marks total.
          This is the highest-weighted section and is done on a digital drawing
          tablet at the exam center. Questions test 2D composition, 3D object
          visualisation, perspective drawing, and creative design thinking.
          Regular sketching practice is essential for this section. Our question
          bank includes drawing prompts similar to actual NATA papers so you can
          practise composition and perspective at home.
        </Typography>
        <Typography sx={{ mb: 3, lineHeight: 1.8, color: 'text.secondary' }}>
          The exam duration is 3 hours (180 minutes). There is no negative
          marking in NATA, so attempting all questions is recommended. Our
          question bank mirrors the actual exam structure, so every practice
          session builds familiarity with the real test format.
        </Typography>
        <Button
          component={Link}
          href={`${appUrl}/tools/nata/question-bank`}
          variant="contained"
          size="large"
          sx={{
            bgcolor: '#7B1FA2',
            fontWeight: 700,
            px: 4,
            py: 1.5,
            fontSize: '1.1rem',
          }}
        >
          Use This Tool Free &rarr;
        </Button>
      </Container>

      <Divider />

      {/* FAQ Section */}
      <Box sx={{ bgcolor: '#FAFAFA', py: { xs: 5, md: 8 } }}>
        <Container maxWidth="md">
          <Typography
            component="h2"
            sx={{
              fontSize: { xs: '1.5rem', md: '2rem' },
              fontWeight: 700,
              mb: 4,
              textAlign: 'center',
            }}
          >
            Frequently Asked Questions
          </Typography>
          {faqs.map((faq, i) => (
            <Paper
              key={i}
              elevation={0}
              sx={{
                p: 3,
                mb: 2,
                border: '1px solid #E0E0E0',
                borderRadius: 2,
              }}
            >
              <Typography
                component="h3"
                sx={{ fontWeight: 700, fontSize: '1.05rem', mb: 1 }}
              >
                {faq.question}
              </Typography>
              <Typography sx={{ color: 'text.secondary', lineHeight: 1.7 }}>
                {faq.answer}
              </Typography>
            </Paper>
          ))}
        </Container>
      </Box>
    </>
  );
}

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
  Stack,
  Divider,
} from '@neram/ui';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  generateOrganizationSchema,
  generateCourseSchema,
  generateBreadcrumbSchema,
  generateFAQSchema,
  generateOnlineCourseSchema,
  generateFounderPersonSchema,
} from '@/lib/seo/schemas';
import { buildAlternates, buildOgImage } from '@/lib/seo/metadata';
import { BASE_URL } from '@/lib/seo/constants';
import { NataAssistanceForm } from '@/components/nata/NataAssistanceForm';

export const revalidate = 3600;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const title = 'NATA Entrance Exam Coaching 2026 | Live Classes, Mock Tests, Drawing | Neram Classes';
  const description =
    'NATA entrance exam coaching by NIT/IIT alumni faculty. Live classes, daily drawing practice, 100+ mock tests, 99.9% success rate since 2009. Free demo class.';

  return {
    title,
    description,
    keywords:
      'NATA entrance exam, NATA entrance exam coaching, NATA entrance exam 2026, NATA entrance exam preparation, NATA entrance exam syllabus, NATA entrance exam pattern, NATA entrance exam date, NATA entrance exam mock test, NATA entrance exam drawing, NATA entrance coaching online',
    alternates: buildAlternates(locale, '/nata-entrance-exam-coaching'),
    openGraph: {
      title: 'NATA Entrance Exam Coaching 2026 | Neram Classes',
      description,
      type: 'website',
      url: `${BASE_URL}/nata-entrance-exam-coaching`,
      images: [
        {
          url: buildOgImage('NATA Entrance Exam Coaching 2026', 'Live Classes | NIT/IIT Faculty | Since 2009', 'nata'),
          width: 1200,
          height: 630,
          alt: 'NATA Entrance Exam Coaching 2026, Neram Classes',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'NATA Entrance Exam Coaching 2026 | Neram Classes',
      description,
    },
  };
}

interface PageProps {
  params: { locale: string };
}

const courses = [
  { name: 'NATA Entrance Exam Crash Course', duration: '3 Months', priceDisplay: '15,000' },
  { name: 'NATA Entrance Exam 1-Year Program', duration: '12 Months', priceDisplay: '25,000' },
  { name: 'NATA Entrance Exam 2-Year Program', duration: '24 Months', priceDisplay: '30,000' },
];

const features = [
  {
    title: 'NIT/IIT Alumni Faculty',
    desc: 'Every NATA entrance exam class is taught by NIT, IIT, and SPA alumni with 10+ years of architecture entrance experience.',
  },
  {
    title: 'Daily Drawing Practice',
    desc: '2+ hours of supervised drawing every day, the section that decides most NATA entrance exam scores.',
  },
  {
    title: 'Small Batches (Max 25)',
    desc: 'Every batch is capped at 25 students so each NATA entrance exam aspirant gets one-on-one mentoring.',
  },
  {
    title: '100+ Mock Tests',
    desc: 'Full-length NATA entrance exam mock tests with section-wise scoring, time analysis, and improvement plan.',
  },
  {
    title: '99.9% Success Rate',
    desc: 'Since 2009, 99.9% of Neram students clear the NATA entrance exam cutoff. 10,000+ architects trained.',
  },
  {
    title: 'Free AI Study App',
    desc: 'Cutoff calculator, college predictor for 5,000+ B.Arch colleges, exam-centre locator, and 2005-2025 question bank.',
  },
];

const examPattern = [
  { label: 'Questions', value: '125' },
  { label: 'Total Marks', value: '200' },
  { label: 'Duration', value: '3 hours' },
  { label: 'Mode', value: 'Online (CBT)' },
  { label: 'Sections', value: 'Diagrammatic Reasoning, Numerical & Verbal, Inductive & Situational + Drawing' },
  { label: 'Conducting Body', value: 'Council of Architecture (CoA)' },
  { label: 'Attempts', value: '3 per year (April / May / July)' },
  { label: 'Best Score', value: 'Highest of three attempts counted for admission' },
];

const syllabus = [
  {
    section: 'Drawing',
    weight: '125 marks',
    topics: [
      '2D composition with given elements',
      '3D object visualisation, top / side / sectional views',
      'Memory drawing of objects and human figures',
      'Sense of perspective, light, shadow, and texture',
      'Geometrical / scaled composition with given dimensions',
    ],
  },
  {
    section: 'Mathematics',
    weight: 'Within General Aptitude (75 marks)',
    topics: [
      'Algebra, sets, relations, functions',
      'Trigonometry, coordinate geometry, 3D geometry',
      'Differential and integral calculus',
      'Permutation, combination, probability, statistics',
      'Logarithms and matrices',
    ],
  },
  {
    section: 'General Aptitude',
    weight: 'Within General Aptitude (75 marks)',
    topics: [
      'Objects, texture, building forms and elements',
      'Visualising patterns and 3D forms',
      'Mathematical reasoning, sets and relations',
      'Reading comprehension, vocabulary, syllogisms',
      'Numerical reasoning, sequences, basic numeracy',
    ],
  },
];

export default function NataEntranceExamCoachingPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);

  const pageUrl = `${BASE_URL}/nata-entrance-exam-coaching`;

  const faqs = [
    {
      question: 'What is the NATA entrance exam?',
      answer:
        'The NATA entrance exam (National Aptitude Test in Architecture) is the national-level test that decides admission into 5-year B.Arch programs across India. It is conducted by the Council of Architecture (CoA) up to three times a year. The NATA entrance exam tests drawing, general aptitude, and mathematics in a 3-hour online paper of 200 marks.',
    },
    {
      question: 'How to prepare for the NATA entrance exam at home?',
      answer:
        'Start with the official NATA entrance exam syllabus released by CoA. Spend daily time on drawing practice (the highest-weighted section), solve past-year NATA entrance exam papers under timed conditions, and review mathematics and aptitude topic-wise. Neram Classes provides a structured online program with daily live classes, drawing critique, and 100+ mock tests, the same content offline students get, accessible from any city.',
    },
    {
      question: 'When is the NATA entrance exam 2026?',
      answer:
        'The NATA entrance exam 2026 is conducted in three sessions, typically April, May, and July (exact dates released by the Council of Architecture each year). Candidates can attempt all three sessions, and the highest score is used for B.Arch admissions. Check coa.gov.in for the latest schedule.',
    },
    {
      question: 'What is the fee for NATA entrance exam coaching at Neram Classes?',
      answer:
        'NATA entrance exam coaching at Neram Classes starts at Rs. 15,000 for the 3-month crash course, Rs. 25,000 for the 1-year program, and Rs. 30,000 for the 2-year program. EMI options and need-based scholarships are available. All fees include study material, mock tests, recorded lectures, and the free Neram AI study app.',
    },
    {
      question: 'Is the NATA entrance exam tougher than JEE Paper 2?',
      answer:
        'The NATA entrance exam and JEE Paper 2 test similar concepts (drawing, mathematics, aptitude) but in different formats. NATA emphasises drawing under time pressure (125 marks out of 200), while JEE Paper 2 has more mathematics and analytical questions. Most students at Neram Classes prepare for both together because the syllabus overlap is over 70%.',
    },
    {
      question: 'What is the qualifying score for the NATA entrance exam?',
      answer:
        'The qualifying score for the NATA entrance exam is 70 out of 200 (35%) for general category candidates. SC, ST, and OBC candidates need 60 out of 200 (30%). However, top B.Arch colleges like SPA Delhi, NIT Trichy, CEPT, and Anna University SAP have cutoffs of 130 to 160+. Neram Classes targets a 150+ NATA entrance exam score in every program.',
    },
    {
      question: 'Can I clear the NATA entrance exam in 3 months?',
      answer:
        'Yes, the NATA entrance exam can be cleared in 3 months with the right preparation. Neram Classes runs a focused 3-month NATA Crash Course covering all drawing, mathematics, and aptitude sections, with 50+ full-length mock tests. Students starting from scratch with consistent 4-hour daily study have cleared the NATA entrance exam at 130+ scores using this program.',
    },
    {
      question: 'Are recordings available if I miss a NATA entrance exam coaching class?',
      answer:
        'Yes, every NATA entrance exam coaching class at Neram is recorded and uploaded to your dashboard within 4 hours. You can re-watch unlimited times for the entire duration of your course, at no extra cost. This is included in every program.',
    },
    {
      question: 'Does Neram Classes provide NATA entrance exam coaching in Tamil and Hindi?',
      answer:
        'Yes, Neram Classes is the only NATA entrance exam coaching institute that delivers classes in 5 languages: English, Tamil, Hindi, Kannada, and Malayalam. You can choose your preferred language batch during enrolment. Drawing content is language-neutral, conceptual explanations are delivered in your chosen language.',
    },
    {
      question: 'How many mock tests does NATA entrance exam coaching at Neram include?',
      answer:
        'The 3-month Crash Course includes 50+ full-length NATA entrance exam mock tests. The 1-year program includes 100+ mock tests. The 2-year program includes 200+ mock tests across NATA entrance exam and JEE Paper 2. Each mock test comes with a detailed performance report and a one-on-one faculty review.',
    },
    {
      question: 'What documents do I need to apply for the NATA entrance exam?',
      answer:
        'To apply for the NATA entrance exam, you need: a recent passport photograph, signature scan, 10th and 12th marksheets (or admit cards if results pending), a government photo ID (Aadhaar / PAN / passport), and the application fee. Neram Classes mentors guide every enrolled student through the official NATA entrance exam application process step by step.',
    },
    {
      question: 'Can I get a free NATA entrance exam demo class?',
      answer:
        'Yes, every prospective student gets a free NATA entrance exam demo class at Neram Classes. You can experience our teaching methodology, attend a live drawing or mathematics session with faculty, and ask any questions before enrolling. Book on the demo page or fill the lead form on this page and our team will call you back.',
    },
    {
      question: 'Which B.Arch colleges accept NATA entrance exam scores?',
      answer:
        'NATA entrance exam scores are accepted by 500+ B.Arch colleges in India, including all state universities (Anna University, JNAFAU, RV Bangalore, BMS, MEASI, BSA Crescent), CEPT Ahmedabad, and private deemed universities. NITs and IITs use JEE Paper 2 instead. Use our free college predictor at /tools/college-predictor to see which colleges accept your NATA entrance exam score.',
    },
    {
      question: 'What is the difference between NATA entrance exam and AAT?',
      answer:
        'The NATA entrance exam is for B.Arch admissions in state universities and most private colleges. AAT (Architecture Aptitude Test) is a separate test conducted by IITs only, taken after clearing JEE Advanced, for B.Arch admissions to IIT Roorkee and IIT Kharagpur. Most students appear for both NATA entrance exam and JEE Paper 2 to keep all admission options open.',
    },
    {
      question: 'How do I enrol in NATA entrance exam coaching at Neram?',
      answer:
        'Enrolment is fully online: (1) request a free demo by filling the form on this page, (2) attend the demo class and pick a program (Crash / 1-Year / 2-Year), (3) complete the online application, (4) pay via UPI, card, net banking, or EMI. You get dashboard access and your first NATA entrance exam coaching class within 48 hours.',
    },
  ];

  return (
    <>
      <JsonLd data={generateOrganizationSchema()} />
      <JsonLd
        data={generateCourseSchema({
          name: 'NATA Entrance Exam Coaching 2026, Live Classes by NIT/IIT Faculty',
          description:
            'Best NATA entrance exam coaching in India by NIT/IIT alumni faculty. Live interactive classes, daily drawing practice, 100+ mock tests, 99.9% success rate since 2009.',
          url: pageUrl,
          modes: ['online', 'onsite'],
          price: 15000,
        })}
      />
      <JsonLd data={generateOnlineCourseSchema()} />
      <JsonLd data={generateFAQSchema(faqs)} />
      <JsonLd
        data={generateBreadcrumbSchema([
          { name: 'Home', url: BASE_URL },
          { name: 'NATA Entrance Exam Coaching' },
        ])}
      />
      <JsonLd data={generateFounderPersonSchema()} />

      <Box>
        {/* Hero */}
        <Box
          sx={{
            py: { xs: 8, md: 12 },
            background: 'linear-gradient(135deg, #1a237e 0%, #0d47a1 100%)',
            color: 'white',
          }}
        >
          <Container maxWidth="lg">
            <Grid container spacing={4} alignItems="center">
              <Grid item xs={12} md={7}>
                <Chip
                  label="NATA 2026: Now Enrolling"
                  sx={{ bgcolor: 'white', color: 'primary.main', mb: 2, fontWeight: 600 }}
                />
                <Typography
                  variant="h1"
                  component="h1"
                  gutterBottom
                  sx={{ fontWeight: 700, fontSize: { xs: '2.2rem', md: '3.2rem' }, lineHeight: 1.2 }}
                >
                  NATA Entrance Exam Coaching 2026
                </Typography>
                <Typography variant="h5" sx={{ mb: 4, opacity: 0.92, lineHeight: 1.6 }}>
                  Crack the NATA entrance exam with India&rsquo;s most trusted architecture coaching, live
                  classes by NIT, IIT, and SPA alumni, daily drawing critique, 100+ mock tests, and a 99.9%
                  success rate since 2009.
                </Typography>
                <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                  <Button
                    variant="contained"
                    size="large"
                    component={Link}
                    href="/demo-class"
                    sx={{ bgcolor: 'white', color: 'primary.main', fontWeight: 600, px: 4, minHeight: 48 }}
                  >
                    Book Free NATA Entrance Exam Demo
                  </Button>
                  <Button
                    variant="outlined"
                    size="large"
                    component={Link}
                    href="/apply"
                    sx={{ borderColor: 'white', color: 'white', fontWeight: 600, px: 4, minHeight: 48 }}
                  >
                    Enroll Now
                  </Button>
                </Stack>
              </Grid>
              <Grid item xs={12} md={5}>
                <Card sx={{ bgcolor: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)' }}>
                  <CardContent sx={{ p: 4 }}>
                    <Typography variant="h6" gutterBottom sx={{ color: 'white', fontWeight: 600 }}>
                      Course Highlights
                    </Typography>
                    {[
                      { label: 'Mode', value: 'Online + Offline' },
                      { label: 'Batch Size', value: 'Max 25 Students' },
                      { label: 'Duration', value: '3 to 24 Months' },
                      { label: 'Drawing Practice', value: '2+ Hours Daily' },
                      { label: 'Mock Tests', value: '100+ Full-Length' },
                      { label: 'Success Rate', value: '99.9%' },
                    ].map((detail) => (
                      <Box
                        key={detail.label}
                        sx={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          py: 1,
                          borderBottom: '1px solid rgba(255,255,255,0.2)',
                        }}
                      >
                        <Typography variant="body2" sx={{ opacity: 0.85 }}>
                          {detail.label}
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {detail.value}
                        </Typography>
                      </Box>
                    ))}
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Container>
        </Box>

        {/* Trust strip */}
        <Box sx={{ bgcolor: 'primary.dark', color: 'white', py: { xs: 2, md: 2.5 } }}>
          <Container maxWidth="lg">
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={{ xs: 1, md: 3 }}
              divider={
                <Divider
                  orientation="vertical"
                  flexItem
                  sx={{ borderColor: 'rgba(255,255,255,0.25)', display: { xs: 'none', md: 'block' } }}
                />
              }
              justifyContent="center"
              alignItems="center"
              sx={{ textAlign: 'center' }}
            >
              {[
                'Since 2009 (17+ years)',
                '10,000+ architects trained',
                '99.9% success rate',
                'NIT / IIT / SPA alumni faculty',
                '5 languages',
              ].map((point) => (
                <Typography
                  key={point}
                  variant="body2"
                  sx={{ fontWeight: 600, opacity: 0.95, fontSize: { xs: '0.85rem', md: '0.95rem' } }}
                >
                  {point}
                </Typography>
              ))}
            </Stack>
          </Container>
        </Box>

        {/* AEO answer block */}
        <Box sx={{ py: { xs: 5, md: 7 }, bgcolor: 'background.default' }}>
          <Container maxWidth="md">
            <Typography
              variant="h2"
              component="h2"
              gutterBottom
              sx={{ fontWeight: 700, fontSize: { xs: '1.6rem', md: '2.1rem' } }}
            >
              What is the NATA entrance exam?
            </Typography>
            <Typography variant="body1" sx={{ lineHeight: 1.8, color: 'text.secondary', fontSize: '1.05rem', mb: 2 }}>
              The NATA entrance exam (National Aptitude Test in Architecture) is the national-level admission test
              for 5-year B.Arch programs in India. Conducted by the Council of Architecture up to three times a
              year, the NATA entrance exam tests drawing (125 marks), mathematics, and general aptitude (75 marks
              combined) in a 3-hour online paper. Architecture aspirants need 70+ marks out of 200 to qualify, and
              130+ marks to compete for top B.Arch colleges like SPA Delhi, CEPT Ahmedabad, NIT Trichy, and Anna
              University SAP. Neram Classes has trained 10,000+ students for the NATA entrance exam since 2009,
              with a 99.9% qualifying rate.
            </Typography>
          </Container>
        </Box>

        {/* Inline lead capture, primary conversion lever */}
        <Box sx={{ py: { xs: 6, md: 9 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="md">
            <Typography
              variant="h2"
              component="h2"
              align="center"
              gutterBottom
              sx={{ fontWeight: 700, mb: 2 }}
            >
              Get a free NATA entrance exam study plan
            </Typography>
            <Typography variant="h6" align="center" color="text.secondary" sx={{ mb: 4, maxWidth: 640, mx: 'auto' }}>
              Share your details. Our NATA entrance exam mentor will call you back with a personalised study
              plan, fee structure, and demo class slot, free of cost.
            </Typography>
            <NataAssistanceForm locale={locale} />
          </Container>
        </Box>

        {/* NATA Entrance Exam 2026 Pattern */}
        <Box sx={{ py: { xs: 6, md: 9 }, bgcolor: 'background.default' }}>
          <Container maxWidth="lg">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 2 }}>
              NATA entrance exam 2026 pattern
            </Typography>
            <Typography variant="h6" align="center" color="text.secondary" sx={{ mb: 5, maxWidth: 700, mx: 'auto' }}>
              The Council of Architecture sets the official NATA entrance exam pattern. Here is what every
              aspirant should know.
            </Typography>
            <Grid container spacing={2}>
              {examPattern.map((row) => (
                <Grid item xs={12} sm={6} md={6} key={row.label}>
                  <Card sx={{ p: 2.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body1" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                      {row.label}
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 700, color: 'primary.main', textAlign: 'right' }}>
                      {row.value}
                    </Typography>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* Programs and fees */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="lg">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 2 }}>
              NATA entrance exam coaching programs and fees
            </Typography>
            <Typography variant="h6" align="center" color="text.secondary" sx={{ mb: 6 }}>
              Pick the NATA entrance exam program that fits your timeline. EMI options are available on all plans.
            </Typography>
            <Grid container spacing={4} justifyContent="center">
              {courses.map((course, index) => (
                <Grid item xs={12} md={4} key={course.name}>
                  <Card
                    sx={{
                      height: '100%',
                      border: index === 1 ? '2px solid' : '1px solid',
                      borderColor: index === 1 ? 'primary.main' : 'grey.300',
                      position: 'relative',
                    }}
                  >
                    {index === 1 && (
                      <Chip
                        label="Most Popular"
                        size="small"
                        sx={{
                          position: 'absolute',
                          top: 16,
                          right: 16,
                          bgcolor: 'primary.main',
                          color: 'white',
                          fontWeight: 600,
                        }}
                      />
                    )}
                    <CardContent sx={{ p: 4 }}>
                      <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>
                        {course.name}
                      </Typography>
                      <Typography
                        variant="h3"
                        component="div"
                        sx={{ fontWeight: 700, color: 'primary.main', mb: 1 }}
                      >
                        Rs. {course.priceDisplay}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        Duration: {course.duration} (EMI available)
                      </Typography>
                      <Button
                        variant={index === 1 ? 'contained' : 'outlined'}
                        fullWidth
                        size="large"
                        component={Link}
                        href="/apply"
                        sx={{ fontWeight: 600, minHeight: 48 }}
                      >
                        Enroll Now
                      </Button>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* Why Neram for NATA entrance exam preparation */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
          <Container maxWidth="lg">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 2 }}>
              Why students choose Neram for NATA entrance exam preparation
            </Typography>
            <Typography variant="h6" align="center" color="text.secondary" sx={{ mb: 6, maxWidth: 700, mx: 'auto' }}>
              Six reasons aspirants pick Neram Classes for serious NATA entrance exam coaching
            </Typography>
            <Grid container spacing={4}>
              {features.map((feature) => (
                <Grid item xs={12} sm={6} md={4} key={feature.title}>
                  <Card sx={{ height: '100%', p: 3 }}>
                    <Typography variant="h6" gutterBottom sx={{ fontWeight: 700, color: 'primary.main' }}>
                      {feature.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
                      {feature.desc}
                    </Typography>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* Syllabus */}
        <Box sx={{ py: { xs: 6, md: 9 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="lg">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 2 }}>
              NATA entrance exam syllabus: drawing, math, aptitude
            </Typography>
            <Typography variant="h6" align="center" color="text.secondary" sx={{ mb: 5, maxWidth: 720, mx: 'auto' }}>
              Quick view of the NATA entrance exam syllabus by section. Full breakdown on the syllabus page.
            </Typography>
            <Grid container spacing={3}>
              {syllabus.map((section) => (
                <Grid item xs={12} md={4} key={section.section}>
                  <Card sx={{ height: '100%', p: 3 }}>
                    <Typography variant="h6" gutterBottom sx={{ fontWeight: 700 }}>
                      {section.section}
                    </Typography>
                    <Chip
                      label={section.weight}
                      size="small"
                      sx={{ mb: 2, bgcolor: 'primary.50', color: 'primary.dark', fontWeight: 600 }}
                    />
                    <List dense>
                      {section.topics.map((topic) => (
                        <ListItem key={topic} sx={{ px: 0, py: 0.5 }}>
                          <ListItemIcon sx={{ minWidth: 24 }}>
                            <Typography color="primary.main" sx={{ fontWeight: 700 }}>
                              ·
                            </Typography>
                          </ListItemIcon>
                          <ListItemText primary={topic} primaryTypographyProps={{ variant: 'body2' }} />
                        </ListItem>
                      ))}
                    </List>
                  </Card>
                </Grid>
              ))}
            </Grid>
            <Box sx={{ textAlign: 'center', mt: 4 }}>
              <Button
                variant="outlined"
                component={Link}
                href="/nata-syllabus"
                sx={{ fontWeight: 600 }}
              >
                Full NATA Syllabus Breakdown
              </Button>
            </Box>
          </Container>
        </Box>

        {/* FAQ */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 2 }}>
              NATA entrance exam FAQ
            </Typography>
            <Typography variant="h6" align="center" color="text.secondary" sx={{ mb: 6 }}>
              Common questions about the NATA entrance exam and Neram&rsquo;s coaching program
            </Typography>
            {faqs.map((faq) => (
              <Accordion
                key={faq.question}
                disableGutters
                sx={{
                  '&:before': { display: 'none' },
                  mb: 1,
                  borderRadius: 1,
                  overflow: 'hidden',
                }}
              >
                <AccordionSummary
                  expandIcon={<Typography sx={{ fontSize: '1.2rem', fontWeight: 600 }}>+</Typography>}
                  sx={{ bgcolor: 'white', minHeight: 48, '&:hover': { bgcolor: 'grey.100' } }}
                >
                  <Typography sx={{ fontWeight: 600 }}>{faq.question}</Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ bgcolor: 'white' }}>
                  <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.8 }}>
                    {faq.answer}
                  </Typography>
                </AccordionDetails>
              </Accordion>
            ))}
          </Container>
        </Box>

        {/* Related */}
        <Box sx={{ py: { xs: 6, md: 8 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="lg">
            <Typography variant="h3" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 4 }}>
              More NATA entrance exam resources
            </Typography>
            <Grid container spacing={3}>
              {[
                {
                  title: 'NATA Syllabus 2026',
                  href: '/nata-syllabus',
                  desc: 'Section-wise NATA entrance exam syllabus with weightage for drawing, mathematics, and aptitude.',
                },
                {
                  title: 'NATA Online Coaching',
                  href: '/nata-online-coaching',
                  desc: 'Live online NATA entrance exam classes across India and 6 Gulf countries.',
                },
                {
                  title: 'NATA 2026 Complete Guide',
                  href: '/nata-2026',
                  desc: 'Eligibility, exam pattern, important dates, exam centres, and application process for NATA 2026.',
                },
                {
                  title: 'How to Score 150+ in NATA',
                  href: '/how-to-score-150-in-nata',
                  desc: '90-day NATA entrance exam study plan used by Neram toppers to score above 150 out of 200.',
                },
                {
                  title: 'Best Books for NATA',
                  href: '/best-books-nata-jee',
                  desc: 'Topper-recommended NATA entrance exam books ranked by section and difficulty.',
                },
                {
                  title: 'Free Cutoff Calculator',
                  href: '/tools/cutoff-calculator',
                  desc: 'Predict admission chances at top B.Arch colleges from your NATA entrance exam score.',
                },
                {
                  title: 'Free College Predictor',
                  href: '/tools/college-predictor',
                  desc: 'Find B.Arch colleges that match your NATA entrance exam score from 5,000+ options.',
                },
                {
                  title: 'NATA Important Questions',
                  href: '/nata-important-questions',
                  desc: 'High-frequency NATA entrance exam questions with detailed solutions.',
                },
                {
                  title: 'Book Free Demo Class',
                  href: '/demo-class',
                  desc: 'Live NATA entrance exam demo class with Neram faculty before you enrol.',
                },
              ].map((link) => (
                <Grid item xs={12} sm={6} md={4} key={link.href}>
                  <Card
                    component={Link}
                    href={link.href}
                    sx={{
                      textDecoration: 'none',
                      height: '100%',
                      transition: 'all 0.2s',
                      '&:hover': { transform: 'translateY(-4px)', boxShadow: 4 },
                    }}
                  >
                    <CardContent>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'primary.main', mb: 0.5 }}>
                        {link.title}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {link.desc}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* Bottom CTA */}
        <Box
          sx={{
            py: { xs: 8, md: 12 },
            pb: { xs: 14, md: 12 },
            background: 'linear-gradient(135deg, #0d47a1 0%, #1565c0 100%)',
            color: 'white',
            textAlign: 'center',
          }}
        >
          <Container maxWidth="md">
            <Typography
              variant="h3"
              component="h2"
              gutterBottom
              sx={{ fontWeight: 700, fontSize: { xs: '1.8rem', md: '2.5rem' } }}
            >
              Start NATA entrance exam coaching today
            </Typography>
            <Typography variant="h6" sx={{ mb: 4, opacity: 0.9, lineHeight: 1.6 }}>
              Seats are limited to 25 students per batch. Reserve your spot before the next batch starts.
            </Typography>
            <Stack direction="row" spacing={2} justifyContent="center" flexWrap="wrap" useFlexGap>
              <Button
                variant="contained"
                size="large"
                component={Link}
                href="/apply"
                sx={{ bgcolor: 'white', color: 'primary.main', fontWeight: 600, px: 4, minHeight: 48 }}
              >
                Enroll Now
              </Button>
              <Button
                variant="outlined"
                size="large"
                component={Link}
                href="/demo-class"
                sx={{ borderColor: 'white', color: 'white', fontWeight: 600, px: 4, minHeight: 48 }}
              >
                Book Free NATA Entrance Exam Demo
              </Button>
            </Stack>
          </Container>
        </Box>

        {/* Sticky mobile CTA */}
        <Box
          sx={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            display: { xs: 'flex', md: 'none' },
            gap: 1,
            p: 1.5,
            bgcolor: 'background.paper',
            borderTop: '1px solid',
            borderColor: 'grey.200',
            zIndex: 1100,
            boxShadow: '0 -2px 8px rgba(0,0,0,0.08)',
          }}
        >
          <Button
            variant="outlined"
            fullWidth
            component={Link}
            href="/demo-class"
            sx={{ fontWeight: 600, minHeight: 48, flex: 1 }}
          >
            Free Demo
          </Button>
          <Button
            variant="contained"
            fullWidth
            component={Link}
            href="/apply"
            sx={{ fontWeight: 600, minHeight: 48, flex: 1 }}
          >
            Enroll Now
          </Button>
        </Box>
      </Box>
    </>
  );
}

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
import {
  generateCourseSchema,
  generateBreadcrumbSchema,
  generateFAQSchema,
  generateSoftwareApplicationSchema,
} from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'Best Online NATA Coaching 2026 - Live Classes by IIT/NIT Faculty | Neram Classes',
    description:
      'Join the best online NATA coaching in India. Live interactive classes by IIT/NIT alumni, daily drawing practice, small batches of 25, 100+ mock tests, and 99.9% success rate. Enroll now.',
    keywords:
      'best online NATA coaching, NATA coaching online, online NATA classes, best online coaching for NATA exam, online NATA preparation, NATA live classes online, NATA drawing classes online',
    alternates: buildAlternates(locale, '/best-nata-coaching-online'),
  };
}

interface PageProps {
  params: { locale: string };
}

const features = [
  {
    title: 'Live Interactive Classes',
    desc: 'Real-time sessions with faculty -- not pre-recorded videos. Ask questions, get instant feedback, and learn at your pace.',
  },
  {
    title: 'Daily Drawing Practice',
    desc: '2+ hours of supervised drawing practice every day with personalized critique from experienced faculty.',
  },
  {
    title: 'Small Batches (Max 25)',
    desc: 'Each batch is limited to 25 students so every student gets individual attention and mentoring.',
  },
  {
    title: 'IIT/NIT Faculty',
    desc: 'Learn from alumni of IIT and NIT with 10+ years of teaching experience in architecture entrance exams.',
  },
  {
    title: '100+ Mock Tests',
    desc: 'Full-length NATA mock tests with detailed performance analysis, section-wise scoring, and improvement tips.',
  },
  {
    title: '24/7 Doubt Support',
    desc: 'Dedicated WhatsApp doubt-clearing groups with faculty available round the clock for quick resolution.',
  },
];

const featureIcons = [
  'LIVE',
  'DRAW',
  '25',
  'IIT',
  '100+',
  '24/7',
];

const courses = [
  {
    name: 'Year-Long NATA Coaching',
    duration: '12 Months',
    price: 35000,
    priceDisplay: '35,000',
    highlights: [
      'Complete NATA syllabus coverage',
      '600+ hours of live classes',
      'Daily 2-hour drawing practice',
      '100+ full-length mock tests',
      'Personal mentor assigned',
      'Recorded lectures for revision',
      '24/7 WhatsApp doubt support',
      'College admission guidance',
    ],
  },
  {
    name: 'NATA Crash Course',
    duration: '3 Months',
    price: 15000,
    priceDisplay: '15,000',
    highlights: [
      'Intensive fast-track syllabus coverage',
      '200+ hours of live classes',
      'Daily drawing practice sessions',
      '50+ full-length mock tests',
      'Focused topic-wise revision',
      'Previous year question analysis',
      'WhatsApp doubt support',
      'Last-minute tips and strategies',
    ],
  },
];

const comparisonPoints = [
  {
    feature: 'Success Rate',
    neram: '99.9% -- same as our offline batches',
    traditional: 'Varies widely by location',
  },
  {
    feature: 'Batch Size',
    neram: 'Max 25 students per batch',
    traditional: '40-60 students per batch',
  },
  {
    feature: 'Class Timing',
    neram: 'Flexible -- morning, evening, and weekend batches',
    traditional: 'Fixed schedule, limited options',
  },
  {
    feature: 'Class Recordings',
    neram: 'All sessions recorded for unlimited revision',
    traditional: 'No recordings available',
  },
  {
    feature: 'Faculty Access',
    neram: '24/7 WhatsApp doubt support with faculty',
    traditional: 'Limited to class hours only',
  },
  {
    feature: 'Drawing Practice',
    neram: 'Daily supervised online drawing sessions with live critique',
    traditional: 'In-class practice only, no take-home review',
  },
];

const topColleges = [
  'SPA Delhi',
  'SPA Bhopal',
  'CEPT Ahmedabad',
  'NIT Trichy',
  'NIT Calicut',
  'JJ College of Architecture, Mumbai',
  'Chandigarh College of Architecture',
  'IIT Roorkee (B.Arch)',
  'IIT Kharagpur (B.Arch)',
  'Anna University, Chennai',
  'JNAFAU Hyderabad',
  'BMS College of Engineering, Bangalore',
];

const appTools = [
  {
    title: 'NATA Mock Tests',
    desc: 'Take unlimited full-length NATA mock tests with timer, auto-evaluation, and score analysis.',
  },
  {
    title: 'Drawing Practice Sheets',
    desc: 'Download and practice from 500+ drawing prompts curated by architecture professors.',
  },
  {
    title: 'Aptitude Trainer',
    desc: 'Sharpen your logical reasoning, spatial ability, and general knowledge with daily quizzes.',
  },
];

export default function BestNataCoachingOnlinePage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);

  const baseUrl = 'https://neramclasses.com';

  const faqs = [
    {
      question: 'Which is the best online coaching for NATA?',
      answer:
        'Neram Classes is widely regarded as the best online coaching for NATA in India. With a 99.9% success rate, IIT/NIT alumni faculty, small batches of 25 students, daily drawing practice, and 100+ mock tests, Neram offers the most comprehensive online NATA preparation program. Students from across India and abroad have secured top ranks through our online program.',
    },
    {
      question: 'Can I prepare for NATA completely online?',
      answer:
        'Yes, you can absolutely prepare for NATA completely online. Neram Classes online NATA coaching program covers the entire syllabus including Mathematics, General Aptitude, and Drawing through live interactive sessions. Our online students achieve the same 99.9% success rate as offline students, with dedicated drawing practice sessions conducted via live video.',
    },
    {
      question: 'What is the fee for online NATA coaching?',
      answer:
        'Online NATA coaching fees at Neram Classes start at Rs. 15,000 for the 3-month crash course and Rs. 35,000 for the comprehensive 12-month program. EMI options and scholarships are available for deserving students. The fee includes all study materials, mock tests, and recorded lecture access.',
    },
    {
      question: 'Do you provide live classes or recorded?',
      answer:
        'Neram Classes provides live interactive classes conducted in real-time by IIT/NIT alumni faculty. These are not pre-recorded videos. Students can ask questions, participate in discussions, and receive instant feedback during the session. Additionally, all live sessions are recorded and made available for unlimited revision.',
    },
    {
      question: 'What is the batch size for online NATA coaching?',
      answer:
        'Each online batch at Neram Classes is limited to a maximum of 25 students. This small batch size ensures that every student gets individual attention, personalized feedback on drawing submissions, and direct access to faculty for doubt clearing.',
    },
    {
      question: 'Is online NATA coaching as effective as offline?',
      answer:
        'At Neram Classes, our online NATA coaching is equally effective as offline coaching. Our online students consistently achieve the same 99.9% success rate. The online format actually offers additional advantages such as flexible timings, recorded lectures for revision, and the ability to learn from top faculty regardless of your location.',
    },
    {
      question: 'Do you offer drawing practice in online mode?',
      answer:
        'Yes, Neram Classes conducts daily 2+ hour supervised drawing practice sessions online via live video. Faculty observe students drawing in real-time, provide instant critiques, demonstrate techniques through screen sharing, and review submitted drawings with detailed annotations. Students also get access to 500+ drawing practice sheets through our free NATA app.',
    },
    {
      question: 'Is there a free demo class available?',
      answer:
        'Yes, Neram Classes offers free demo classes for prospective students. You can experience our teaching methodology, interact with faculty, and understand the course structure before enrolling. Visit our demo class page or call us to schedule your free demo session.',
    },
  ];

  return (
    <>
      <JsonLd
        data={generateCourseSchema({
          name: 'Online NATA Coaching',
          description:
            'Best online NATA coaching by IIT/NIT alumni faculty. Live interactive classes, daily drawing practice, small batches of 25, 100+ mock tests, and 99.9% success rate.',
          url: `${baseUrl}/en/best-nata-coaching-online`,
          modes: ['online'],
          price: 15000,
        })}
      />
      <JsonLd
        data={generateFAQSchema(faqs)}
      />
      <JsonLd
        data={generateBreadcrumbSchema([
          { name: 'Home', url: baseUrl },
          { name: 'Coaching', url: `${baseUrl}/en/coaching` },
          { name: 'Online NATA Coaching' },
        ])}
      />
      <JsonLd data={generateSoftwareApplicationSchema()} />

      <Box>
        {/* Hero Section */}
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
                  label="NATA 2026 -- Online Coaching"
                  sx={{ bgcolor: 'white', color: 'primary.main', mb: 2, fontWeight: 600 }}
                />
                <Typography
                  variant="h1"
                  component="h1"
                  gutterBottom
                  sx={{ fontWeight: 700, fontSize: { xs: '2.2rem', md: '3.2rem' } }}
                >
                  Best Online NATA Coaching 2026
                </Typography>
                <Typography variant="h5" sx={{ mb: 4, opacity: 0.9, lineHeight: 1.6 }}>
                  Live interactive classes by IIT/NIT alumni faculty. 99.9% success rate.
                  Small batches of max 25 students. Daily drawing practice included.
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  <Button
                    variant="contained"
                    size="large"
                    component={Link}
                    href="/apply"
                    sx={{ bgcolor: 'white', color: 'primary.main', fontWeight: 600, px: 4 }}
                  >
                    Enroll Now
                  </Button>
                  <Button
                    variant="outlined"
                    size="large"
                    component={Link}
                    href="/demo-class"
                    sx={{ borderColor: 'white', color: 'white', fontWeight: 600, px: 4 }}
                  >
                    Book Free Demo
                  </Button>
                </Box>
              </Grid>
              <Grid item xs={12} md={5}>
                <Card sx={{ bgcolor: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)' }}>
                  <CardContent sx={{ p: 4 }}>
                    <Typography variant="h6" gutterBottom sx={{ color: 'white', fontWeight: 600 }}>
                      Online Course Highlights
                    </Typography>
                    {[
                      { label: 'Mode', value: '100% Live Online' },
                      { label: 'Batch Size', value: 'Max 25 Students' },
                      { label: 'Duration', value: '3 - 12 Months' },
                      { label: 'Drawing Practice', value: '2+ Hours Daily' },
                      { label: 'Mock Tests', value: '100+ Full-Length' },
                      { label: 'Success Rate', value: '99.9%' },
                    ].map((detail, idx) => (
                      <Box
                        key={idx}
                        sx={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          py: 1,
                          borderBottom: '1px solid rgba(255,255,255,0.2)',
                        }}
                      >
                        <Typography variant="body2" sx={{ opacity: 0.8 }}>
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

        {/* Why Neram for Online NATA Coaching */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
          <Container maxWidth="lg">
            <Typography
              variant="h2"
              component="h2"
              align="center"
              gutterBottom
              sx={{ mb: 2, fontWeight: 700 }}
            >
              Why Neram for Online NATA Coaching?
            </Typography>
            <Typography
              variant="h6"
              align="center"
              color="text.secondary"
              sx={{ mb: 6, maxWidth: 700, mx: 'auto' }}
            >
              Six reasons why thousands of students choose Neram for their online NATA preparation
            </Typography>

            <Grid container spacing={4}>
              {features.map((feature, index) => (
                <Grid item xs={12} sm={6} md={4} key={index}>
                  <Card sx={{ height: '100%', textAlign: 'center', p: 3 }}>
                    <Box
                      sx={{
                        width: 56,
                        height: 56,
                        borderRadius: '50%',
                        bgcolor: 'primary.main',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        mx: 'auto',
                        mb: 2,
                        fontWeight: 700,
                        fontSize: featureIcons[index].length > 3 ? '0.75rem' : '0.9rem',
                      }}
                    >
                      {featureIcons[index]}
                    </Box>
                    <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                      {feature.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {feature.desc}
                    </Typography>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* Course Details Section */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="lg">
            <Typography
              variant="h2"
              component="h2"
              align="center"
              gutterBottom
              sx={{ mb: 2, fontWeight: 700 }}
            >
              Online NATA Coaching Programs
            </Typography>
            <Typography
              variant="h6"
              align="center"
              color="text.secondary"
              sx={{ mb: 6 }}
            >
              Choose the program that fits your timeline and preparation needs
            </Typography>

            <Grid container spacing={4} justifyContent="center">
              {courses.map((course, index) => (
                <Grid item xs={12} md={6} key={index}>
                  <Card
                    sx={{
                      height: '100%',
                      border: index === 0 ? '2px solid' : '1px solid',
                      borderColor: index === 0 ? 'primary.main' : 'grey.300',
                      position: 'relative',
                    }}
                  >
                    {index === 0 && (
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
                      <Box sx={{ display: 'flex', alignItems: 'baseline', mb: 1 }}>
                        <Typography
                          variant="h3"
                          component="span"
                          sx={{ fontWeight: 700, color: 'primary.main' }}
                        >
                          Rs. {course.priceDisplay}
                        </Typography>
                      </Box>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        Duration: {course.duration} | EMI Available
                      </Typography>

                      <List dense>
                        {course.highlights.map((item, idx) => (
                          <ListItem key={idx} sx={{ px: 0 }}>
                            <ListItemIcon sx={{ minWidth: 28 }}>
                              <Typography color="success.main" sx={{ fontWeight: 700 }}>
                                +
                              </Typography>
                            </ListItemIcon>
                            <ListItemText primary={item} />
                          </ListItem>
                        ))}
                      </List>

                      <Button
                        variant={index === 0 ? 'contained' : 'outlined'}
                        fullWidth
                        size="large"
                        component={Link}
                        href="/apply"
                        sx={{ mt: 2, fontWeight: 600 }}
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

        {/* Online vs Traditional Comparison */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
          <Container maxWidth="lg">
            <Typography
              variant="h2"
              component="h2"
              align="center"
              gutterBottom
              sx={{ mb: 2, fontWeight: 700 }}
            >
              What Makes Online Coaching Effective?
            </Typography>
            <Typography
              variant="h6"
              align="center"
              color="text.secondary"
              sx={{ mb: 6, maxWidth: 700, mx: 'auto' }}
            >
              Neram online NATA coaching delivers the same results as traditional classroom coaching -- and then some
            </Typography>

            {/* Desktop Table */}
            <Box sx={{ display: { xs: 'none', md: 'block' } }}>
              <Card>
                <CardContent sx={{ p: 0 }}>
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr',
                      borderBottom: '2px solid',
                      borderColor: 'grey.200',
                    }}
                  >
                    <Box sx={{ p: 2.5, fontWeight: 700, bgcolor: 'grey.100' }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        Feature
                      </Typography>
                    </Box>
                    <Box sx={{ p: 2.5, fontWeight: 700, bgcolor: 'primary.main', color: 'white' }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        Neram Online
                      </Typography>
                    </Box>
                    <Box sx={{ p: 2.5, fontWeight: 700, bgcolor: 'grey.100' }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        Traditional Classroom
                      </Typography>
                    </Box>
                  </Box>
                  {comparisonPoints.map((point, idx) => (
                    <Box
                      key={idx}
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr 1fr',
                        borderBottom: '1px solid',
                        borderColor: 'grey.100',
                      }}
                    >
                      <Box sx={{ p: 2.5 }}>
                        <Typography variant="body1" sx={{ fontWeight: 600 }}>
                          {point.feature}
                        </Typography>
                      </Box>
                      <Box sx={{ p: 2.5, bgcolor: 'primary.50' }}>
                        <Typography variant="body2">{point.neram}</Typography>
                      </Box>
                      <Box sx={{ p: 2.5 }}>
                        <Typography variant="body2" color="text.secondary">
                          {point.traditional}
                        </Typography>
                      </Box>
                    </Box>
                  ))}
                </CardContent>
              </Card>
            </Box>

            {/* Mobile Cards */}
            <Box sx={{ display: { xs: 'block', md: 'none' } }}>
              {comparisonPoints.map((point, idx) => (
                <Card key={idx} sx={{ mb: 2 }}>
                  <CardContent>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                      {point.feature}
                    </Typography>
                    <Box sx={{ mb: 1 }}>
                      <Chip
                        label="Neram Online"
                        size="small"
                        sx={{ bgcolor: 'primary.main', color: 'white', mb: 0.5 }}
                      />
                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                        {point.neram}
                      </Typography>
                    </Box>
                    <Box>
                      <Chip label="Traditional" size="small" sx={{ mb: 0.5 }} />
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        {point.traditional}
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Box>
          </Container>
        </Box>

        {/* Student Results Section */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="lg">
            <Typography
              variant="h2"
              component="h2"
              align="center"
              gutterBottom
              sx={{ mb: 2, fontWeight: 700 }}
            >
              Online Student Results
            </Typography>
            <Typography
              variant="h6"
              align="center"
              color="text.secondary"
              sx={{ mb: 6 }}
            >
              Our online students consistently achieve outstanding NATA results
            </Typography>

            <Grid container spacing={4} sx={{ mb: 6 }}>
              {[
                { stat: '99.9%', label: 'Success Rate', sub: 'Students clearing NATA cutoff' },
                { stat: '70%+', label: 'Score Above 120', sub: 'Out of 200 total marks' },
                { stat: '500+', label: 'Top College Admissions', sub: 'In the last 3 years' },
              ].map((item, idx) => (
                <Grid item xs={12} sm={4} key={idx}>
                  <Card
                    sx={{
                      textAlign: 'center',
                      p: 4,
                      background: 'linear-gradient(135deg, #1a237e 0%, #0d47a1 100%)',
                      color: 'white',
                    }}
                  >
                    <Typography variant="h2" sx={{ fontWeight: 700, mb: 1 }}>
                      {item.stat}
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
                      {item.label}
                    </Typography>
                    <Typography variant="body2" sx={{ opacity: 0.8 }}>
                      {item.sub}
                    </Typography>
                  </Card>
                </Grid>
              ))}
            </Grid>

            <Typography
              variant="h5"
              align="center"
              gutterBottom
              sx={{ fontWeight: 600, mb: 3 }}
            >
              Colleges Where Our Online Students Study
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 1.5 }}>
              {topColleges.map((college, idx) => (
                <Chip
                  key={idx}
                  label={college}
                  variant="outlined"
                  sx={{ fontSize: '0.85rem', py: 2.5, px: 1 }}
                />
              ))}
            </Box>
          </Container>
        </Box>

        {/* Free NATA App Section */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
          <Container maxWidth="lg">
            <Grid container spacing={4} alignItems="center">
              <Grid item xs={12} md={5}>
                <Chip label="Free for All Students" sx={{ bgcolor: 'success.main', color: 'white', mb: 2, fontWeight: 600 }} />
                <Typography
                  variant="h2"
                  component="h2"
                  gutterBottom
                  sx={{ fontWeight: 700 }}
                >
                  Free NATA Preparation App
                </Typography>
                <Typography variant="body1" color="text.secondary" sx={{ mb: 3, lineHeight: 1.8 }}>
                  Supplement your online coaching with our free NATA app at app.neramclasses.com.
                  Access mock tests, drawing practice sheets, aptitude quizzes, and study materials
                  -- all completely free, no enrollment required.
                </Typography>
                <Button
                  variant="contained"
                  size="large"
                  component={Link}
                  href="https://app.neramclasses.com"
                  sx={{ fontWeight: 600 }}
                >
                  Try Free NATA App
                </Button>
              </Grid>
              <Grid item xs={12} md={7}>
                <Grid container spacing={3}>
                  {appTools.map((tool, idx) => (
                    <Grid item xs={12} sm={4} key={idx}>
                      <Card sx={{ height: '100%', p: 2.5, textAlign: 'center' }}>
                        <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                          {tool.title}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {tool.desc}
                        </Typography>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              </Grid>
            </Grid>
          </Container>
        </Box>

        {/* FAQ Section */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="md">
            <Typography
              variant="h2"
              component="h2"
              align="center"
              gutterBottom
              sx={{ mb: 2, fontWeight: 700 }}
            >
              Frequently Asked Questions
            </Typography>
            <Typography
              variant="h6"
              align="center"
              color="text.secondary"
              sx={{ mb: 6 }}
            >
              Common questions about online NATA coaching at Neram Classes
            </Typography>

            {faqs.map((faq, idx) => (
              <Accordion
                key={idx}
                disableGutters
                sx={{
                  '&:before': { display: 'none' },
                  mb: 1,
                  borderRadius: 1,
                  overflow: 'hidden',
                }}
              >
                <AccordionSummary
                  expandIcon={
                    <Typography sx={{ fontSize: '1.2rem', fontWeight: 600 }}>+</Typography>
                  }
                  sx={{
                    bgcolor: 'white',
                    '&:hover': { bgcolor: 'grey.100' },
                  }}
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

        {/* Bottom CTA Section */}
        <Box
          sx={{
            py: { xs: 8, md: 12 },
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
              Start Your Online NATA Journey Today
            </Typography>
            <Typography variant="h6" sx={{ mb: 4, opacity: 0.9, lineHeight: 1.6 }}>
              Join India's highest-rated online NATA coaching. Limited seats in every batch.
              Enroll now to secure your spot.
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                size="large"
                component={Link}
                href="/apply"
                sx={{ bgcolor: 'white', color: 'primary.main', fontWeight: 600, px: 4 }}
              >
                Enroll Now
              </Button>
              <Button
                variant="outlined"
                size="large"
                component={Link}
                href="/demo-class"
                sx={{ borderColor: 'white', color: 'white', fontWeight: 600, px: 4 }}
              >
                Book Free Demo
              </Button>
            </Box>
          </Container>
        </Box>
      </Box>
    </>
  );
}

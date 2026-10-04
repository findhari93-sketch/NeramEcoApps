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
  Divider,
  Stack,
} from '@neram/ui';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  generateOrganizationSchema,
  generateCourseSchema,
  generateBreadcrumbSchema,
  generateFAQSchema,
  generateSoftwareApplicationSchema,
  generateOnlineCourseSchema,
  generateFounderPersonSchema,
} from '@/lib/seo/schemas';
import { buildAlternates, buildOgImage } from '@/lib/seo/metadata';
import { APP_URL, BASE_URL } from '@/lib/seo/constants';
import { COURSE_FEES, PROOF_POINTS } from '@/lib/seo/facts';
import NataOnlineCoachingTamil from '@/components/nata-coaching/localized/NataOnlineCoachingTamil';
import NataOnlineCoachingHindi from '@/components/nata-coaching/localized/NataOnlineCoachingHindi';

export const revalidate = 86400;

// Locale-specific title and description for the canonical NATA Online Coaching landing page.
// Tamil and Hindi serve native script through dedicated localized components further below.
const localizedMeta: Record<string, { title: string; description: string }> = {
  ta: {
    title: 'NATA ஆன்லைன் கோச்சிங் 2026 | நேரடி வகுப்புகள், மாதிரி தேர்வுகள்',
    description:
      '2009 முதல் NATA பயிற்சி. 1,000+ மாணவர்கள், JEE B.Arch 2024 இல் AIR 1. இந்தியா முழுவதும் வளைகுடா நாடுகளிலும் நேரடி ஆன்லைன் வகுப்புகள், தினசரி வரைபடப் பயிற்சி, இலவச டெமோ. கட்டணம் ரூ. 15,000 முதல்.',
  },
  hi: {
    title: 'NATA ऑनलाइन कोचिंग 2026 | लाइव कक्षाएँ, मॉक टेस्ट',
    description:
      '2009 से NATA की तैयारी। 1,000+ छात्र, JEE B.Arch 2024 में AIR 1। पूरे भारत और खाड़ी देशों के लिए लाइव ऑनलाइन कक्षाएँ, रोज़ ड्रॉइंग अभ्यास, मुफ्त डेमो। शुल्क रु. 15,000 से।',
  },
};

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const localized = localizedMeta[locale];
  const title =
    localized?.title ??
    // The [locale] layout template appends " | Neram Classes".
    'NATA Online Coaching 2026 | Live Classes, Mock Tests, Drawing';
  const description =
    localized?.description ??
    `NATA online coaching since 2009: ${PROOF_POINTS.students}, ${PROOF_POINTS.topResult}. Live classes across India and the Gulf, daily drawing practice, 100+ mock tests in the 1-Year program, free demo. Fees from ₹15,000.`;

  return {
    title,
    description,
    keywords:
      'NATA online coaching, NATA online coaching in India, NATA online coaching 2026, NATA online classes, best NATA online coaching, NATA online preparation, online NATA coaching fees, NATA coaching online with mock test, NATA coaching online live classes, online NATA drawing coaching, NATA coaching from home, NATA coaching app, NATA coaching online Chennai, NATA coaching online Tamil Nadu',
    alternates: buildAlternates(locale, '/nata-online-coaching'),
    openGraph: {
      title: 'NATA Online Coaching 2026',
      description,
      type: 'website',
      url: `${BASE_URL}/nata-online-coaching`,
      images: [
        {
          url: buildOgImage('NATA Online Coaching 2026', `Since 2009 | ${PROOF_POINTS.students} | ${PROOF_POINTS.topResult}`, 'coaching'),
          width: 1200,
          height: 630,
          alt: 'NATA Online Coaching 2026, Neram Classes',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'NATA Online Coaching 2026',
      description,
    },
  };
}

interface PageProps {
  params: { locale: string };
}

const features = [
  {
    title: 'Live Interactive Classes',
    desc: 'Real-time sessions with faculty, not pre-recorded videos. Ask questions, get instant feedback, learn at your pace.',
  },
  {
    title: 'Daily Drawing Practice',
    desc: '2+ hours of supervised drawing practice every day with personalised critique from experienced faculty.',
  },
  {
    title: 'Small Batches',
    desc: 'Batches are kept small so every learner gets individual attention and mentoring.',
  },
  {
    title: 'Teaching Since 2009',
    desc: 'Founded in 2009 by Pushparaj Manoharan (B.Arch, NIT Trichy). 10+ years of coaching for architecture entrance exams.',
  },
  {
    title: '100+ Mock Tests',
    desc: 'The 1-Year program includes 100+ full-length NATA mock tests with section-wise scoring and improvement tips.',
  },
  {
    title: 'WhatsApp Doubt Support',
    desc: 'Dedicated WhatsApp doubt-clearing groups where faculty answer your questions between classes.',
  },
];

const featureIcons = ['LIVE', 'DRAW', 'SMALL', '2009', '100+', 'HELP'];

const courses = [
  {
    name: 'NATA Crash Course',
    duration: '3 Months',
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
  {
    name: '1-Year NATA Program',
    duration: '12 Months',
    priceDisplay: '25,000',
    highlights: [
      'Complete NATA syllabus coverage',
      '600+ hours of live classes',
      'Daily 2-hour drawing practice',
      '100+ full-length mock tests',
      'Personal mentor assigned',
      'Recorded lectures for revision',
      'WhatsApp doubt support',
      'College admission guidance',
    ],
  },
  {
    name: '2-Year NATA Program',
    duration: '24 Months',
    priceDisplay: '30,000',
    highlights: [
      'Foundation + Advanced preparation',
      'Complete NATA & JEE Paper 2 coverage',
      'Daily drawing practice',
      '200+ full-length mock tests',
      '1-on-1 personal mentoring',
      'All study materials included',
      'Recorded lectures for revision',
      'College admission guidance',
    ],
  },
];

const comparisonPoints = [
  {
    feature: 'Faculty',
    neram: 'Same faculty as our classroom batches',
    traditional: 'Depends on the local centre',
  },
  {
    feature: 'Batch Size',
    neram: 'Small batches with individual attention',
    traditional: 'Often large batches',
  },
  {
    feature: 'Class Timing',
    neram: 'Flexible: morning, evening, and weekend batches',
    traditional: 'Fixed schedule, limited options',
  },
  {
    feature: 'Class Recordings',
    neram: 'All sessions recorded for unlimited revision',
    traditional: 'No recordings available',
  },
  {
    feature: 'Faculty Access',
    neram: 'WhatsApp doubt support with faculty between classes',
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
    title: 'Cutoff Calculator',
    desc: 'Work out your NATA score and see where it stands against past cutoffs.',
  },
  {
    title: 'B.Arch College Predictor',
    desc: 'See which B.Arch colleges match your expected score and category.',
  },
  {
    title: 'Question Bank Preview',
    desc: 'Try past NATA and JEE B.Arch questions before you join. The exam centre finder is in the app too.',
  },
];

// Live batch schedule. Replace with a Supabase query (e.g. getUpcomingNataBatches) when wired.
const upcomingBatches = [
  {
    name: 'NATA Crash Course (Weekend)',
    startDate: 'Sat, 7 Jun 2026',
    timing: '9:00 AM to 12:00 PM IST',
    seats: 'Seats open',
    seatsCritical: false,
  },
  {
    name: '1-Year NATA Program (Evening)',
    startDate: 'Mon, 16 Jun 2026',
    timing: '6:30 PM to 9:00 PM IST',
    seats: 'Seats open',
    seatsCritical: false,
  },
  {
    name: '2-Year NATA Foundation (Morning)',
    startDate: 'Mon, 23 Jun 2026',
    timing: '7:00 AM to 9:30 AM IST',
    seats: 'Seats open',
    seatsCritical: false,
  },
];

const trustPoints = [
  `Since 2009 (${PROOF_POINTS.years})`,
  PROOF_POINTS.students,
  PROOF_POINTS.topResult,
  'Founded by an NIT Trichy architect',
  'Live online across India and the Gulf',
];

export default function NataOnlineCoachingPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);

  // Native-script landing pages for Tamil and Hindi. Each ships its own schema,
  // FAQ, hero, fees table, and CTAs in the local language so Google indexes
  // them as genuine native pages rather than as duplicate-content English variants.
  if (locale === 'ta') {
    return <NataOnlineCoachingTamil />;
  }
  if (locale === 'hi') {
    return <NataOnlineCoachingHindi />;
  }

  const pageUrl = `${BASE_URL}/nata-online-coaching`;

  const faqs = [
    {
      question: 'How do I choose a NATA online coaching institute?',
      answer:
        `Look for live classes (not only recordings), regular drawing feedback, enough mock tests and a clear track record. Neram Classes has coached architecture aspirants since 2009: ${PROOF_POINTS.students} and ${PROOF_POINTS.topResult}. Classes run live online for students across India and the Gulf, with small batches, daily drawing practice and 100+ mock tests in the 1-Year program. Book a free demo class to judge the teaching for yourself.`,
    },
    {
      question: 'Can I prepare for NATA completely online?',
      answer:
        'Yes, you can prepare for NATA completely online. The Neram Classes NATA online coaching program covers the full syllabus (Mathematics, General Aptitude and Drawing) through live interactive sessions. Online students are taught by the same faculty as our classroom batches, with drawing practice sessions held over live video.',
    },
    {
      question: 'What is the fee for NATA online coaching?',
      answer:
        'NATA online coaching fees at Neram Classes start at Rs. 15,000 for the 3-month crash course, Rs. 25,000 for the 1-year program (single payment), and Rs. 30,000 for the 2-year program (single payment). EMI options and need-based scholarships are available. The fee includes all study materials, mock tests, and recorded lecture access.',
    },
    {
      question: 'Are these live classes or pre-recorded?',
      answer:
        'Neram Classes runs live interactive sessions conducted in real time by NIT/IIT alumni faculty, not pre-recorded videos. Students can ask questions, participate in discussions, and receive instant feedback during the session. All live sessions are also recorded and made available for unlimited revision.',
    },
    {
      question: 'What is the batch size for NATA online coaching?',
      answer:
        'Online batches at Neram Classes are kept small. That keeps room for individual attention, personal feedback on drawing submissions and direct access to faculty for doubt clearing.',
    },
    {
      question: 'Is NATA online coaching as effective as offline classroom coaching?',
      answer:
        'The same faculty teach both online and classroom batches at Neram Classes, with the same syllabus, drawing feedback and mock tests. The online format adds flexible timings, recorded lectures for revision, and access to the same teachers wherever you live.',
    },
    {
      question: 'How is the drawing test taught online?',
      answer:
        'Drawing is taught through live video sessions where faculty demonstrate techniques in real time. Students draw along and show their work via camera for instant feedback. Each submission is reviewed with detailed annotations. Students also get practice sheets and daily supervised drawing sessions. We have taught drawing for NATA since 2009.',
    },
    {
      question: 'Is there a free demo class available?',
      answer:
        'Yes, Neram Classes offers a free demo class for prospective students. You can experience the teaching methodology, interact with faculty, and understand the course structure before enrolling. Book via the demo page or call us to schedule your slot.',
    },
    {
      question: 'Can I join NATA online coaching from any city in India?',
      answer:
        'Yes, Neram Classes NATA online coaching is open to students in any city in India and in the Gulf (UAE, Qatar, Oman, Saudi Arabia, Kuwait, Bahrain). All you need is a stable internet connection and a device to attend live classes.',
    },
    {
      question: 'What digital tools does Neram provide for online students?',
      answer:
        'Neram Classes runs a free study app at app.neramclasses.com. It includes a NATA cutoff calculator, a B.Arch college predictor, an exam centre finder and a question bank preview. Anyone can use it, enrolled or not.',
    },
    {
      question: 'How is the NATA exam pattern in 2026?',
      answer:
        'NATA 2026 has 125 questions for 200 marks, conducted online. It covers three sections: Diagrammatic Reasoning, Numerical & Verbal Reasoning, and Inductive & Situational Reasoning, including drawing-based questions. Total duration is 3 hours. Our online coaching covers every section with section-wise mock tests.',
    },
    {
      question: 'How many mock tests are included in NATA online coaching?',
      answer:
        'The 3-month Crash Course includes 50+ full-length NATA mock tests. The 1-year program adds up to 100+ mock tests. The 2-year program includes 200+ mock tests across NATA and JEE Paper 2. Each mock test comes with a detailed performance report and one-on-one review with faculty.',
    },
    {
      question: 'Do you cover NATA, JEE Paper 2, and other architecture exams together?',
      answer:
        'Yes, the 2-year NATA Program covers NATA and JEE Paper 2 (B.Arch) together so students can target NITs, IITs (B.Arch), SPA, and state colleges in a single preparation cycle. We also cover AAT and PGETA basics for students applying to IIT B.Arch through JEE Advanced.',
    },
    {
      question: 'Can I switch between online and offline classes after enrolling?',
      answer:
        "Yes, Neram Classes runs a hybrid online-offline model. Enrolled students can switch their attendance mode anytime if they travel, relocate, or prefer offline for revision phases. There is no extra fee for switching, and your progress carries over to the new mode.",
    },
    {
      question: 'What if I cannot attend a live class? Are recordings available?',
      answer:
        'Every live session is recorded and uploaded to your student dashboard within 4 hours. You can re-watch unlimited times for the entire duration of your course. This is included free with every NATA online coaching package.',
    },
    {
      question: 'Is NATA online coaching available in Tamil and Hindi?',
      answer:
        'Yes, Neram Classes offers coaching in English, Tamil, Hindi, Kannada and Malayalam. You can choose your preferred language batch during enrolment. Drawing and aptitude content is language-neutral, conceptual explanations are delivered in your chosen language.',
    },
    {
      question: 'Which architecture colleges have Neram online students secured admission to?',
      answer:
        `Our online students have secured admissions to SPA Delhi, SPA Bhopal, CEPT Ahmedabad, NIT Trichy, NIT Calicut, IIT Roorkee (B.Arch), IIT Kharagpur (B.Arch), JJ College of Architecture Mumbai, Anna University Chennai, JNAFAU Hyderabad, BMS Bangalore and other architecture colleges across India. Our best recent result is ${PROOF_POINTS.topResult}.`,
    },
    {
      question: 'When do new NATA online coaching batches start?',
      answer:
        'New NATA online batches start every month at Neram Classes. The next crash course typically starts in the first week of every month, with separate morning, evening, and weekend slots. Check the live batch schedule on this page for the next 3 upcoming start dates and seat availability.',
    },
    {
      question: 'Do you offer NATA scholarships or fee concessions?',
      answer:
        'Yes, Neram Classes offers two scholarship pathways: (1) a merit-based scholarship for students who clear our online aptitude test, and (2) a need-based fee concession for economically disadvantaged students. Both can be claimed during the application stage and reduce fees by 10% to 40%.',
    },
    {
      question: 'How do I enrol in NATA online coaching at Neram Classes?',
      answer:
        'Enrolment is fully online: (1) book a free demo class on our demo page, (2) attend the demo and pick the program that fits your timeline, (3) complete the online application form, (4) pay via UPI, card, net banking, or EMI. You get instant access to the student dashboard and your first live class within 48 hours.',
    },
  ];

  // Verified testimonials from Supabase student_profiles + counsellor-confirmed.
  // To wire to live data, replace this constant with a server-side query.
  // Currently scoped to publicly shareable initials + city + outcome only (no last names).
  const testimonials: Array<{
    studentName: string;
    cityState: string;
    outcome: string;
    year: number;
    quote: string;
  }> = [
    // Marketing team: replace with real, consent-verified student testimonials.
    // Each item should include name (or initials), city, outcome, year, and a short quote.
  ];

  return (
    <>
      <JsonLd data={generateOrganizationSchema()} />
      <JsonLd
        data={{
          ...generateCourseSchema({
            name: 'NATA Online Coaching 2026, Live Classes by NIT/IIT Faculty',
            description:
              `NATA online coaching by Neram Classes, teaching since 2009 (${PROOF_POINTS.students}, ${PROOF_POINTS.topResult}). Live interactive classes, daily drawing practice, small batches and 100+ mock tests in the 1-Year program. Available across India and the Gulf.`,
            url: pageUrl,
            modes: ['online'],
            price: 15000,
          }),
        }}
      />
      <JsonLd data={generateOnlineCourseSchema()} />
      <JsonLd data={generateFAQSchema(faqs)} />
      <JsonLd
        data={generateBreadcrumbSchema([
          { name: 'Home', url: BASE_URL },
          { name: 'Coaching', url: `${BASE_URL}/coaching` },
          { name: 'NATA Online Coaching' },
        ])}
      />
      <JsonLd data={generateSoftwareApplicationSchema()} />
      <JsonLd data={generateFounderPersonSchema()} />

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
                  label="NATA 2026: Live Online Coaching"
                  sx={{ bgcolor: 'white', color: 'primary.main', mb: 2, fontWeight: 600 }}
                />
                <Typography
                  variant="h1"
                  component="h1"
                  gutterBottom
                  sx={{ fontWeight: 700, fontSize: { xs: '2.2rem', md: '3.2rem' } }}
                >
                  NATA Online Coaching 2026
                </Typography>
                <Typography variant="h5" sx={{ mb: 4, opacity: 0.9, lineHeight: 1.6 }}>
                  Live classes for architecture aspirants since 2009. {PROOF_POINTS.students} taught and{' '}
                  {PROOF_POINTS.topResult}. Small batches and daily drawing practice.
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  <Button
                    variant="contained"
                    size="large"
                    component={Link}
                    href="/demo-class"
                    sx={{ bgcolor: 'white', color: 'primary.main', fontWeight: 600, px: 4, minHeight: 48 }}
                  >
                    Book Free Demo
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
                      { label: 'Batch Size', value: 'Small Batches' },
                      { label: 'Duration', value: '3 to 24 Months' },
                      { label: 'Drawing Practice', value: '2+ Hours Daily' },
                      { label: 'Mock Tests', value: '100+ (1-Year Program)' },
                      { label: 'Top Result', value: 'AIR 1, JEE B.Arch 2024' },
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

        {/* Trust Strip */}
        <Box sx={{ bgcolor: 'primary.dark', color: 'white', py: { xs: 2, md: 2.5 } }}>
          <Container maxWidth="lg">
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={{ xs: 1, md: 3 }}
              divider={
                <Divider
                  orientation="vertical"
                  flexItem
                  sx={{
                    borderColor: 'rgba(255,255,255,0.25)',
                    display: { xs: 'none', md: 'block' },
                  }}
                />
              }
              justifyContent="center"
              alignItems="center"
              sx={{ textAlign: 'center' }}
            >
              {trustPoints.map((point) => (
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

        {/* What is NATA online coaching? (Concise AEO answer block) */}
        <Box sx={{ py: { xs: 5, md: 7 }, bgcolor: 'background.default' }}>
          <Container maxWidth="md">
            <Typography
              variant="h2"
              component="h2"
              gutterBottom
              sx={{ fontWeight: 700, fontSize: { xs: '1.6rem', md: '2.1rem' } }}
            >
              What is NATA online coaching?
            </Typography>
            <Typography variant="body1" sx={{ lineHeight: 1.8, color: 'text.secondary', fontSize: '1.05rem' }}>
              NATA online coaching is structured, live-class preparation for the National Aptitude Test in
              Architecture (NATA), delivered over video by experienced architecture faculty. A complete
              program covers Mathematics, General Aptitude, and the Drawing test, includes weekly mock tests,
              and provides one-on-one feedback on drawing submissions. At Neram Classes, NATA online coaching
              runs in small live batches. We have taught since 2009: {PROOF_POINTS.students} and{' '}
              {PROOF_POINTS.topResult}.
            </Typography>
          </Container>
        </Box>

        {/* Live Batch Schedule */}
        <Box sx={{ py: { xs: 6, md: 9 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="lg">
            <Typography
              variant="h2"
              component="h2"
              align="center"
              gutterBottom
              sx={{ mb: 2, fontWeight: 700 }}
            >
              Upcoming NATA Online Coaching Batches
            </Typography>
            <Typography
              variant="h6"
              align="center"
              color="text.secondary"
              sx={{ mb: 6, maxWidth: 700, mx: 'auto' }}
            >
              Live batches start every month. Seats are limited so each student gets individual attention.
            </Typography>

            <Grid container spacing={3}>
              {upcomingBatches.map((batch) => (
                <Grid item xs={12} md={4} key={batch.name}>
                  <Card
                    sx={{
                      height: '100%',
                      borderTop: '4px solid',
                      borderColor: batch.seatsCritical ? 'error.main' : 'primary.main',
                    }}
                  >
                    <CardContent sx={{ p: 3 }}>
                      <Typography variant="h6" gutterBottom sx={{ fontWeight: 700 }}>
                        {batch.name}
                      </Typography>
                      <Stack spacing={1} sx={{ mb: 2 }}>
                        <Typography variant="body2" color="text.secondary">
                          <strong>Start date:</strong> {batch.startDate}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          <strong>Timing:</strong> {batch.timing}
                        </Typography>
                      </Stack>
                      <Chip
                        label={batch.seats}
                        size="small"
                        sx={{
                          bgcolor: batch.seatsCritical ? 'error.main' : 'success.main',
                          color: 'white',
                          fontWeight: 600,
                          mb: 2,
                        }}
                      />
                      <Button
                        variant="contained"
                        fullWidth
                        component={Link}
                        href="/apply"
                        sx={{ fontWeight: 600, minHeight: 48 }}
                      >
                        Reserve My Seat
                      </Button>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
            <Typography
              variant="body2"
              align="center"
              color="text.secondary"
              sx={{ mt: 4 }}
            >
              Looking for a different start date or timing? <Link href="/contact" style={{ color: 'inherit', textDecoration: 'underline' }}>Contact us</Link> for the next batch slot.
            </Typography>
          </Container>
        </Box>

        {/* Why Neram for NATA Online Coaching */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
          <Container maxWidth="lg">
            <Typography
              variant="h2"
              component="h2"
              align="center"
              gutterBottom
              sx={{ mb: 2, fontWeight: 700 }}
            >
              Why choose Neram for NATA online coaching?
            </Typography>
            <Typography
              variant="h6"
              align="center"
              color="text.secondary"
              sx={{ mb: 6, maxWidth: 700, mx: 'auto' }}
            >
              Six reasons students choose Neram for NATA online preparation
            </Typography>

            <Grid container spacing={4}>
              {features.map((feature, index) => (
                <Grid item xs={12} sm={6} md={4} key={feature.title}>
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

        {/* Course Details */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="lg">
            <Typography
              variant="h2"
              component="h2"
              align="center"
              gutterBottom
              sx={{ mb: 2, fontWeight: 700 }}
            >
              NATA Online Coaching Programs and Fees
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
                        Duration: {course.duration}.
                        {COURSE_FEES[index]?.singlePaymentDisplay
                          ? ` Paid at once. Rs. ${COURSE_FEES[index].priceDisplay} in instalments.`
                          : ''}
                      </Typography>

                      <List dense>
                        {course.highlights.map((item) => (
                          <ListItem key={item} sx={{ px: 0 }}>
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
                        variant={index === 1 ? 'contained' : 'outlined'}
                        fullWidth
                        size="large"
                        component={Link}
                        href="/apply"
                        sx={{ mt: 2, fontWeight: 600, minHeight: 48 }}
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
              How NATA online coaching compares to classroom coaching
            </Typography>
            <Typography
              variant="h6"
              align="center"
              color="text.secondary"
              sx={{ mb: 6, maxWidth: 700, mx: 'auto' }}
            >
              Neram NATA online coaching delivers the same results as traditional classroom coaching, with several added advantages
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
                  {comparisonPoints.map((point) => (
                    <Box
                      key={point.feature}
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
              {comparisonPoints.map((point) => (
                <Card key={point.feature} sx={{ mb: 2 }}>
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

        {/* Student Results & Colleges */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="lg">
            <Typography
              variant="h2"
              component="h2"
              align="center"
              gutterBottom
              sx={{ mb: 2, fontWeight: 700 }}
            >
              Online Student Outcomes
            </Typography>
            <Typography
              variant="h6"
              align="center"
              color="text.secondary"
              sx={{ mb: 6 }}
            >
              What Neram has delivered since 2009
            </Typography>

            <Grid container spacing={4} sx={{ mb: 6 }}>
              {[
                { stat: 'AIR 1', label: 'JEE B.Arch 2024', sub: 'Our top result' },
                { stat: '1,000+', label: 'Students Taught', sub: 'Online and in classrooms' },
                { stat: '10+', label: 'Years', sub: 'Coaching since 2009' },
              ].map((item) => (
                <Grid item xs={12} sm={4} key={item.label}>
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
              Colleges where our online students study
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 1.5 }}>
              {topColleges.map((college) => (
                <Chip
                  key={college}
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
                <Chip
                  label="Free for All Students"
                  sx={{ bgcolor: 'success.main', color: 'white', mb: 2, fontWeight: 600 }}
                />
                <Typography
                  variant="h2"
                  component="h2"
                  gutterBottom
                  sx={{ fontWeight: 700 }}
                >
                  Free NATA Preparation App
                </Typography>
                <Typography variant="body1" color="text.secondary" sx={{ mb: 3, lineHeight: 1.8 }}>
                  Supplement your NATA online coaching with our free NATA app at app.neramclasses.com.
                  Access mock tests, drawing practice sheets, aptitude quizzes, and study materials,
                  completely free, no enrolment required.
                </Typography>
                <Button
                  variant="contained"
                  size="large"
                  component={Link}
                  href={APP_URL}
                  sx={{ fontWeight: 600, minHeight: 48 }}
                >
                  Try Free NATA App
                </Button>
              </Grid>
              <Grid item xs={12} md={7}>
                <Grid container spacing={3}>
                  {appTools.map((tool) => (
                    <Grid item xs={12} sm={4} key={tool.title}>
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

        {/* Testimonials (rendered when populated) */}
        {testimonials.length > 0 && (
          <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
            <Container maxWidth="lg">
              <Typography
                variant="h2"
                component="h2"
                align="center"
                gutterBottom
                sx={{ mb: 2, fontWeight: 700 }}
              >
                What our NATA online students say
              </Typography>
              <Typography
                variant="h6"
                align="center"
                color="text.secondary"
                sx={{ mb: 6, maxWidth: 700, mx: 'auto' }}
              >
                Verified outcomes from students across India and the Gulf
              </Typography>
              <Grid container spacing={3}>
                {testimonials.map((t) => (
                  <Grid item xs={12} md={6} key={`${t.studentName}-${t.year}`}>
                    <Card sx={{ p: 3, height: '100%' }}>
                      <Typography variant="body1" sx={{ fontStyle: 'italic', mb: 2, lineHeight: 1.7 }}>
                        &ldquo;{t.quote}&rdquo;
                      </Typography>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        {t.studentName}, {t.cityState}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {t.outcome} (NATA {t.year})
                      </Typography>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </Container>
          </Box>
        )}

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
              NATA Online Coaching FAQ
            </Typography>
            <Typography
              variant="h6"
              align="center"
              color="text.secondary"
              sx={{ mb: 6 }}
            >
              Common questions about NATA online coaching at Neram Classes
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
                  expandIcon={
                    <Typography sx={{ fontSize: '1.2rem', fontWeight: 600 }}>+</Typography>
                  }
                  sx={{
                    bgcolor: 'white',
                    minHeight: 48,
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

        {/* NATA Online Coaching by Tamil Nadu City */}
        <Box sx={{ py: { xs: 6, md: 9 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="lg">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 2 }}>
              NATA online coaching by Tamil Nadu city
            </Typography>
            <Typography variant="h6" align="center" color="text.secondary" sx={{ mb: 5, maxWidth: 720, mx: 'auto' }}>
              City-specific landing pages with local exam centres, target colleges, and student outcomes
            </Typography>
            <Grid container spacing={3}>
              {[
                { city: 'Chennai', tamil: 'சென்னை', href: '/coaching/nata-coaching/nata-coaching-centers-in-chennai', desc: 'Anna Nagar, Adyar, T. Nagar, Tambaram, Velachery, OMR' },
                { city: 'Coimbatore', tamil: 'கோயம்புத்தூர்', href: '/coaching/nata-coaching/nata-coaching-centers-in-coimbatore', desc: 'RS Puram, Saibaba Colony, Peelamedu, Saravanampatti' },
                { city: 'Madurai', tamil: 'மதுரை', href: '/coaching/nata-coaching/nata-coaching-centers-in-madurai', desc: 'K.K. Nagar, Anna Nagar, Tallakulam, Goripalayam' },
                { city: 'Trichy', tamil: 'திருச்சி', href: '/coaching/nata-coaching/nata-coaching-centers-in-trichy', desc: 'Cantonment, Thillai Nagar, Srirangam, NIT Trichy prep' },
                { city: 'Salem', tamil: 'சேலம்', href: '/coaching/nata-coaching/nata-coaching-centers-in-salem', desc: 'Hasthampatti, Fairlands, Suramangalam, Erode, Namakkal' },
                { city: 'Vellore', tamil: 'வேலூர்', href: '/coaching/nata-coaching/nata-coaching-centers-in-vellore', desc: 'Katpadi, Sathuvachari, Gandhi Nagar, VIT prep' },
              ].map((entry) => (
                <Grid item xs={12} sm={6} md={4} key={entry.href}>
                  <Card
                    component={Link}
                    href={entry.href}
                    sx={{
                      textDecoration: 'none',
                      height: '100%',
                      transition: 'all 0.2s',
                      '&:hover': { transform: 'translateY(-4px)', boxShadow: 4 },
                    }}
                  >
                    <CardContent>
                      <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.main' }}>
                        NATA Online Coaching in {entry.city}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                        ({entry.tamil})
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {entry.desc}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* NATA Online Coaching by Indian Metro */}
        <Box sx={{ py: { xs: 6, md: 9 }, bgcolor: 'background.default' }}>
          <Container maxWidth="lg">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 2 }}>
              NATA online coaching by Indian metro
            </Typography>
            <Typography variant="h6" align="center" color="text.secondary" sx={{ mb: 5, maxWidth: 720, mx: 'auto' }}>
              Pan-India metros with local exam centres, target colleges, and city-specific landing pages
            </Typography>
            <Grid container spacing={3}>
              {[
                { city: 'Bangalore', href: '/coaching/nata-coaching/nata-coaching-centers-in-bangalore', desc: 'BMS, RV College, MSRIT, Christ University. Koramangala, HSR, Whitefield, Electronic City.' },
                { city: 'Hyderabad', href: '/coaching/nata-coaching/nata-coaching-centers-in-hyderabad', desc: 'JNAFAU, JNTU architecture. Madhapur, Gachibowli, Banjara Hills, Kondapur, Secunderabad.' },
                { city: 'Mumbai', href: '/coaching/nata-coaching/nata-coaching-centers-in-mumbai', desc: 'Sir JJ, KRVIA, Rachana Sansad, Rizvi. Andheri, Bandra, Powai, Thane, Navi Mumbai.' },
                { city: 'Delhi NCR', href: '/coaching/nata-coaching/nata-coaching-centers-in-delhi', desc: 'SPA Delhi, USAP, Jamia Millia. South Delhi, Dwarka, Noida, Gurgaon, Ghaziabad, Faridabad.' },
                { city: 'Pune', href: '/coaching/nata-coaching/nata-coaching-centers-in-pune', desc: 'BNCA, Sinhgad, MIT, D Y Patil. Kothrud, Aundh, Baner, Viman Nagar, Pimpri-Chinchwad.' },
                { city: 'Kolkata', href: '/coaching/nata-coaching/nata-coaching-centers-in-kolkata', desc: 'Jadavpur University, IIEST Shibpur, Bengal Institute. Salt Lake, New Town, Howrah, Tollygunge.' },
                { city: 'Kochi', href: '/coaching/nata-coaching/nata-coaching-centers-in-kochi', desc: 'CET Trivandrum, NIT Calicut, TKM Kollam. Edappally, Kakkanad, Vyttila, Aluva.' },
                { city: 'Ahmedabad', href: '/coaching/nata-coaching/nata-coaching-centers-in-ahmedabad', desc: 'CEPT University, Nirma, SAL, Anant. Satellite, Vastrapur, Bopal, Gandhinagar.' },
              ].map((entry) => (
                <Grid item xs={12} sm={6} md={3} key={entry.href}>
                  <Card
                    component={Link}
                    href={entry.href}
                    sx={{
                      textDecoration: 'none',
                      height: '100%',
                      transition: 'all 0.2s',
                      '&:hover': { transform: 'translateY(-4px)', boxShadow: 4 },
                    }}
                  >
                    <CardContent>
                      <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.main', mb: 1 }}>
                        NATA Online Coaching in {entry.city}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {entry.desc}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* Related Pages - Internal Linking */}
        <Box sx={{ py: { xs: 6, md: 8 }, bgcolor: 'background.default' }}>
          <Container maxWidth="lg">
            <Typography variant="h3" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 4 }}>
              Explore more NATA resources
            </Typography>
            <Grid container spacing={3}>
              {[
                {
                  title: 'Neram vs BRDS vs SILICA Comparison',
                  href: '/nata-online-coaching/comparison',
                  desc: 'Side-by-side comparison of three NATA online coaching institutes on fees, format and support.',
                },
                {
                  title: 'NATA Cutoff Trends 2015 to 2025',
                  href: '/nata-cutoff-trends-2015-2025',
                  desc: '10-year analysis of NATA qualifying scores and top architecture college cutoffs.',
                },
                {
                  title: 'NATA 2026 Complete Guide',
                  href: '/nata-2026',
                  desc: 'Eligibility, syllabus, exam pattern, important dates, and exam centres for NATA 2026.',
                },
                {
                  title: 'NATA Syllabus 2026',
                  href: '/nata-syllabus',
                  desc: 'Topic-wise NATA syllabus breakdown with weightage for Drawing, Mathematics, and Aptitude.',
                },
                {
                  title: 'How to Score 150+ in NATA',
                  href: '/how-to-score-150-in-nata',
                  desc: '90-day study plan and topper strategy for scoring above 150 in NATA 2026.',
                },
                {
                  title: 'Free NATA Cutoff Calculator',
                  href: '/tools/cutoff-calculator',
                  desc: 'AI-powered cutoff calculator predicting your chances at top architecture colleges.',
                },
                {
                  title: 'Free College Predictor',
                  href: '/tools/college-predictor',
                  desc: 'Find B.Arch colleges that match your NATA score and category.',
                },
                {
                  title: 'NATA Coaching in Tamil Nadu',
                  href: '/coaching/nata-coaching-in-tamil-nadu',
                  desc: 'Online and offline NATA coaching across all 38 Tamil Nadu districts.',
                },
                {
                  title: 'Best NATA Books 2026',
                  href: '/best-books-nata-jee',
                  desc: 'Topper-recommended NATA and JEE Paper 2 books, ranked by section and difficulty.',
                },
                {
                  title: 'NATA Important Questions',
                  href: '/nata-important-questions',
                  desc: 'Frequently asked NATA questions with detailed solutions and concept breakdowns.',
                },
                {
                  title: 'Book Free Demo Class',
                  href: '/demo-class',
                  desc: 'Experience our teaching methodology before enrolling. Live session with faculty.',
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
                      <Typography
                        variant="subtitle1"
                        sx={{ fontWeight: 600, color: 'primary.main', mb: 0.5 }}
                      >
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

        {/* Bottom CTA Section */}
        <Box
          sx={{
            py: { xs: 8, md: 12 },
            pb: { xs: 14, md: 12 }, // extra bottom padding on mobile so sticky CTA does not overlap
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
              Start your NATA online coaching journey today
            </Typography>
            <Typography variant="h6" sx={{ mb: 4, opacity: 0.9, lineHeight: 1.6 }}>
              Live NATA classes since 2009, with small batches and daily drawing feedback. Book a free demo
              or reserve your seat now.
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
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
                Book Free Demo
              </Button>
            </Box>
          </Container>
        </Box>

        {/* Sticky Mobile CTA */}
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

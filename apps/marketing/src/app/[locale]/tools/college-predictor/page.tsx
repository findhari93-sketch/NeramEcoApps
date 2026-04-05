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
    question: 'How does the NATA College Predictor work?',
    answer:
      'The NATA College Predictor uses historical cutoff data, seat availability, and counselling trends from 500+ architecture colleges across India. Enter your NATA score, preferred state, and category. The tool matches you with colleges where your score meets or exceeds previous year cutoffs, ranked by admission probability.',
  },
  {
    question: 'How many colleges are in the NATA College Predictor database?',
    answer:
      'Our database includes 500+ architecture colleges across India offering B.Arch programmes. This covers government colleges, deemed universities, private institutions, and NITs. We update cutoff data after every counselling round to keep predictions accurate.',
  },
  {
    question: 'Can I filter colleges by state, fees, or college type?',
    answer:
      'Yes. The college predictor lets you filter results by state or union territory, fee range (low to high), college type (government, private, deemed university), and accreditation status (NAAC, NBA). You can also sort results by cutoff rank, annual fees, or placement record.',
  },
  {
    question: 'Is the NATA College Predictor free to use?',
    answer:
      'Yes, the NATA College Predictor is completely free. You can check unlimited colleges, apply multiple filters, and save your shortlist, all without any registration or payment. Premium features like detailed placement data and seat matrix are available in the Neram Classes app.',
  },
  {
    question: 'What is the counselling process for NATA 2026 admissions?',
    answer:
      'NATA scores are accepted by state-level counselling bodies and individual colleges. After results are declared, you register for counselling (state or college-level), fill preferences, and seats are allotted based on merit rank and availability. Our predictor shows which counselling body manages each college.',
  },
  {
    question: 'Does the predictor work for JEE Paper 2 scores as well?',
    answer:
      'Currently, the predictor is optimised for NATA scores. Many colleges accept both NATA and JEE Paper 2. We display which exam each college accepts, so you can plan accordingly. A dedicated JEE Paper 2 predictor is coming soon.',
  },
];

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title:
      'NATA College Predictor 2026: Find Architecture Colleges for Your Score',
    description:
      'Free NATA college predictor tool. Enter your NATA 2026 score to find matching B.Arch colleges from 500+ institutions. Filter by state, fees, college type, and admission probability.',
    keywords:
      'NATA college predictor, B.Arch college predictor, architecture colleges NATA score, NATA score wise college list 2026, NATA counselling predictor, NATA admission predictor',
    alternates: buildAlternates(locale, '/tools/college-predictor'),
    openGraph: {
      title:
        'NATA College Predictor 2026: Find Architecture Colleges for Your Score',
      description:
        'Free NATA college predictor. Enter your score to find matching architecture colleges from 500+ institutions across India.',
      url:
        locale === 'en'
          ? `${baseUrl}/tools/college-predictor`
          : `${baseUrl}/${locale}/tools/college-predictor`,
      type: 'website',
      images: [
        {
          url: buildOgImage(
            'NATA College Predictor',
            'Find colleges for your score',
            'tool'
          ),
        },
      ],
    },
  };
}

export default function CollegePredictorPage({
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
              name: 'College Predictor',
              url: `${baseUrl}/tools/college-predictor`,
            },
          ]),
          generateWebApplicationSchema({
            name: 'NATA College Predictor 2026',
            description:
              'Free NATA college predictor tool to find matching B.Arch colleges based on your score, state preference, and category.',
            url: `${baseUrl}/tools/college-predictor`,
            applicationCategory: 'EducationalApplication',
          }),
          generateFAQSchema(faqs),
        ]}
      />

      {/* Hero Section */}
      <Box
        sx={{
          background: 'linear-gradient(135deg, #1565C0 0%, #0D47A1 100%)',
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
            NATA College Predictor 2026
          </Typography>
          <Typography
            sx={{
              fontSize: { xs: '1rem', md: '1.25rem' },
              mb: 3,
              opacity: 0.95,
              lineHeight: 1.6,
            }}
          >
            The NATA College Predictor helps you find the best architecture
            colleges that match your NATA 2026 score. Enter your score, select
            your preferred state and category, and instantly see a personalised
            list of B.Arch colleges ranked by admission probability. Our
            database covers 500+ colleges across 28 states and 8 union
            territories, including government institutions, private colleges,
            deemed universities, and NITs. Each college listing shows previous
            year cutoffs, annual fees, seat count, accreditation status, and the
            counselling body that manages admissions. Whether you scored 80 or
            170, the predictor shows realistic options so you can plan your
            architecture career with confidence.
          </Typography>
          <Button
            component={Link}
            href={`${appUrl}/tools/counseling/college-predictor`}
            variant="contained"
            size="large"
            sx={{
              bgcolor: 'white',
              color: '#1565C0',
              fontWeight: 700,
              px: 4,
              py: 1.5,
              fontSize: '1.1rem',
              '&:hover': { bgcolor: '#E3F2FD' },
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
          How the College Predictor Works
        </Typography>
        <Grid container spacing={3}>
          {[
            {
              step: '1',
              title: 'Enter Your NATA Score',
              desc: 'Input your NATA 2026 total score (out of 200). You can also enter individual section scores for a more detailed analysis.',
            },
            {
              step: '2',
              title: 'Set Your Preferences',
              desc: 'Choose your preferred state, category (General, OBC, SC, ST), college type (government or private), and fee budget.',
            },
            {
              step: '3',
              title: 'Get Matched Colleges',
              desc: 'The tool analyses historical cutoffs and seat data to show colleges ranked by admission probability: High, Medium, or Low chance.',
            },
            {
              step: '4',
              title: 'Save & Compare',
              desc: 'Shortlist colleges, compare fees and placement records side-by-side, and export your list for counselling preparation.',
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
                      bgcolor: '#1565C0',
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
                title: '500+ Colleges Database',
                desc: 'Comprehensive coverage of B.Arch colleges across India, including IITs, NITs, government colleges, deemed universities, and private institutions.',
              },
              {
                title: 'State-wise Filtering',
                desc: 'Filter colleges by any of the 28 states and 8 union territories. Find options close to home or explore opportunities across India.',
              },
              {
                title: 'Category-based Predictions',
                desc: 'Get accurate cutoff predictions for your specific category (General, OBC, SC, ST, EWS) based on actual previous year data.',
              },
              {
                title: 'Fee & Placement Data',
                desc: 'View annual tuition fees, hostel charges, and placement statistics for each college to make informed financial decisions.',
              },
              {
                title: 'Admission Probability Score',
                desc: 'Each college gets a probability rating (High, Medium, Low) based on how your score compares to historical cutoffs.',
              },
              {
                title: 'Counselling Guide',
                desc: 'See which counselling body manages each college, important counselling dates, and step-by-step registration guidance.',
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
                    sx={{ color: 'text.secondary', fontSize: '0.95rem', lineHeight: 1.6 }}
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

      {/* NATA 2026 Context */}
      <Container maxWidth="md" sx={{ py: { xs: 5, md: 8 } }}>
        <Typography
          component="h2"
          sx={{
            fontSize: { xs: '1.5rem', md: '2rem' },
            fontWeight: 700,
            mb: 3,
          }}
        >
          NATA 2026 Score and College Admissions
        </Typography>
        <Typography sx={{ mb: 2, lineHeight: 1.8, color: 'text.secondary' }}>
          The National Aptitude Test in Architecture (NATA) 2026 is conducted by
          the Council of Architecture (CoA) for admission to B.Arch programmes
          across India. NATA is held in two sessions, and the better score of the
          two attempts is considered for admissions. The exam is scored out of
          200 marks, with sections covering Mathematics (20 MCQs, 40 marks),
          General Aptitude (40 MCQs, 80 marks), and Drawing (2 questions, 80
          marks).
        </Typography>
        <Typography sx={{ mb: 2, lineHeight: 1.8, color: 'text.secondary' }}>
          After the NATA results are declared, the real challenge begins:
          choosing the right college. With over 500 architecture colleges across
          India, each with different cutoffs, fee structures, and counselling
          processes, the decision can be overwhelming. Government colleges like
          IIT Kharagpur, IIT Roorkee, NIT Trichy, and SPA Delhi have cutoffs
          above 140, while many quality private colleges admit students scoring
          between 80 and 120.
        </Typography>
        <Typography sx={{ mb: 3, lineHeight: 1.8, color: 'text.secondary' }}>
          Our College Predictor simplifies this process by mapping your score to
          realistic college options. Instead of manually checking hundreds of
          college websites, you get a curated, ranked list in seconds. The tool
          is updated after every counselling round with the latest cutoff data,
          ensuring predictions remain accurate throughout the admission cycle.
        </Typography>
        <Button
          component={Link}
          href={`${appUrl}/tools/counseling/college-predictor`}
          variant="contained"
          size="large"
          sx={{
            bgcolor: '#1565C0',
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

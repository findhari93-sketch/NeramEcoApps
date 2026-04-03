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
  Divider,
  Paper,
} from '@neram/ui';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateFAQSchema, generateBreadcrumbSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';


export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'NATA & JEE Paper 2 Previous Year Papers 2015-2024',
    description: 'Download NATA and JEE Paper 2 previous year question papers with solutions. Get 10 years of papers for practice and preparation.',
    keywords: 'NATA previous year papers, JEE Paper 2 previous papers, NATA question papers with solutions, NATA past papers',
    alternates: buildAlternates(locale, '/previous-year-papers'),
  };
}

interface PageProps {
  params: { locale: string };
}

const nataPapers = [
  { year: 2024, sessions: ['Session 1', 'Session 2'], difficulty: 'Moderate', hasKeys: true },
  { year: 2023, sessions: ['Session 1', 'Session 2', 'Session 3'], difficulty: 'Moderate-Hard', hasKeys: true },
  { year: 2022, sessions: ['Session 1', 'Session 2'], difficulty: 'Moderate', hasKeys: true },
  { year: 2021, sessions: ['Session 1', 'Session 2'], difficulty: 'Easy-Moderate', hasKeys: true },
  { year: 2020, sessions: ['Session 1'], difficulty: 'Moderate', hasKeys: true },
  { year: 2019, sessions: ['Session 1', 'Session 2'], difficulty: 'Moderate', hasKeys: true },
  { year: 2018, sessions: ['April', 'July'], difficulty: 'Moderate', hasKeys: true },
  { year: 2017, sessions: ['April'], difficulty: 'Easy', hasKeys: true },
  { year: 2016, sessions: ['April'], difficulty: 'Easy', hasKeys: true },
  { year: 2015, sessions: ['April'], difficulty: 'Easy', hasKeys: true },
];

const jeePapers = [
  { year: 2024, sessions: ['January', 'April'], difficulty: 'Moderate-Hard', hasKeys: true },
  { year: 2023, sessions: ['January', 'April'], difficulty: 'Moderate', hasKeys: true },
  { year: 2022, sessions: ['June', 'July'], difficulty: 'Moderate', hasKeys: true },
  { year: 2021, sessions: ['February', 'March', 'July', 'August'], difficulty: 'Moderate', hasKeys: true },
  { year: 2020, sessions: ['January', 'September'], difficulty: 'Easy-Moderate', hasKeys: true },
  { year: 2019, sessions: ['January', 'April'], difficulty: 'Moderate', hasKeys: true },
  { year: 2018, sessions: ['April'], difficulty: 'Moderate', hasKeys: true },
  { year: 2017, sessions: ['April'], difficulty: 'Easy', hasKeys: true },
];

export default function PreviousYearPapersPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);

  const baseUrl = 'https://neramclasses.com';
  const faqs = [
    {
      question: 'Where can I get NATA previous year question papers with solutions?',
      answer: 'NATA previous year question papers from 2015 to 2024 are available through coaching institutes, online educational platforms, and preparation websites. While the Council of Architecture does not officially publish full papers, compiled question papers with detailed solutions are available in practice books and from coaching centers like Neram Classes that provide curated paper sets with expert solutions.',
    },
    {
      question: 'How many previous year papers should I solve before the NATA exam?',
      answer: 'You should aim to solve at least 8-10 years of NATA previous year papers (all available sessions) before the exam. Start solving papers without a timer to understand question patterns, then move to timed practice simulating actual exam conditions. Solving papers from 2019 onwards is especially important as the exam pattern was updated. Ideally, complete each paper twice - once for learning and once for timed practice.',
    },
    {
      question: 'Has the NATA exam pattern changed over the years?',
      answer: 'Yes, the NATA exam pattern has undergone several changes. Before 2019, the exam had a different format with separate offline drawing tests. From 2020 onwards, NATA shifted to a fully computer-based format including digital drawing. The total marks, section distribution, and number of attempts per year have also changed. When solving older papers (pre-2019), focus on the content rather than the format, as question types remain similar even though the delivery method changed.',
    },
    {
      question: 'Are JEE Paper 2 previous year papers also useful for NATA preparation?',
      answer: 'Yes, JEE Paper 2 previous year papers are extremely useful for NATA preparation since there is a 70-80% overlap in syllabus and question types. The Mathematics and Aptitude sections cover similar topics, and practicing JEE Paper 2 questions helps build stronger problem-solving skills since JEE tends to be slightly more challenging. However, the drawing section format differs, so practice NATA-specific drawing questions separately.',
    },
    {
      question: 'What is the best way to analyze my performance on previous year papers?',
      answer: 'After solving each paper, spend at least 1 hour on detailed analysis. Note your section-wise scores, identify topics where you lost marks, track time spent per section, and categorize mistakes as conceptual errors, silly mistakes, or time-management issues. Maintain an error log to track recurring weak areas. Compare your scores across papers to measure improvement. At Neram Classes, students get personalized performance analysis and targeted guidance based on their paper-solving data.',
    },
  ];

  return (
    <>
      <JsonLd data={generateFAQSchema(faqs)} />
      <JsonLd data={generateBreadcrumbSchema([
        { name: 'Home', url: baseUrl },
        { name: 'Previous Year Papers' },
      ])} />
    <Box>
      {/* Hero Section */}
      <Box
        sx={{
          py: { xs: 6, md: 10 },
          background: 'linear-gradient(135deg, #5c6bc0 0%, #3949ab 100%)',
          color: 'white',
        }}
      >
        <Container maxWidth="lg">
          <Typography variant="h1" component="h1" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '2rem', md: '3rem' } }}>
            Previous Year Papers
          </Typography>
          <Typography variant="h5" sx={{ mb: 3, opacity: 0.9 }}>
            10 years of NATA & JEE Paper 2 question papers with solutions
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              href="#nata-papers"
              sx={{ bgcolor: 'white', color: 'primary.main' }}
            >
              NATA Papers
            </Button>
            <Button
              variant="outlined"
              href="#jee-papers"
              sx={{ borderColor: 'white', color: 'white' }}
            >
              JEE Paper 2
            </Button>
          </Box>
        </Container>
      </Box>

      {/* Stats */}
      <Box sx={{ py: 4, bgcolor: 'grey.50' }}>
        <Container maxWidth="lg">
          <Grid container spacing={3}>
            {[
              { value: '50+', label: 'Question Papers' },
              { value: '10', label: 'Years Coverage' },
              { value: '100%', label: 'With Solutions' },
              { value: 'Free', label: 'Download' },
            ].map((stat, index) => (
              <Grid item xs={6} md={3} key={index}>
                <Paper sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="h4" color="primary" sx={{ fontWeight: 700 }}>{stat.value}</Typography>
                  <Typography variant="body2" color="text.secondary">{stat.label}</Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* NATA Papers */}
      <Box id="nata-papers" sx={{ py: { xs: 6, md: 10 } }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" gutterBottom sx={{ fontWeight: 700, mb: 4 }}>
            NATA Previous Year Papers (2015-2024)
          </Typography>
          <Grid container spacing={3}>
            {nataPapers.map((paper, index) => (
              <Grid item xs={12} sm={6} md={4} key={index}>
                <Card sx={{ height: '100%' }}>
                  <CardContent sx={{ p: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Typography variant="h4" color="primary" sx={{ fontWeight: 700 }}>
                        {paper.year}
                      </Typography>
                      {paper.hasKeys && (
                        <Chip label="With Solutions" size="small" color="success" />
                      )}
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Sessions: {paper.sessions.join(', ')}
                    </Typography>
                    <Typography variant="caption" display="block" sx={{ mb: 2 }}>
                      Difficulty: {paper.difficulty}
                    </Typography>
                    <Divider sx={{ my: 2 }} />
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      <Button variant="outlined" size="small" href="#">
                        Question Paper
                      </Button>
                      <Button variant="contained" size="small" href="#">
                        With Solutions
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* JEE Papers */}
      <Box id="jee-papers" sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" gutterBottom sx={{ fontWeight: 700, mb: 4 }}>
            JEE Paper 2 Previous Year Papers (2017-2024)
          </Typography>
          <Grid container spacing={3}>
            {jeePapers.map((paper, index) => (
              <Grid item xs={12} sm={6} md={4} key={index}>
                <Card sx={{ height: '100%' }}>
                  <CardContent sx={{ p: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Typography variant="h4" color="secondary" sx={{ fontWeight: 700 }}>
                        {paper.year}
                      </Typography>
                      {paper.hasKeys && (
                        <Chip label="With Solutions" size="small" color="success" />
                      )}
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Sessions: {paper.sessions.join(', ')}
                    </Typography>
                    <Typography variant="caption" display="block" sx={{ mb: 2 }}>
                      Difficulty: {paper.difficulty}
                    </Typography>
                    <Divider sx={{ my: 2 }} />
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      <Button variant="outlined" size="small" color="secondary" href="#">
                        Question Paper
                      </Button>
                      <Button variant="contained" size="small" color="secondary" href="#">
                        With Solutions
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* How to Use Papers */}
      <Box sx={{ py: { xs: 6, md: 10 } }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 6 }}>
            How to Use Previous Year Papers Effectively
          </Typography>
          <Grid container spacing={4}>
            {[
              { step: 1, title: 'Attempt Without Timer First', desc: 'For the first attempt, focus on accuracy. Understand each question type.' },
              { step: 2, title: 'Analyze Your Performance', desc: 'Identify weak areas. Note topics where you made mistakes.' },
              { step: 3, title: 'Time-Bound Practice', desc: 'Attempt papers with strict 3-hour time limit. Simulate exam conditions.' },
              { step: 4, title: 'Review Solutions Carefully', desc: "Even for correct answers, check if your method was optimal." },
            ].map((item, index) => (
              <Grid item xs={12} sm={6} md={3} key={index}>
                <Card sx={{ height: '100%', textAlign: 'center', p: 3 }}>
                  <Typography
                    variant="h3"
                    sx={{
                      width: 60,
                      height: 60,
                      borderRadius: '50%',
                      bgcolor: 'primary.main',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      mx: 'auto',
                      mb: 2,
                    }}
                  >
                    {item.step}
                  </Typography>
                  <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>{item.title}</Typography>
                  <Typography variant="body2" color="text.secondary">{item.desc}</Typography>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* CTA Section */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'primary.main', color: 'white', textAlign: 'center' }}>
        <Container maxWidth="md">
          <Typography variant="h3" component="h2" gutterBottom sx={{ fontWeight: 700 }}>
            Need Expert Analysis of Your Attempts?
          </Typography>
          <Typography variant="h6" sx={{ mb: 4, opacity: 0.9 }}>
            Join Neram Classes for detailed paper analysis and personalized feedback
          </Typography>
          <Button
            variant="contained"
            size="large"
            component={Link}
            href="/apply"
            sx={{ bgcolor: 'white', color: 'primary.main' }}
          >
            Join Now
          </Button>
        </Container>
      </Box>
    </Box>
    </>
  );
}

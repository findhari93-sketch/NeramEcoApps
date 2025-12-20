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

export const metadata: Metadata = {
  title: 'NATA & JEE Paper 2 Previous Year Papers 2015-2024 | Neram Classes',
  description: 'Download NATA and JEE Paper 2 previous year question papers with solutions. Get 10 years of papers for practice and preparation.',
  keywords: 'NATA previous year papers, JEE Paper 2 previous papers, NATA question papers with solutions, NATA past papers',
  alternates: {
    canonical: 'https://neramclasses.com/en/previous-year-papers',
  },
};

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

  return (
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
  );
}

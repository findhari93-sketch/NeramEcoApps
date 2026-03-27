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
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Paper,
  Divider,
} from '@neram/ui';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateFAQSchema, generateBreadcrumbSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import RelatedContent from '@/components/seo/RelatedContent';

export const revalidate = 86400;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'JEE Paper 2 Preparation Guide 2026 - B.Arch & B.Planning',
    description: 'Complete JEE Main Paper 2 (B.Arch/B.Planning) 2026 preparation guide. Learn about exam pattern, syllabus, preparation strategy, and tips to crack JEE Paper 2.',
    keywords: 'JEE Paper 2 preparation, JEE B.Arch, JEE B.Planning, JEE Paper 2 syllabus, JEE Paper 2 tips',
    alternates: buildAlternates(locale, '/jee-paper-2-preparation'),
  };
}

interface PageProps {
  params: { locale: string };
}

const examPattern = {
  barch: {
    title: 'B.Arch (Paper 2A)',
    sections: [
      { name: 'Mathematics', questions: 25, marks: 100 },
      { name: 'Aptitude Test', questions: 50, marks: 200 },
      { name: 'Drawing Test', questions: 2, marks: 100 },
    ],
    total: 400,
    duration: '3 Hours',
  },
  bplanning: {
    title: 'B.Planning (Paper 2B)',
    sections: [
      { name: 'Mathematics', questions: 25, marks: 100 },
      { name: 'Aptitude Test', questions: 50, marks: 200 },
      { name: 'Planning Based', questions: 25, marks: 100 },
    ],
    total: 400,
    duration: '3 Hours',
  },
};

const preparationTips = [
  {
    category: 'Mathematics',
    tips: [
      'Focus on Class 11-12 NCERT mathematics thoroughly',
      'Practice coordinate geometry - high weightage topic',
      'Master calculus for quick problem solving',
      'Solve previous 10 years JEE Paper 2 questions',
      'Practice mental calculations for time saving',
    ],
  },
  {
    category: 'Aptitude',
    tips: [
      'Study architectural history and famous buildings',
      'Practice 3D visualization and mental rotation',
      'Learn about building materials and construction',
      'Solve puzzles and logical reasoning daily',
      'Focus on spatial reasoning problems',
    ],
  },
  {
    category: 'Drawing',
    tips: [
      'Practice perspective drawing techniques',
      'Master freehand sketching of objects',
      'Learn shading and rendering techniques',
      'Practice 2D to 3D conversions',
      'Develop speed while maintaining quality',
    ],
  },
];

const topColleges = [
  { name: 'IIT Kharagpur', seats: 45, cutoff: '180+' },
  { name: 'IIT Roorkee', seats: 40, cutoff: '175+' },
  { name: 'NIT Trichy', seats: 50, cutoff: '150+' },
  { name: 'NIT Calicut', seats: 45, cutoff: '145+' },
  { name: 'MNIT Jaipur', seats: 40, cutoff: '140+' },
  { name: 'SPA Delhi', seats: 120, cutoff: '165+' },
];

export default function JeePaper2PreparationPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);

  const baseUrl = 'https://neramclasses.com';
  const faqs = [
    {
      question: 'What is the difference between JEE Paper 2 and NATA?',
      answer: 'JEE Paper 2 is conducted by NTA for admission to IITs, NITs, and other government architecture colleges, while NATA is conducted by the Council of Architecture for private architecture colleges. JEE Paper 2 has 400 total marks with a computer-based test plus drawing on paper, whereas NATA has 200 marks with a fully computer-based format including digital drawing. Both exams test Mathematics, Aptitude, and Drawing skills.',
    },
    {
      question: 'What is the difference between B.Arch and B.Planning in JEE Paper 2?',
      answer: 'B.Arch (Paper 2A) includes Mathematics, Aptitude Test, and a Drawing Test, and leads to a Bachelor of Architecture degree. B.Planning (Paper 2B) includes Mathematics, Aptitude Test, and a Planning-based section instead of Drawing, leading to a Bachelor of Planning degree. Both papers are 400 marks total with a 3-hour duration, but they differ in the third section.',
    },
    {
      question: 'Which NITs accept JEE Paper 2 scores for B.Arch admission?',
      answer: 'Several prestigious NITs accept JEE Paper 2 scores including NIT Trichy, NIT Calicut, MNIT Jaipur, NIT Rourkela, NIT Patna, and NIT Bhopal among others. Additionally, IITs like IIT Kharagpur and IIT Roorkee accept JEE Paper 2 scores, though IIT admission also requires clearing the AAT (Architecture Aptitude Test). Expected cutoff scores vary from 140+ to 180+ depending on the institution.',
    },
    {
      question: 'How much do NATA and JEE Paper 2 preparation overlap?',
      answer: 'There is significant overlap between NATA and JEE Paper 2 preparation, approximately 70-80%. Both exams test Mathematics (similar syllabus), General Aptitude (spatial reasoning, logical thinking), and Drawing skills. The main difference is that JEE Paper 2 has a higher difficulty level in Mathematics and the drawing is on paper rather than computer. Students preparing for both exams can follow a unified study plan with minor adjustments.',
    },
    {
      question: 'What is AAT and is it required for IIT B.Arch admission?',
      answer: 'AAT (Architecture Aptitude Test) is an additional test conducted by IITs after JEE Advanced results. It is mandatory for admission to B.Arch programs at IITs like IIT Kharagpur and IIT Roorkee. AAT tests freehand drawing, architectural awareness, 3D visualization, and imagination. Only students who qualify JEE Advanced are eligible to take AAT. The test is typically conducted within a week after JEE Advanced results.',
    },
  ];

  return (
    <>
      <JsonLd data={generateFAQSchema(faqs)} />
      <JsonLd data={generateBreadcrumbSchema([
        { name: 'Home', url: baseUrl },
        { name: 'JEE Paper 2 Preparation' },
      ])} />
    <Box>
      {/* Hero Section */}
      <Box
        sx={{
          py: { xs: 6, md: 10 },
          background: 'linear-gradient(135deg, #1565c0 0%, #0d47a1 100%)',
          color: 'white',
        }}
      >
        <Container maxWidth="lg">
          <Typography variant="h1" component="h1" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '2rem', md: '3rem' } }}>
            JEE Paper 2 Preparation Guide 2026
          </Typography>
          <Typography variant="h5" sx={{ mb: 3, opacity: 0.9 }}>
            Your complete guide to crack JEE Main Paper 2 for B.Arch & B.Planning
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              component={Link}
              href="/apply"
              sx={{ bgcolor: 'white', color: 'primary.main' }}
            >
              Start Preparation
            </Button>
            <Button
              variant="outlined"
              component={Link}
              href="/courses/jee-paper-2-coaching"
              sx={{ borderColor: 'white', color: 'white' }}
            >
              View Course
            </Button>
          </Box>
        </Container>
      </Box>

      {/* Exam Pattern */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 6 }}>
            JEE Paper 2 Exam Pattern 2026
          </Typography>

          <Grid container spacing={4}>
            {Object.entries(examPattern).map(([key, pattern]) => (
              <Grid item xs={12} md={6} key={key}>
                <Card>
                  <CardContent sx={{ p: 4 }}>
                    <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, color: 'primary.main' }}>
                      {pattern.title}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                      <Paper sx={{ p: 1.5, textAlign: 'center', flex: 1 }}>
                        <Typography variant="h4" color="primary">{pattern.total}</Typography>
                        <Typography variant="caption">Total Marks</Typography>
                      </Paper>
                      <Paper sx={{ p: 1.5, textAlign: 'center', flex: 1 }}>
                        <Typography variant="h4" color="primary">{pattern.duration}</Typography>
                        <Typography variant="caption">Duration</Typography>
                      </Paper>
                    </Box>
                    <Divider sx={{ my: 2 }} />
                    {pattern.sections.map((section, idx) => (
                      <Box key={idx} sx={{ display: 'flex', justifyContent: 'space-between', py: 1 }}>
                        <Typography variant="body1">{section.name}</Typography>
                        <Typography variant="body1" color="text.secondary">
                          {section.questions} Q × {section.marks} Marks
                        </Typography>
                      </Box>
                    ))}
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Preparation Strategy */}
      <Box sx={{ py: { xs: 6, md: 10 } }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 6 }}>
            Subject-wise Preparation Strategy
          </Typography>

          <Grid container spacing={4}>
            {preparationTips.map((section, index) => (
              <Grid item xs={12} md={4} key={index}>
                <Card sx={{ height: '100%' }}>
                  <CardContent sx={{ p: 4 }}>
                    <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, color: 'primary.main' }}>
                      {section.category}
                    </Typography>
                    <List>
                      {section.tips.map((tip, idx) => (
                        <ListItem key={idx} sx={{ py: 0.5, px: 0 }}>
                          <ListItemIcon sx={{ minWidth: 28 }}>
                            <Typography color="success.main">✓</Typography>
                          </ListItemIcon>
                          <ListItemText primary={tip} primaryTypographyProps={{ variant: 'body2' }} />
                        </ListItem>
                      ))}
                    </List>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Top Colleges */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 6 }}>
            Top Colleges Through JEE Paper 2
          </Typography>

          <Grid container spacing={3}>
            {topColleges.map((college, index) => (
              <Grid item xs={12} sm={6} md={4} key={index}>
                <Card sx={{ height: '100%' }}>
                  <CardContent sx={{ p: 3, textAlign: 'center' }}>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>{college.name}</Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'center', gap: 3, mt: 2 }}>
                      <Box>
                        <Typography variant="h5" color="primary">{college.seats}</Typography>
                        <Typography variant="caption">Seats</Typography>
                      </Box>
                      <Box>
                        <Typography variant="h5" color="success.main">{college.cutoff}</Typography>
                        <Typography variant="caption">Expected Cutoff</Typography>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* NATA vs JEE */}
      <Box sx={{ py: { xs: 6, md: 10 } }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 6 }}>
            JEE Paper 2 vs NATA
          </Typography>

          <Grid container spacing={4}>
            <Grid item xs={12} md={6}>
              <Card sx={{ height: '100%', borderTop: 4, borderColor: 'primary.main' }}>
                <CardContent sx={{ p: 4 }}>
                  <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>JEE Paper 2</Typography>
                  <List dense>
                    <ListItem sx={{ px: 0 }}><ListItemText primary="Conducted by NTA" /></ListItem>
                    <ListItem sx={{ px: 0 }}><ListItemText primary="Once a year (January)" /></ListItem>
                    <ListItem sx={{ px: 0 }}><ListItemText primary="For IITs, NITs, IIITs, GFTIs" /></ListItem>
                    <ListItem sx={{ px: 0 }}><ListItemText primary="400 marks total" /></ListItem>
                    <ListItem sx={{ px: 0 }}><ListItemText primary="Computer-based + Drawing on paper" /></ListItem>
                  </List>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={6}>
              <Card sx={{ height: '100%', borderTop: 4, borderColor: 'secondary.main' }}>
                <CardContent sx={{ p: 4 }}>
                  <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>NATA</Typography>
                  <List dense>
                    <ListItem sx={{ px: 0 }}><ListItemText primary="Conducted by CoA" /></ListItem>
                    <ListItem sx={{ px: 0 }}><ListItemText primary="2-3 times a year" /></ListItem>
                    <ListItem sx={{ px: 0 }}><ListItemText primary="For private architecture colleges" /></ListItem>
                    <ListItem sx={{ px: 0 }}><ListItemText primary="200 marks total" /></ListItem>
                    <ListItem sx={{ px: 0 }}><ListItemText primary="Computer-based + Drawing on computer" /></ListItem>
                  </List>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* Related Content */}
      <RelatedContent
        heading="Related Exam Resources"
        locale={locale}
        links={[
          { title: 'NATA Syllabus 2026', description: 'Complete NATA exam syllabus and topics', href: '/nata-syllabus' },
          { title: 'NATA Coaching', description: 'Expert NATA coaching with IIT/NIT alumni', href: '/coaching/nata-coaching' },
          { title: 'TNEA B.Arch Counseling', description: 'Guide to Tamil Nadu architecture admission counseling', href: '/counseling/tnea-barch' },
          { title: 'Best Books for NATA & JEE', description: 'Top books for architecture entrance preparation', href: '/best-books-nata-jee' },
        ]}
      />

      {/* CTA Section */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'primary.main', color: 'white', textAlign: 'center' }}>
        <Container maxWidth="md">
          <Typography variant="h3" component="h2" gutterBottom sx={{ fontWeight: 700 }}>
            Ready to Crack JEE Paper 2?
          </Typography>
          <Typography variant="h6" sx={{ mb: 4, opacity: 0.9 }}>
            Join Neram Classes for expert coaching and guaranteed results
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              size="large"
              component={Link}
              href="/apply"
              sx={{ bgcolor: 'white', color: 'primary.main' }}
            >
              Enroll Now
            </Button>
            <Button
              variant="outlined"
              size="large"
              component={Link}
              href="/contact"
              sx={{ borderColor: 'white', color: 'white' }}
            >
              Free Demo Class
            </Button>
          </Box>
        </Container>
      </Box>
    </Box>
    </>
  );
}

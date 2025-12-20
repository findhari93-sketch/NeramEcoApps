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

export const metadata: Metadata = {
  title: 'JEE Paper 2 Preparation Guide 2025 - B.Arch & B.Planning | Neram Classes',
  description: 'Complete JEE Main Paper 2 (B.Arch/B.Planning) preparation guide. Learn about exam pattern, syllabus, preparation strategy, and tips to crack JEE Paper 2.',
  keywords: 'JEE Paper 2 preparation, JEE B.Arch, JEE B.Planning, JEE Paper 2 syllabus, JEE Paper 2 tips',
  alternates: {
    canonical: 'https://neramclasses.com/en/jee-paper-2-preparation',
  },
};

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

  return (
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
            JEE Paper 2 Preparation Guide 2025
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
            JEE Paper 2 Exam Pattern 2025
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
  );
}

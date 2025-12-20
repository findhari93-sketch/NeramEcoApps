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
  title: 'NATA Preparation Guide 2025 - How to Prepare for NATA | Neram Classes',
  description: 'Complete NATA 2025 preparation guide with month-wise study plan, tips, strategies, and expert advice. Learn how to crack NATA exam effectively.',
  keywords: 'NATA preparation, how to prepare for NATA, NATA study plan, NATA tips, NATA strategy',
  alternates: {
    canonical: 'https://neramclasses.com/en/nata-preparation-guide',
  },
};

interface PageProps {
  params: { locale: string };
}

const preparationPhases = [
  {
    phase: 'Phase 1: Foundation (Month 1-2)',
    focus: 'Build strong basics',
    tasks: [
      'Complete NCERT Mathematics (Class 11-12)',
      'Start daily sketching practice (1-2 hours)',
      'Learn basic architectural terminology',
      'Practice mental math and calculations',
      'Understand exam pattern and marking scheme',
    ],
  },
  {
    phase: 'Phase 2: Core Preparation (Month 3-4)',
    focus: 'Deep dive into subjects',
    tasks: [
      'Complete entire NATA syllabus',
      'Practice previous year papers',
      'Focus on 3D visualization and perspective',
      'Solve aptitude questions daily',
      'Study famous architects and buildings',
    ],
  },
  {
    phase: 'Phase 3: Practice & Testing (Month 5-6)',
    focus: 'Intensive practice',
    tasks: [
      'Take weekly mock tests',
      'Analyze mistakes and weak areas',
      'Time-bound practice sessions',
      'Focus on speed and accuracy',
      'Revision of important topics',
    ],
  },
  {
    phase: 'Phase 4: Final Sprint (Last Month)',
    focus: 'Polish and perfect',
    tasks: [
      'Daily full-length mock tests',
      'Quick revision of formulas',
      'Practice drawing under exam conditions',
      'Stress management and relaxation',
      'Final revision of weak areas',
    ],
  },
];

const subjectStrategies = [
  {
    subject: 'Mathematics (40 Marks)',
    icon: '📐',
    strategies: [
      'Focus on Coordinate Geometry - highest weightage',
      'Master Trigonometry formulas and identities',
      'Practice Calculus problems daily',
      'Learn shortcuts for quick calculations',
      'Solve at least 50 questions from each topic',
    ],
  },
  {
    subject: 'General Aptitude (80 Marks)',
    icon: '🧠',
    strategies: [
      'Practice spatial reasoning with cube problems',
      'Solve logical puzzles and riddles daily',
      'Study architectural awareness thoroughly',
      'Improve pattern recognition skills',
      'Take timed aptitude tests regularly',
    ],
  },
  {
    subject: 'Drawing Test (80 Marks)',
    icon: '✏️',
    strategies: [
      'Practice sketching objects from memory',
      'Master perspective drawing techniques',
      'Learn shading and texture rendering',
      'Practice 2D to 3D conversions',
      'Develop your unique artistic style',
    ],
  },
];

export default function NataPreparationGuidePage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);

  return (
    <Box>
      {/* Hero Section */}
      <Box
        sx={{
          py: { xs: 6, md: 10 },
          background: 'linear-gradient(135deg, #2e7d32 0%, #1b5e20 100%)',
          color: 'white',
        }}
      >
        <Container maxWidth="lg">
          <Typography variant="h1" component="h1" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '2rem', md: '3rem' } }}>
            NATA Preparation Guide 2025
          </Typography>
          <Typography variant="h5" sx={{ mb: 3, opacity: 0.9 }}>
            Your complete roadmap to cracking NATA with a top rank
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              component={Link}
              href="/apply"
              sx={{ bgcolor: 'white', color: 'success.main' }}
            >
              Join NATA Coaching
            </Button>
            <Button
              variant="outlined"
              component={Link}
              href="/nata-syllabus"
              sx={{ borderColor: 'white', color: 'white' }}
            >
              View Syllabus
            </Button>
          </Box>
        </Container>
      </Box>

      {/* Quick Overview */}
      <Box sx={{ py: 4, bgcolor: 'grey.50' }}>
        <Container maxWidth="lg">
          <Grid container spacing={3}>
            {[
              { label: 'Recommended Prep Time', value: '6-12 Months' },
              { label: 'Daily Study Hours', value: '4-6 Hours' },
              { label: 'Mock Tests', value: '50+ Tests' },
              { label: 'Drawing Practice', value: '2+ Hours/Day' },
            ].map((item, index) => (
              <Grid item xs={6} md={3} key={index}>
                <Paper sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="h5" color="primary" sx={{ fontWeight: 700 }}>
                    {item.value}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {item.label}
                  </Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Preparation Timeline */}
      <Box sx={{ py: { xs: 6, md: 10 } }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 6 }}>
            6-Month Preparation Timeline
          </Typography>

          <Grid container spacing={4}>
            {preparationPhases.map((phase, index) => (
              <Grid item xs={12} md={6} key={index}>
                <Card sx={{ height: '100%' }}>
                  <CardContent sx={{ p: 4 }}>
                    <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, color: 'primary.main' }}>
                      {phase.phase}
                    </Typography>
                    <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 2 }}>
                      Focus: {phase.focus}
                    </Typography>
                    <List>
                      {phase.tasks.map((task, idx) => (
                        <ListItem key={idx} sx={{ py: 0.5, px: 0 }}>
                          <ListItemIcon sx={{ minWidth: 28 }}>
                            <Typography color="success.main">✓</Typography>
                          </ListItemIcon>
                          <ListItemText primary={task} />
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

      {/* Subject-wise Strategy */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 6 }}>
            Subject-wise Strategy
          </Typography>

          <Grid container spacing={4}>
            {subjectStrategies.map((subject, index) => (
              <Grid item xs={12} md={4} key={index}>
                <Card sx={{ height: '100%' }}>
                  <CardContent sx={{ p: 4 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                      <Typography variant="h3" sx={{ mr: 2 }}>{subject.icon}</Typography>
                      <Typography variant="h6" sx={{ fontWeight: 600 }}>
                        {subject.subject}
                      </Typography>
                    </Box>
                    <Divider sx={{ my: 2 }} />
                    <List dense>
                      {subject.strategies.map((strategy, idx) => (
                        <ListItem key={idx} sx={{ py: 0.5, px: 0 }}>
                          <ListItemIcon sx={{ minWidth: 24 }}>
                            <Typography variant="body2">•</Typography>
                          </ListItemIcon>
                          <ListItemText
                            primary={strategy}
                            primaryTypographyProps={{ variant: 'body2' }}
                          />
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

      {/* Common Mistakes */}
      <Box sx={{ py: { xs: 6, md: 10 } }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 6 }}>
            Common Mistakes to Avoid
          </Typography>

          <Grid container spacing={3}>
            {[
              { mistake: 'Ignoring Drawing Practice', fix: 'Drawing carries 80 marks. Practice daily without fail.' },
              { mistake: 'Last-minute Preparation', fix: 'Start at least 6 months before the exam.' },
              { mistake: 'Skipping Mock Tests', fix: 'Take 2-3 mock tests every week.' },
              { mistake: 'Neglecting Time Management', fix: 'Practice with timer from day one.' },
              { mistake: 'Ignoring Aptitude Section', fix: 'Aptitude has 80 marks - focus equally.' },
              { mistake: 'Not Revising Regularly', fix: 'Schedule weekly revision sessions.' },
            ].map((item, index) => (
              <Grid item xs={12} sm={6} md={4} key={index}>
                <Card sx={{ height: '100%', borderLeft: 4, borderColor: 'error.main' }}>
                  <CardContent>
                    <Typography variant="h6" color="error" gutterBottom sx={{ fontWeight: 600 }}>
                      ❌ {item.mistake}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      ✅ {item.fix}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* CTA Section */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'success.main', color: 'white', textAlign: 'center' }}>
        <Container maxWidth="md">
          <Typography variant="h3" component="h2" gutterBottom sx={{ fontWeight: 700 }}>
            Need Expert Guidance?
          </Typography>
          <Typography variant="h6" sx={{ mb: 4, opacity: 0.9 }}>
            Join Neram Classes for structured NATA preparation with personalized mentoring
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              size="large"
              component={Link}
              href="/apply"
              sx={{ bgcolor: 'white', color: 'success.main' }}
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
              Free Counseling
            </Button>
          </Box>
        </Container>
      </Box>
    </Box>
  );
}

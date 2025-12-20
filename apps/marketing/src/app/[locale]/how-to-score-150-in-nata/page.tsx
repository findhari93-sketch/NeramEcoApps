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
  title: 'How to Score 150+ in NATA 2025 - Tips & Strategy | Neram Classes',
  description: 'Learn proven strategies and tips to score 150+ marks in NATA exam. Expert guidance on section-wise preparation and time management for top scores.',
  keywords: 'NATA score, how to score in NATA, NATA tips, NATA 150 marks, NATA strategy',
  alternates: {
    canonical: 'https://neramclasses.com/en/how-to-score-150-in-nata',
  },
};

interface PageProps {
  params: { locale: string };
}

const scoreBreakdown = [
  { section: 'Mathematics', maxMarks: 40, targetMarks: 32, strategy: 'Attempt all questions, focus on accuracy' },
  { section: 'General Aptitude', maxMarks: 80, targetMarks: 60, strategy: 'Master spatial reasoning and patterns' },
  { section: 'Drawing Test', maxMarks: 80, targetMarks: 60, strategy: 'Practice daily, focus on perspective' },
];

const weeklySchedule = [
  { day: 'Monday', focus: 'Mathematics - Coordinate Geometry', hours: 4 },
  { day: 'Tuesday', focus: 'Drawing - Perspective & Sketching', hours: 4 },
  { day: 'Wednesday', focus: 'Aptitude - Logical Reasoning', hours: 4 },
  { day: 'Thursday', focus: 'Mathematics - Calculus & Trigonometry', hours: 4 },
  { day: 'Friday', focus: 'Drawing - Composition & Creativity', hours: 4 },
  { day: 'Saturday', focus: 'Full Mock Test + Analysis', hours: 5 },
  { day: 'Sunday', focus: 'Revision + Weak Areas', hours: 3 },
];

const topperTips = [
  {
    name: 'Priya V.',
    rank: 'AIR 12',
    score: '172/200',
    tip: 'I practiced drawing for 3 hours daily. Perspective drawing was my focus area.',
  },
  {
    name: 'Arjun K.',
    rank: 'AIR 45',
    score: '165/200',
    tip: 'Solving previous year papers helped me understand the pattern. I solved 10 years of papers.',
  },
  {
    name: 'Sneha R.',
    rank: 'AIR 78',
    score: '158/200',
    tip: 'Time management is key. I practiced with a timer from day one.',
  },
];

export default function HowToScore150InNataPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);

  return (
    <Box>
      {/* Hero Section */}
      <Box
        sx={{
          py: { xs: 6, md: 10 },
          background: 'linear-gradient(135deg, #f57c00 0%, #e65100 100%)',
          color: 'white',
        }}
      >
        <Container maxWidth="lg">
          <Typography variant="h1" component="h1" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '2rem', md: '3rem' } }}>
            How to Score 150+ in NATA 2025
          </Typography>
          <Typography variant="h5" sx={{ mb: 3, opacity: 0.9 }}>
            Proven strategies used by toppers to crack NATA with high scores
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              component={Link}
              href="/apply"
              sx={{ bgcolor: 'white', color: 'warning.dark' }}
            >
              Start Preparation
            </Button>
            <Button
              variant="outlined"
              component={Link}
              href="/nata-preparation-guide"
              sx={{ borderColor: 'white', color: 'white' }}
            >
              Full Prep Guide
            </Button>
          </Box>
        </Container>
      </Box>

      {/* Score Target */}
      <Box sx={{ py: { xs: 4, md: 6 }, bgcolor: 'grey.50' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 4 }}>
            Target Score Breakdown
          </Typography>
          <Grid container spacing={3}>
            {scoreBreakdown.map((item, index) => (
              <Grid item xs={12} md={4} key={index}>
                <Paper sx={{ p: 3, textAlign: 'center', height: '100%' }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>{item.section}</Typography>
                  <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mb: 2 }}>
                    <Box>
                      <Typography variant="h4" color="primary">{item.targetMarks}</Typography>
                      <Typography variant="caption">Target</Typography>
                    </Box>
                    <Typography variant="h4" color="text.secondary">/</Typography>
                    <Box>
                      <Typography variant="h4" color="text.secondary">{item.maxMarks}</Typography>
                      <Typography variant="caption">Max</Typography>
                    </Box>
                  </Box>
                  <Typography variant="body2" color="text.secondary">{item.strategy}</Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
          <Box sx={{ textAlign: 'center', mt: 4 }}>
            <Typography variant="h4" color="success.main" sx={{ fontWeight: 700 }}>
              Total Target: 152/200 = 76%
            </Typography>
            <Typography variant="body1" color="text.secondary">
              This score is enough for top 100 AIR in NATA
            </Typography>
          </Box>
        </Container>
      </Box>

      {/* Key Strategies */}
      <Box sx={{ py: { xs: 6, md: 10 } }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 6 }}>
            10 Strategies to Score 150+
          </Typography>
          <Grid container spacing={3}>
            {[
              { num: 1, title: 'Master Perspective Drawing', desc: 'Practice 1-point, 2-point, and 3-point perspectives daily. This is the most scoring area in drawing.' },
              { num: 2, title: 'Focus on High-Weightage Topics', desc: 'Coordinate Geometry, Matrices, and Spatial Reasoning carry maximum marks. Master these first.' },
              { num: 3, title: 'Solve Previous 10 Years Papers', desc: 'Questions often repeat. Knowing patterns helps you attempt faster and more accurately.' },
              { num: 4, title: 'Practice Under Exam Conditions', desc: 'Take mock tests in 3-hour slots. Get comfortable with the pressure before the actual exam.' },
              { num: 5, title: 'Develop Speed in Mathematics', desc: 'Learn shortcuts and mental math. Save time in mathematics for drawing section.' },
              { num: 6, title: 'Build Architectural Vocabulary', desc: 'Learn about famous buildings, architects, and styles. 5-10 questions come from this area.' },
              { num: 7, title: 'Practice Sketching Daily', desc: 'Minimum 2 hours of drawing practice every single day. There are no shortcuts here.' },
              { num: 8, title: 'Analyze Your Mistakes', desc: 'After every mock test, spend 1 hour analyzing what went wrong. Never repeat mistakes.' },
              { num: 9, title: 'Stay Updated with Pattern Changes', desc: 'NATA pattern can change. Stay connected with coaching for latest updates.' },
              { num: 10, title: 'Focus on Presentation', desc: 'In drawing, presentation matters. Clean sketches score more than messy detailed ones.' },
            ].map((strategy, index) => (
              <Grid item xs={12} sm={6} md={4} key={index}>
                <Card sx={{ height: '100%' }}>
                  <CardContent sx={{ p: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                      <Box
                        sx={{
                          width: 40,
                          height: 40,
                          borderRadius: '50%',
                          bgcolor: 'warning.main',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          mr: 2,
                        }}
                      >
                        {strategy.num}
                      </Box>
                      <Typography variant="h6" sx={{ fontWeight: 600 }}>{strategy.title}</Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary">{strategy.desc}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Weekly Schedule */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 6 }}>
            Ideal Weekly Study Schedule
          </Typography>
          <Grid container spacing={2}>
            {weeklySchedule.map((day, index) => (
              <Grid item xs={12} sm={6} md key={index}>
                <Card sx={{ height: '100%', textAlign: 'center' }}>
                  <CardContent sx={{ p: 2 }}>
                    <Typography variant="h6" color="primary" sx={{ fontWeight: 600 }}>{day.day}</Typography>
                    <Divider sx={{ my: 1 }} />
                    <Typography variant="body2" sx={{ mb: 1 }}>{day.focus}</Typography>
                    <Typography variant="caption" color="text.secondary">{day.hours} hours</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
          <Box sx={{ textAlign: 'center', mt: 4 }}>
            <Typography variant="h6" color="primary">
              Total: 28+ hours/week of focused study
            </Typography>
          </Box>
        </Container>
      </Box>

      {/* Topper Tips */}
      <Box sx={{ py: { xs: 6, md: 10 } }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 6 }}>
            Tips from NATA Toppers
          </Typography>
          <Grid container spacing={4}>
            {topperTips.map((topper, index) => (
              <Grid item xs={12} md={4} key={index}>
                <Card sx={{ height: '100%', borderTop: 4, borderColor: 'warning.main' }}>
                  <CardContent sx={{ p: 4 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                      <Typography variant="h6" sx={{ fontWeight: 600 }}>{topper.name}</Typography>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="body2" color="primary" sx={{ fontWeight: 600 }}>{topper.rank}</Typography>
                        <Typography variant="caption">{topper.score}</Typography>
                      </Box>
                    </Box>
                    <Typography variant="body1" sx={{ fontStyle: 'italic' }}>
                      "{topper.tip}"
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Common Mistakes */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'error.50' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 6 }}>
            Mistakes That Cost Marks
          </Typography>
          <Grid container spacing={3}>
            {[
              'Leaving drawing section incomplete due to time shortage',
              'Ignoring negative marking in MCQs',
              'Not practicing perspective drawing enough',
              'Skipping aptitude preparation thinking it\'s easy',
              'Not reading questions carefully in exam',
              'Starting preparation too late',
            ].map((mistake, index) => (
              <Grid item xs={12} sm={6} md={4} key={index}>
                <Card sx={{ height: '100%', bgcolor: 'white' }}>
                  <CardContent sx={{ p: 3 }}>
                    <Typography variant="body1" color="error">
                      ❌ {mistake}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* CTA Section */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'warning.main', textAlign: 'center' }}>
        <Container maxWidth="md">
          <Typography variant="h3" component="h2" gutterBottom sx={{ fontWeight: 700 }}>
            Ready to Score 150+ in NATA?
          </Typography>
          <Typography variant="h6" sx={{ mb: 4, opacity: 0.9 }}>
            Join Neram Classes and learn from experts who have produced 100+ top rankers
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              size="large"
              component={Link}
              href="/apply"
              sx={{ bgcolor: 'white', color: 'warning.dark' }}
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
              Book Free Demo
            </Button>
          </Box>
        </Container>
      </Box>
    </Box>
  );
}

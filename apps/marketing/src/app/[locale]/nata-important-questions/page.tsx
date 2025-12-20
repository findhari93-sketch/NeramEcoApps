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
  Divider,
  Paper,
} from '@neram/ui';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'NATA Important Questions 2025 - Sample Questions & Practice | Neram Classes',
  description: 'Practice NATA important questions with solutions. Get sample questions for Mathematics, Aptitude, and Drawing sections with detailed explanations.',
  keywords: 'NATA questions, NATA sample questions, NATA practice questions, NATA important questions 2025',
  alternates: {
    canonical: 'https://neramclasses.com/en/nata-important-questions',
  },
};

interface PageProps {
  params: { locale: string };
}

const sampleQuestions = {
  mathematics: [
    {
      question: 'If log₂(x-1) + log₂(x+1) = 3, find the value of x.',
      options: ['3', '4', '5', '6'],
      answer: 'A (x = 3)',
      topic: 'Logarithms',
    },
    {
      question: 'The angle between the lines 2x + 3y = 5 and 3x - 2y = 7 is:',
      options: ['30°', '45°', '60°', '90°'],
      answer: 'D (90° - perpendicular lines)',
      topic: 'Coordinate Geometry',
    },
    {
      question: 'If A is a 3×3 matrix such that |A| = 5, then |adj(A)| equals:',
      options: ['5', '25', '125', '15'],
      answer: 'B (25)',
      topic: 'Matrices',
    },
  ],
  aptitude: [
    {
      question: 'Looking at a photograph, Rajesh said, "He is the son of my father\'s only daughter." How is the person in photo related to Rajesh?',
      options: ['Son', 'Nephew', 'Brother', 'Father'],
      answer: 'B (Nephew)',
      topic: 'Blood Relations',
    },
    {
      question: 'If PENCIL is coded as RGPEKN, how is ERASER coded?',
      options: ['GTCUGT', 'GTCUFS', 'GTDVGT', 'GTDVFS'],
      answer: 'A (GTCUGT)',
      topic: 'Coding-Decoding',
    },
    {
      question: 'A cube is painted red on all faces. If it is cut into 64 smaller cubes, how many will have exactly 2 faces painted?',
      options: ['24', '32', '16', '20'],
      answer: 'A (24)',
      topic: 'Spatial Reasoning',
    },
  ],
  drawing: [
    {
      question: 'Draw a perspective view of a staircase going up from the viewer.',
      type: 'Perspective Drawing',
      tips: 'Show vanishing point, use proper proportion, add handrails',
    },
    {
      question: 'Design a bus stop shelter for a smart city. Include plan and elevation.',
      type: 'Design Problem',
      tips: 'Consider sustainability, technology integration, user comfort',
    },
    {
      question: 'Sketch a scene showing "Harmony between Nature and Architecture".',
      type: 'Imaginative Composition',
      tips: 'Balance natural and built elements, show scale, add details',
    },
  ],
};

const topicDistribution = [
  { topic: 'Coordinate Geometry', questions: '8-10', priority: 'High' },
  { topic: 'Matrices & Determinants', questions: '4-6', priority: 'High' },
  { topic: 'Logical Reasoning', questions: '15-20', priority: 'High' },
  { topic: 'Spatial Visualization', questions: '10-12', priority: 'High' },
  { topic: 'Trigonometry', questions: '5-7', priority: 'Medium' },
  { topic: 'Calculus', questions: '4-6', priority: 'Medium' },
  { topic: 'Architectural Awareness', questions: '8-10', priority: 'Medium' },
  { topic: 'Perspective Drawing', questions: '1', priority: 'High' },
];

export default function NataImportantQuestionsPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);

  return (
    <Box>
      {/* Hero Section */}
      <Box
        sx={{
          py: { xs: 6, md: 10 },
          background: 'linear-gradient(135deg, #e65100 0%, #bf360c 100%)',
          color: 'white',
        }}
      >
        <Container maxWidth="lg">
          <Typography variant="h1" component="h1" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '2rem', md: '3rem' } }}>
            NATA Important Questions 2025
          </Typography>
          <Typography variant="h5" sx={{ mb: 3, opacity: 0.9 }}>
            Practice with the most important and frequently asked questions
          </Typography>
          <Button
            variant="contained"
            component={Link}
            href="/apply"
            sx={{ bgcolor: 'white', color: 'warning.dark' }}
          >
            Get Full Question Bank
          </Button>
        </Container>
      </Box>

      {/* Topic Distribution */}
      <Box sx={{ py: { xs: 4, md: 6 }, bgcolor: 'grey.50' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 4 }}>
            Expected Question Distribution
          </Typography>
          <Grid container spacing={2}>
            {topicDistribution.map((item, index) => (
              <Grid item xs={6} sm={4} md={3} key={index}>
                <Paper sx={{ p: 2, textAlign: 'center', height: '100%' }}>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>{item.topic}</Typography>
                  <Typography variant="body2" color="text.secondary">{item.questions} questions</Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: item.priority === 'High' ? 'error.main' : 'warning.main',
                      fontWeight: 600,
                    }}
                  >
                    {item.priority} Priority
                  </Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Mathematics Questions */}
      <Box sx={{ py: { xs: 6, md: 10 } }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" gutterBottom sx={{ fontWeight: 700, mb: 4 }}>
            📐 Mathematics Sample Questions
          </Typography>
          <Grid container spacing={3}>
            {sampleQuestions.mathematics.map((q, index) => (
              <Grid item xs={12} md={6} lg={4} key={index}>
                <Card sx={{ height: '100%' }}>
                  <CardContent sx={{ p: 3 }}>
                    <Typography variant="caption" color="primary" sx={{ fontWeight: 600 }}>
                      {q.topic}
                    </Typography>
                    <Typography variant="body1" sx={{ my: 2, fontWeight: 500 }}>
                      Q{index + 1}: {q.question}
                    </Typography>
                    <Box sx={{ mb: 2 }}>
                      {q.options.map((opt, idx) => (
                        <Typography key={idx} variant="body2" sx={{ mb: 0.5 }}>
                          {String.fromCharCode(65 + idx)}. {opt}
                        </Typography>
                      ))}
                    </Box>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="body2" color="success.main" sx={{ fontWeight: 600 }}>
                      Answer: {q.answer}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Aptitude Questions */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" gutterBottom sx={{ fontWeight: 700, mb: 4 }}>
            🧠 General Aptitude Sample Questions
          </Typography>
          <Grid container spacing={3}>
            {sampleQuestions.aptitude.map((q, index) => (
              <Grid item xs={12} md={6} lg={4} key={index}>
                <Card sx={{ height: '100%' }}>
                  <CardContent sx={{ p: 3 }}>
                    <Typography variant="caption" color="secondary" sx={{ fontWeight: 600 }}>
                      {q.topic}
                    </Typography>
                    <Typography variant="body1" sx={{ my: 2, fontWeight: 500 }}>
                      Q{index + 1}: {q.question}
                    </Typography>
                    <Box sx={{ mb: 2 }}>
                      {q.options.map((opt, idx) => (
                        <Typography key={idx} variant="body2" sx={{ mb: 0.5 }}>
                          {String.fromCharCode(65 + idx)}. {opt}
                        </Typography>
                      ))}
                    </Box>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="body2" color="success.main" sx={{ fontWeight: 600 }}>
                      Answer: {q.answer}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Drawing Questions */}
      <Box sx={{ py: { xs: 6, md: 10 } }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" gutterBottom sx={{ fontWeight: 700, mb: 4 }}>
            ✏️ Drawing Test Sample Questions
          </Typography>
          <Grid container spacing={3}>
            {sampleQuestions.drawing.map((q, index) => (
              <Grid item xs={12} md={4} key={index}>
                <Card sx={{ height: '100%', bgcolor: 'primary.50' }}>
                  <CardContent sx={{ p: 3 }}>
                    <Typography variant="caption" color="primary" sx={{ fontWeight: 600 }}>
                      {q.type}
                    </Typography>
                    <Typography variant="h6" sx={{ my: 2 }}>
                      {q.question}
                    </Typography>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="body2" color="text.secondary">
                      <strong>Tips:</strong> {q.tips}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* CTA Section */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'warning.dark', color: 'white', textAlign: 'center' }}>
        <Container maxWidth="md">
          <Typography variant="h3" component="h2" gutterBottom sx={{ fontWeight: 700 }}>
            Want 5000+ Practice Questions?
          </Typography>
          <Typography variant="h6" sx={{ mb: 4, opacity: 0.9 }}>
            Join Neram Classes and get access to our complete question bank with solutions
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              size="large"
              component={Link}
              href="/apply"
              sx={{ bgcolor: 'white', color: 'warning.dark' }}
            >
              Get Question Bank
            </Button>
            <Button
              variant="outlined"
              size="large"
              component={Link}
              href="/previous-year-papers"
              sx={{ borderColor: 'white', color: 'white' }}
            >
              Previous Year Papers
            </Button>
          </Box>
        </Container>
      </Box>
    </Box>
  );
}

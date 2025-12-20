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
  Divider,
  Paper,
} from '@neram/ui';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'NATA Syllabus 2025 - Complete Subject-wise Syllabus | Neram Classes',
  description: 'Complete NATA 2025 syllabus with subject-wise breakdown. Learn about Mathematics, General Aptitude, and Drawing Test syllabus for NATA exam preparation.',
  keywords: 'NATA syllabus, NATA 2025 syllabus, NATA subjects, NATA exam pattern, NATA preparation',
  alternates: {
    canonical: 'https://neramclasses.com/en/nata-syllabus',
  },
};

interface PageProps {
  params: { locale: string };
}

const syllabusTopics = {
  mathematics: {
    title: 'Mathematics',
    marks: 40,
    topics: [
      { name: 'Algebra', subtopics: ['Logarithms', 'Matrices & Determinants', 'Permutations & Combinations', 'Binomial Theorem', 'AP, GP, HP'] },
      { name: 'Trigonometry', subtopics: ['Trigonometric Functions', 'Inverse Functions', 'Heights & Distances', 'Properties of Triangles'] },
      { name: 'Coordinate Geometry', subtopics: ['Straight Lines', 'Circles', 'Parabola, Ellipse, Hyperbola', 'Distance & Section Formula'] },
      { name: ' 3D Geometry', subtopics: ['Direction Cosines', 'Planes', 'Straight Lines in 3D', 'Sphere'] },
      { name: 'Calculus', subtopics: ['Limits & Continuity', 'Differentiation', 'Integration', 'Differential Equations'] },
      { name: 'Statistics & Probability', subtopics: ['Mean, Median, Mode', 'Standard Deviation', 'Probability Basics'] },
    ],
  },
  aptitude: {
    title: 'General Aptitude',
    marks: 80,
    topics: [
      { name: 'Logical Reasoning', subtopics: ['Coding-Decoding', 'Series Completion', 'Analogies', 'Blood Relations', 'Seating Arrangement'] },
      { name: 'Visual Reasoning', subtopics: ['Mirror & Water Images', 'Paper Cutting & Folding', 'Figure Completion', 'Pattern Recognition'] },
      { name: 'Numerical Ability', subtopics: ['Number Series', 'Data Interpretation', 'Percentage & Ratio', 'Time, Speed & Distance'] },
      { name: 'Spatial Reasoning', subtopics: ['2D to 3D Visualization', 'Cube & Dice Problems', 'Mental Rotation', 'Spatial Orientation'] },
      { name: 'Architectural Awareness', subtopics: ['Famous Buildings', 'Architects', 'Architectural Styles', 'Building Materials'] },
      { name: 'General Knowledge', subtopics: ['Current Affairs', 'Art & Culture', 'Environmental Awareness', 'Basic Science'] },
    ],
  },
  drawing: {
    title: 'Drawing Test',
    marks: 80,
    topics: [
      { name: 'Free Hand Drawing', subtopics: ['Sketching from Memory', 'Object Drawing', 'Perspective Drawing', 'Creative Expression'] },
      { name: 'Geometrical Drawing', subtopics: ['2D Shapes', '3D Objects', 'Plan & Elevation', 'Orthographic Projections'] },
      { name: 'Composition', subtopics: ['Balance & Proportion', 'Light & Shadow', 'Texture Rendering', 'Space Utilization'] },
      { name: 'Imagination & Creativity', subtopics: ['Abstract Concepts', 'Story-based Drawing', 'Design Thinking', 'Original Ideas'] },
    ],
  },
};

export default function NataSyllabusPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);

  return (
    <Box>
      {/* Hero Section */}
      <Box
        sx={{
          py: { xs: 6, md: 10 },
          background: 'linear-gradient(135deg, #1a237e 0%, #0d47a1 100%)',
          color: 'white',
        }}
      >
        <Container maxWidth="lg">
          <Typography variant="h1" component="h1" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '2rem', md: '3rem' } }}>
            NATA Syllabus 2025
          </Typography>
          <Typography variant="h5" sx={{ mb: 3, opacity: 0.9 }}>
            Complete subject-wise syllabus for National Aptitude Test in Architecture
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
              href="/nata-preparation-guide"
              sx={{ borderColor: 'white', color: 'white' }}
            >
              Preparation Guide
            </Button>
          </Box>
        </Container>
      </Box>

      {/* Exam Pattern Overview */}
      <Box sx={{ py: { xs: 4, md: 6 }, bgcolor: 'grey.50' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 4 }}>
            NATA 2025 Exam Pattern
          </Typography>
          <Grid container spacing={3}>
            <Grid item xs={12} md={4}>
              <Paper sx={{ p: 3, textAlign: 'center', height: '100%' }}>
                <Typography variant="h3" color="primary" sx={{ fontWeight: 700 }}>200</Typography>
                <Typography variant="h6">Total Marks</Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} md={4}>
              <Paper sx={{ p: 3, textAlign: 'center', height: '100%' }}>
                <Typography variant="h3" color="primary" sx={{ fontWeight: 700 }}>3 Hours</Typography>
                <Typography variant="h6">Duration</Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} md={4}>
              <Paper sx={{ p: 3, textAlign: 'center', height: '100%' }}>
                <Typography variant="h3" color="primary" sx={{ fontWeight: 700 }}>3 Sections</Typography>
                <Typography variant="h6">Parts</Typography>
              </Paper>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* Detailed Syllabus */}
      <Box sx={{ py: { xs: 6, md: 10 } }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 6 }}>
            Detailed Syllabus
          </Typography>

          {Object.entries(syllabusTopics).map(([key, section]) => (
            <Box key={key} sx={{ mb: 6 }}>
              <Card>
                <CardContent sx={{ p: 4 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                    <Typography variant="h4" component="h3" sx={{ fontWeight: 600 }}>
                      {section.title}
                    </Typography>
                    <Typography variant="h5" color="primary" sx={{ fontWeight: 600 }}>
                      {section.marks} Marks
                    </Typography>
                  </Box>
                  <Divider sx={{ mb: 3 }} />
                  <Grid container spacing={3}>
                    {section.topics.map((topic, index) => (
                      <Grid item xs={12} sm={6} md={4} key={index}>
                        <Box sx={{ bgcolor: 'grey.50', p: 2, borderRadius: 1, height: '100%' }}>
                          <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, color: 'primary.main' }}>
                            {topic.name}
                          </Typography>
                          <List dense>
                            {topic.subtopics.map((subtopic, idx) => (
                              <ListItem key={idx} sx={{ py: 0.25, px: 0 }}>
                                <ListItemIcon sx={{ minWidth: 20 }}>
                                  <Typography variant="body2" color="text.secondary">•</Typography>
                                </ListItemIcon>
                                <ListItemText
                                  primary={subtopic}
                                  primaryTypographyProps={{ variant: 'body2' }}
                                />
                              </ListItem>
                            ))}
                          </List>
                        </Box>
                      </Grid>
                    ))}
                  </Grid>
                </CardContent>
              </Card>
            </Box>
          ))}
        </Container>
      </Box>

      {/* Tips Section */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 6 }}>
            Preparation Tips
          </Typography>
          <Grid container spacing={4}>
            {[
              { title: 'Master Mathematics', tip: 'Focus on NCERT concepts first, then practice previous year questions. Coordinate Geometry and Calculus are high-weightage topics.' },
              { title: 'Practice Drawing Daily', tip: 'Dedicate at least 2 hours daily to sketching. Focus on perspective, proportions, and shading techniques.' },
              { title: 'Build Aptitude Skills', tip: 'Solve puzzles and logical reasoning questions regularly. Time yourself to improve speed.' },
              { title: 'Know Architecture', tip: 'Study famous buildings, architects, and architectural styles. This helps in aptitude and drawing.' },
            ].map((item, index) => (
              <Grid item xs={12} sm={6} key={index}>
                <Card sx={{ height: '100%', p: 3 }}>
                  <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>{item.title}</Typography>
                  <Typography variant="body2" color="text.secondary">{item.tip}</Typography>
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
            Start Your NATA Preparation Today
          </Typography>
          <Typography variant="h6" sx={{ mb: 4, opacity: 0.9 }}>
            Join Neram Classes for comprehensive NATA coaching with expert faculty
          </Typography>
          <Button
            variant="contained"
            size="large"
            component={Link}
            href="/apply"
            sx={{ bgcolor: 'white', color: 'primary.main' }}
          >
            Enroll Now
          </Button>
        </Container>
      </Box>
    </Box>
  );
}

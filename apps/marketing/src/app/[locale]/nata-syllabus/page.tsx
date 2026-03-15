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
import { JsonLd } from '@/components/seo/JsonLd';
import { generateFAQSchema, generateBreadcrumbSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import RelatedContent from '@/components/seo/RelatedContent';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'NATA Syllabus 2026 - Complete Subject-wise Syllabus | Neram Classes',
    description: 'Complete NATA 2026 syllabus with subject-wise breakdown. Learn about Mathematics, General Aptitude, and Drawing Test syllabus for NATA exam preparation.',
    keywords: 'NATA syllabus, NATA 2026 syllabus, NATA subjects, NATA exam pattern, NATA preparation',
    alternates: buildAlternates(locale, '/nata-syllabus'),
  };
}

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

  const baseUrl = 'https://neramclasses.com';
  const faqs = [
    {
      question: 'What subjects are covered in the NATA syllabus?',
      answer: 'The NATA syllabus covers three main sections: Mathematics (40 marks), General Aptitude (80 marks), and Drawing Test (80 marks). Mathematics includes Algebra, Trigonometry, Coordinate Geometry, 3D Geometry, Calculus, and Statistics. General Aptitude covers Logical Reasoning, Visual Reasoning, Spatial Reasoning, and Architectural Awareness.',
    },
    {
      question: 'What is the marks distribution in the NATA exam?',
      answer: 'NATA has a total of 200 marks distributed across three sections. Mathematics carries 40 marks, General Aptitude carries 80 marks, and the Drawing Test carries 80 marks. The exam duration is 3 hours, and there is no negative marking for incorrect answers.',
    },
    {
      question: 'What is the format of the NATA Drawing Test?',
      answer: 'The NATA Drawing Test is conducted on a computer-based platform where candidates must complete drawing tasks using digital tools. It includes Free Hand Drawing, Geometrical Drawing, Composition exercises, and Imagination & Creativity tasks. Candidates are assessed on their ability to sketch from memory, draw perspectives, and express creative ideas visually.',
    },
    {
      question: 'What are the major changes in the NATA 2026 syllabus?',
      answer: 'The NATA 2026 syllabus continues to follow the three-section format with increased emphasis on digital drawing skills and architectural awareness. The General Aptitude section now includes more questions on environmental awareness and sustainable architecture. Students should also prepare for updated current affairs and modern architectural concepts.',
    },
    {
      question: 'What is the eligibility criteria for NATA exam?',
      answer: 'To be eligible for NATA, candidates must have passed 10+2 or equivalent with Mathematics as a compulsory subject. They should have scored at least 50% marks in aggregate in Physics, Chemistry, and Mathematics. There is no upper age limit for appearing in NATA, and candidates can attempt the exam up to 3 times in a year.',
    },
  ];

  return (
    <>
      <JsonLd data={generateFAQSchema(faqs)} />
      <JsonLd data={generateBreadcrumbSchema([
        { name: 'Home', url: baseUrl },
        { name: 'NATA Syllabus' },
      ])} />
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
            NATA Syllabus 2026
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
            NATA 2026 Exam Pattern
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
      <RelatedContent
        heading="Continue Your NATA Preparation"
        locale={locale}
        links={[
          { title: 'NATA Coaching', description: 'Join India\'s top NATA coaching with IIT/NIT alumni faculty', href: '/coaching/nata-coaching' },
          { title: 'Best Books for NATA & JEE', description: 'Recommended study materials for NATA and JEE Paper 2', href: '/best-books-nata-jee' },
          { title: 'NATA Preparation Guide', description: 'Month-wise 6-month study plan for NATA 2026', href: '/nata-preparation-guide' },
          { title: 'JEE Paper 2 Preparation', description: 'Alternative architecture entrance via JEE', href: '/jee-paper-2-preparation' },
        ]}
      />
    </Box>
    </>
  );
}

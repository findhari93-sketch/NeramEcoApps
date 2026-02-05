'use client';

import { useTranslations } from 'next-intl';
import { Box, Container, Typography, Grid, Chip } from '@neram/ui';
import CourseCard from '@/components/CourseCard';

// Courses offered by Neram Classes
const courses = [
  {
    id: 1,
    slug: 'architecture-entrance-year-long',
    title: 'Architecture Entrance - Year Long',
    description:
      'Comprehensive NATA & JEE Paper 2 (B.Arch/B.Planning) preparation with IIT/NIT architect alumni faculty. Complete coverage of Drawing, Aptitude, and Mathematics.',
    duration: '1 Year',
    level: 'All Levels',
    category: 'Architecture Entrance',
    image: '/images/courses/architecture-year-long.jpg',
    features: [
      'NATA + JEE Paper 2',
      'IIT/NIT Alumni Faculty',
      'Drawing & Aptitude',
      'Mock Tests',
    ],
  },
  {
    id: 2,
    slug: 'architecture-entrance-crash-course',
    title: 'Architecture Entrance - Crash Course',
    description:
      'Intensive NATA & JEE Paper 2 crash course for quick preparation. Focused revision, practice tests, and exam strategies.',
    duration: '2-3 Months',
    level: 'All Levels',
    category: 'Architecture Entrance',
    image: '/images/courses/architecture-crash.jpg',
    features: [
      'NATA + JEE Paper 2',
      'Intensive Training',
      'Daily Practice',
      'Exam Strategies',
    ],
  },
  {
    id: 3,
    slug: 'revit-training',
    title: 'Revit Architecture Training',
    description:
      'Professional Autodesk Revit training for architects and designers. BIM modeling and documentation.',
    duration: '3 Months',
    level: 'Beginner to Advanced',
    category: 'Software Training',
    image: '/images/courses/revit.jpg',
    features: [
      'Hands-on Projects',
      'BIM Concepts',
      'Certified Training',
      'Job Assistance',
    ],
  },
  {
    id: 4,
    slug: 'autocad-training',
    title: 'AutoCAD Training',
    description:
      '2D and 3D AutoCAD training for architecture and design professionals.',
    duration: '2 Months',
    level: 'Beginner',
    category: 'Software Training',
    image: '/images/courses/autocad.jpg',
    features: [
      '2D Drafting',
      '3D Modeling',
      'Industry Projects',
      'Certificate',
    ],
  },
  {
    id: 5,
    slug: 'sketchup-training',
    title: 'SketchUp Training',
    description:
      'Learn SketchUp for architectural visualization and 3D modeling.',
    duration: '1 Month',
    level: 'Beginner',
    category: 'Software Training',
    image: '/images/courses/sketchup.jpg',
    features: [
      '3D Modeling',
      'Rendering',
      'Plugins',
      'Portfolio Projects',
    ],
  },
  {
    id: 6,
    slug: 'nata-self-learning-app',
    title: 'NATA Self-Learning App',
    description:
      'AI-powered NATA & JEE Paper 2 preparation app with personalized learning paths, practice tests, and progress tracking.',
    duration: 'Self-paced',
    level: 'All Levels',
    category: 'Digital Learning',
    image: '/images/courses/nata-app.jpg',
    features: [
      'AI-Powered',
      'Practice Tests',
      'Progress Tracking',
      'Mobile Access',
    ],
  },
];

// Categories for filtering
const categories = [
  'All',
  'Architecture Entrance',
  'Software Training',
  'Digital Learning',
];

export default function CoursesPage() {
  const t = useTranslations('courses');

  return (
    <Box>
      {/* Hero Section */}
      <Box
        sx={{
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          py: { xs: 6, md: 8 },
        }}
      >
        <Container maxWidth="lg">
          <Typography
            variant="h2"
            component="h1"
            gutterBottom
            sx={{ fontWeight: 700 }}
          >
            Our Courses
          </Typography>
          <Typography variant="h5" sx={{ maxWidth: '700px', opacity: 0.9 }}>
            Choose from our wide range of courses designed to help you achieve
            your academic goals
          </Typography>
        </Container>
      </Box>

      {/* Filter Section */}
      <Box sx={{ py: 4, bgcolor: 'grey.50', borderBottom: 1, borderColor: 'divider' }}>
        <Container maxWidth="lg">
          <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
            Filter by Category
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {categories.map((category) => (
              <Chip
                key={category}
                label={category}
                clickable
                color={category === 'All' ? 'primary' : 'default'}
                variant={category === 'All' ? 'filled' : 'outlined'}
              />
            ))}
          </Box>
        </Container>
      </Box>

      {/* Courses Grid */}
      <Box sx={{ py: { xs: 6, md: 10 } }}>
        <Container maxWidth="lg">
          <Grid container spacing={4}>
            {courses.map((course) => (
              <Grid item xs={12} sm={6} md={4} key={course.id}>
                <CourseCard course={course} />
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* CTA Section */}
      <Box
        sx={{
          py: { xs: 6, md: 8 },
          bgcolor: 'grey.50',
          textAlign: 'center',
        }}
      >
        <Container maxWidth="md">
          <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>
            Can't Find What You're Looking For?
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            Contact us to discuss custom courses tailored to your needs
          </Typography>
        </Container>
      </Box>
    </Box>
  );
}

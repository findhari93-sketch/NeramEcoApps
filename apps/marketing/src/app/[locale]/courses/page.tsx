'use client';

import { useTranslations } from 'next-intl';
import { Box, Container, Typography, Grid, Chip } from '@neram/ui';
import CourseCard from '@/components/CourseCard';

// Mock data for all courses
const courses = [
  {
    id: 1,
    slug: 'neet-preparation',
    title: 'NEET Preparation',
    description:
      'Comprehensive NEET coaching with experienced faculty, regular mock tests, and proven results. Coverage of Physics, Chemistry, and Biology as per latest NEET pattern.',
    duration: '1 Year',
    level: 'Advanced',
    category: 'Medical Entrance',
    image: '/images/courses/neet.jpg',
    features: [
      'Daily Practice Tests',
      'Doubt Clearing Sessions',
      'Study Material Included',
      'Previous Year Papers',
    ],
  },
  {
    id: 2,
    slug: 'jee-main-advanced',
    title: 'JEE Main & Advanced',
    description:
      'Complete JEE preparation covering Mathematics, Physics, and Chemistry with mock tests, personalized guidance, and comprehensive study material.',
    duration: '2 Years',
    level: 'Advanced',
    category: 'Engineering Entrance',
    image: '/images/courses/jee.jpg',
    features: [
      'IIT Faculty',
      'Weekly Mock Tests',
      'Problem Solving Sessions',
      'Online Test Portal',
    ],
  },
  {
    id: 3,
    slug: 'foundation-course',
    title: 'Foundation Course (8th-10th)',
    description:
      'Strong foundation in Mathematics, Science with focus on conceptual clarity and competitive exam basics. Perfect for school students.',
    duration: '1 Year',
    level: 'Beginner',
    category: 'Foundation',
    image: '/images/courses/foundation.jpg',
    features: [
      'School Board Coverage',
      'Olympiad Preparation',
      'Concept Building',
      'Interactive Classes',
    ],
  },
  {
    id: 4,
    slug: 'class-11-12-boards',
    title: 'Class 11 & 12 Boards',
    description:
      'Complete board exam preparation with focus on scoring high marks in CBSE, State Boards. Experienced teachers and comprehensive coverage.',
    duration: '2 Years',
    level: 'Intermediate',
    category: 'Board Exams',
    image: '/images/courses/boards.jpg',
    features: [
      'NCERT Focus',
      'Previous Year Papers',
      'Regular Tests',
      'Exam Strategies',
    ],
  },
  {
    id: 5,
    slug: 'nda-preparation',
    title: 'NDA Preparation',
    description:
      'National Defence Academy entrance preparation covering Mathematics, General Ability Test, and personality development for SSB interview.',
    duration: '6 Months',
    level: 'Intermediate',
    category: 'Defence Entrance',
    image: '/images/courses/nda.jpg',
    features: [
      'Physical Training',
      'SSB Interview Prep',
      'Current Affairs',
      'Mock Tests',
    ],
  },
  {
    id: 6,
    slug: 'ca-foundation',
    title: 'CA Foundation',
    description:
      'Chartered Accountancy Foundation level coaching covering Accounting, Law, Economics, and Mathematics with expert faculty.',
    duration: '4 Months',
    level: 'Beginner',
    category: 'Professional Course',
    image: '/images/courses/ca.jpg',
    features: [
      'CA Faculty',
      'Revision Classes',
      'Question Bank',
      'Online Resources',
    ],
  },
];

// Categories for filtering
const categories = [
  'All',
  'Medical Entrance',
  'Engineering Entrance',
  'Foundation',
  'Board Exams',
  'Defence Entrance',
  'Professional Course',
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

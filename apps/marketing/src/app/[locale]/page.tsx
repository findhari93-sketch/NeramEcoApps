'use client';

import { useTranslations } from 'next-intl';
import { Box, Container, Typography, Grid, Card, CardContent, Avatar } from '@neram/ui';
import Hero from '@/components/Hero';
import CourseCard from '@/components/CourseCard';

// Mock data for courses
const featuredCourses = [
  {
    id: 1,
    slug: 'neet-preparation',
    title: 'NEET Preparation',
    description: 'Comprehensive NEET coaching with experienced faculty and proven results',
    duration: '1 Year',
    level: 'Advanced',
    image: '/images/courses/neet.jpg',
  },
  {
    id: 2,
    slug: 'jee-main-advanced',
    title: 'JEE Main & Advanced',
    description: 'Complete JEE preparation with mock tests and personalized guidance',
    duration: '2 Years',
    level: 'Advanced',
    image: '/images/courses/jee.jpg',
  },
  {
    id: 3,
    slug: 'foundation-course',
    title: 'Foundation Course (8th-10th)',
    description: 'Strong foundation in Mathematics, Science and competitive exam basics',
    duration: '1 Year',
    level: 'Beginner',
    image: '/images/courses/foundation.jpg',
  },
];

// Mock data for tools
const tools = [
  {
    name: 'Attendance Tracker',
    description: 'Monitor student attendance and participation',
    icon: '📊',
  },
  {
    name: 'Progress Analytics',
    description: 'Track academic progress with detailed insights',
    icon: '📈',
  },
  {
    name: 'Practice Tests',
    description: 'Access thousands of practice questions',
    icon: '📝',
  },
];

// Mock testimonials
const testimonials = [
  {
    name: 'Rajesh Kumar',
    role: 'NEET 2024 - AIR 234',
    content:
      'Neram Classes provided excellent guidance and support throughout my preparation. The faculty is highly experienced and the study material is comprehensive.',
    avatar: '/images/avatars/student1.jpg',
  },
  {
    name: 'Priya Sharma',
    role: 'JEE Advanced 2024 - AIR 512',
    content:
      'The personalized attention and regular mock tests helped me identify my weak areas. Thanks to Neram Classes, I achieved my dream rank.',
    avatar: '/images/avatars/student2.jpg',
  },
  {
    name: 'Amit Patel',
    role: 'Parent',
    content:
      'As a parent, I am extremely satisfied with the progress my child has made. The teachers are caring and the infrastructure is excellent.',
    avatar: '/images/avatars/parent1.jpg',
  },
];

export default function HomePage() {
  const t = useTranslations('home');

  return (
    <Box>
      {/* Hero Section */}
      <Hero />

      {/* Featured Courses Section */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
        <Container maxWidth="lg">
          <Typography
            variant="h2"
            component="h2"
            align="center"
            gutterBottom
            sx={{ mb: 6, fontWeight: 700 }}
          >
            Featured Courses
          </Typography>
          <Grid container spacing={4}>
            {featuredCourses.map((course) => (
              <Grid item xs={12} sm={6} md={4} key={course.id}>
                <CourseCard course={course} />
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Tools Preview Section */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
        <Container maxWidth="lg">
          <Typography
            variant="h2"
            component="h2"
            align="center"
            gutterBottom
            sx={{ mb: 2, fontWeight: 700 }}
          >
            Learning Tools
          </Typography>
          <Typography
            variant="h6"
            align="center"
            color="text.secondary"
            sx={{ mb: 6 }}
          >
            Powerful tools to enhance your learning experience
          </Typography>
          <Grid container spacing={4}>
            {tools.map((tool, index) => (
              <Grid item xs={12} sm={6} md={4} key={index}>
                <Card
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    textAlign: 'center',
                    transition: 'transform 0.2s',
                    '&:hover': {
                      transform: 'translateY(-8px)',
                      boxShadow: 4,
                    },
                  }}
                >
                  <CardContent sx={{ flexGrow: 1, p: 4 }}>
                    <Typography variant="h2" sx={{ mb: 2 }}>
                      {tool.icon}
                    </Typography>
                    <Typography variant="h5" component="h3" gutterBottom>
                      {tool.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {tool.description}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Testimonials Section */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
        <Container maxWidth="lg">
          <Typography
            variant="h2"
            component="h2"
            align="center"
            gutterBottom
            sx={{ mb: 2, fontWeight: 700 }}
          >
            What Our Students Say
          </Typography>
          <Typography
            variant="h6"
            align="center"
            color="text.secondary"
            sx={{ mb: 6 }}
          >
            Success stories from our alumni
          </Typography>
          <Grid container spacing={4}>
            {testimonials.map((testimonial, index) => (
              <Grid item xs={12} md={4} key={index}>
                <Card
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <CardContent sx={{ flexGrow: 1, p: 4 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                      <Avatar
                        src={testimonial.avatar}
                        alt={testimonial.name}
                        sx={{ width: 56, height: 56, mr: 2 }}
                      />
                      <Box>
                        <Typography variant="h6" component="div">
                          {testimonial.name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {testimonial.role}
                        </Typography>
                      </Box>
                    </Box>
                    <Typography variant="body1" color="text.secondary">
                      "{testimonial.content}"
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* CTA Section */}
      <Box
        sx={{
          py: { xs: 6, md: 10 },
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          textAlign: 'center',
        }}
      >
        <Container maxWidth="md">
          <Typography variant="h3" component="h2" gutterBottom>
            Ready to Start Your Journey?
          </Typography>
          <Typography variant="h6" sx={{ mb: 4, opacity: 0.9 }}>
            Join thousands of successful students who chose Neram Classes
          </Typography>
        </Container>
      </Box>
    </Box>
  );
}

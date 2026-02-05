'use client';

import { useTranslations } from 'next-intl';
import { Box, Container, Typography, Grid, Card, CardContent, Avatar } from '@neram/ui';
import Hero from '@/components/Hero';
import CourseCard from '@/components/CourseCard';
import YouTubeSection from '@/components/YouTubeSection';

// Featured courses offered by Neram Classes
const featuredCourses = [
  {
    id: 1,
    slug: 'architecture-entrance-year-long',
    title: 'Architecture Entrance - Year Long',
    description: 'Comprehensive NATA & JEE Paper 2 preparation with IIT/NIT architect alumni faculty',
    duration: '1 Year',
    level: 'All Levels',
    image: '/images/courses/architecture-year-long.jpg',
  },
  {
    id: 2,
    slug: 'architecture-entrance-crash-course',
    title: 'Architecture Entrance - Crash Course',
    description: 'Intensive NATA & JEE Paper 2 crash course for quick preparation',
    duration: '2-3 Months',
    level: 'All Levels',
    image: '/images/courses/architecture-crash.jpg',
  },
  {
    id: 3,
    slug: 'revit-training',
    title: 'Revit Architecture Training',
    description: 'Professional Autodesk Revit training for architects and designers',
    duration: '3 Months',
    level: 'Beginner to Advanced',
    image: '/images/courses/revit.jpg',
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

// Student testimonials
const testimonials = [
  {
    name: 'Ananya Krishnan',
    role: 'NATA 2024 - Top Scorer',
    content:
      'Neram Classes provided excellent guidance and support throughout my NATA preparation. The IIT alumni faculty made complex concepts easy to understand.',
    avatar: '/images/avatars/student1.jpg',
  },
  {
    name: 'Vikram Reddy',
    role: 'JEE Paper 2 2024 - NIT Trichy',
    content:
      'The personalized attention and regular mock tests helped me crack JEE Paper 2. Thanks to Neram Classes, I got into NIT Trichy B.Arch.',
    avatar: '/images/avatars/student2.jpg',
  },
  {
    name: 'Meera Sundaram',
    role: 'Revit Certified Professional',
    content:
      'The Revit training at Neram Classes was industry-focused and practical. I got placed immediately after completing the course.',
    avatar: '/images/avatars/student3.jpg',
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

      {/* YouTube Section */}
      <YouTubeSection />

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

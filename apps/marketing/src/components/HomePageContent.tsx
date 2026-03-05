'use client';

import { useTranslations } from 'next-intl';
import { ThemeProvider } from '@mui/material/styles';
import { Box, Container, Typography, Grid, Card, CardContent, Avatar, Button } from '@neram/ui';
import { neramaiArchitekDarkTheme } from '@neram/ui';
import { NewHeroSection } from '@/components/hero';
import CourseCard from '@/components/CourseCard';
import YouTubeSection from '@/components/YouTubeSection';
import { AnnouncementsSection } from '@/components/marketing-content';
import SectionDivider from '@/components/SectionDivider';
import { APP_URL } from '@/lib/seo/constants';

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

// Learning tools available on the app
const tools = [
  {
    name: 'Cutoff Calculator',
    description: 'Calculate your expected NATA cutoff rank based on score',
    icon: '🧮',
    link: `${APP_URL}/tools/cutoff-calculator`,
  },
  {
    name: 'College Predictor',
    description: 'Find architecture colleges based on your expected rank',
    icon: '🎓',
    link: `${APP_URL}/tools/college-predictor`,
  },
  {
    name: 'Exam Center Locator',
    description: 'Find NATA exam centers near you',
    icon: '📍',
    link: `${APP_URL}/tools/exam-centers`,
  },
];

// Student testimonials
const testimonials = [
  {
    name: 'Ananya Krishnan',
    role: 'NATA 2024 - Top Scorer',
    content:
      'Neram Classes provided excellent guidance and support throughout my NATA preparation. The IIT alumni faculty made complex concepts easy to understand.',
    avatar: '/images/avatars/student1.svg',
  },
  {
    name: 'Vikram Reddy',
    role: 'JEE Paper 2 2024 - NIT Trichy',
    content:
      'The personalized attention and regular mock tests helped me crack JEE Paper 2. Thanks to Neram Classes, I got into NIT Trichy B.Arch.',
    avatar: '/images/avatars/student2.svg',
  },
  {
    name: 'Meera Sundaram',
    role: 'Revit Certified Professional',
    content:
      'The Revit training at Neram Classes was industry-focused and practical. I got placed immediately after completing the course.',
    avatar: '/images/avatars/student3.svg',
  },
];

export default function HomePageContent() {
  const t = useTranslations('home');

  return (
    <ThemeProvider theme={neramaiArchitekDarkTheme}>
      <Box sx={{ bgcolor: 'background.default', color: 'text.primary' }}>
        {/* Hero Section — aiArchitek Era 2026 */}
        <NewHeroSection />

        {/* ─── Featured Courses ─── */}
        <Box sx={{ py: { xs: 6, md: 10 } }}>
          <Container maxWidth="lg">
            {/* Section label */}
            <Typography
              align="center"
              sx={{
                fontFamily: '"Space Mono", monospace',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.2em',
                color: 'primary.main',
                mb: 1.5,
              }}
            >
              OUR PROGRAMS
            </Typography>
            <Typography
              variant="h2"
              component="h2"
              align="center"
              sx={{ mb: 2, fontWeight: 700 }}
            >
              Featured Courses
            </Typography>
            <Typography
              variant="body1"
              align="center"
              color="text.secondary"
              sx={{ mb: 6, maxWidth: 560, mx: 'auto' }}
            >
              Expert-led programs designed to get you into India&apos;s top architecture colleges
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

        <SectionDivider />

        {/* ─── Announcements & Updates ─── */}
        <AnnouncementsSection />

        <SectionDivider />

        {/* ─── Learning Tools ─── */}
        <Box
          sx={{
            py: { xs: 6, md: 10 },
            position: 'relative',
            '&::before': {
              content: '""',
              position: 'absolute',
              inset: 0,
              background:
                'radial-gradient(ellipse at 70% 20%, rgba(26,143,255,0.06) 0%, transparent 60%)',
              pointerEvents: 'none',
            },
          }}
        >
          <Container maxWidth="lg" sx={{ position: 'relative' }}>
            <Typography
              align="center"
              sx={{
                fontFamily: '"Space Mono", monospace',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.2em',
                color: 'secondary.main',
                mb: 1.5,
              }}
            >
              FREE TOOLS
            </Typography>
            <Typography
              variant="h2"
              component="h2"
              align="center"
              sx={{ mb: 2, fontWeight: 700 }}
            >
              Learning Tools
            </Typography>
            <Typography
              variant="body1"
              align="center"
              color="text.secondary"
              sx={{ mb: 6, maxWidth: 520, mx: 'auto' }}
            >
              Powerful tools to enhance your learning experience
            </Typography>
            <Grid container spacing={4}>
              {tools.map((tool, index) => (
                <Grid item xs={12} sm={6} md={4} key={index}>
                  <Card
                    component="a"
                    href={tool.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      textAlign: 'center',
                      textDecoration: 'none',
                      bgcolor: 'rgba(11,22,41,0.75)',
                      backdropFilter: 'blur(12px)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                      '&:hover': {
                        transform: 'translateY(-8px)',
                        boxShadow: '0 12px 40px rgba(26,143,255,0.15)',
                        borderColor: 'rgba(26,143,255,0.25)',
                      },
                    }}
                  >
                    <CardContent sx={{ flexGrow: 1, p: 4 }}>
                      {/* Icon with glow */}
                      <Box
                        sx={{
                          width: 72,
                          height: 72,
                          mx: 'auto',
                          mb: 2.5,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '50%',
                          background:
                            'radial-gradient(circle, rgba(26,143,255,0.15) 0%, transparent 70%)',
                          fontSize: '2rem',
                        }}
                      >
                        {tool.icon}
                      </Box>
                      <Typography
                        variant="h5"
                        component="h3"
                        gutterBottom
                        sx={{ color: 'text.primary' }}
                      >
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
            <Box sx={{ textAlign: 'center', mt: 5 }}>
              <Button
                variant="contained"
                size="large"
                href={APP_URL}
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  px: 4,
                  py: 1.5,
                  fontSize: '14px',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 1.25,
                  '& .arrow': { fontSize: '18px', transition: 'transform 0.3s' },
                  '&:hover .arrow': { transform: 'translateX(4px)' },
                }}
              >
                Try Our Free App
                <span className="arrow">&rarr;</span>
              </Button>
            </Box>
          </Container>
        </Box>

        <SectionDivider />

        {/* ─── Testimonials ─── */}
        <Box sx={{ py: { xs: 6, md: 10 } }}>
          <Container maxWidth="lg">
            <Typography
              align="center"
              sx={{
                fontFamily: '"Space Mono", monospace',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.2em',
                color: 'primary.main',
                mb: 1.5,
              }}
            >
              STUDENT VOICES
            </Typography>
            <Typography
              variant="h2"
              component="h2"
              align="center"
              sx={{ mb: 2, fontWeight: 700 }}
            >
              What Our Students Say
            </Typography>
            <Typography
              variant="body1"
              align="center"
              color="text.secondary"
              sx={{ mb: 6, maxWidth: 480, mx: 'auto' }}
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
                      bgcolor: 'rgba(11,22,41,0.75)',
                      backdropFilter: 'blur(12px)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderLeft: '3px solid',
                      borderLeftColor: 'primary.main',
                      position: 'relative',
                      overflow: 'visible',
                    }}
                  >
                    <CardContent sx={{ flexGrow: 1, p: { xs: 3, md: 4 } }}>
                      {/* Decorative quote */}
                      <Typography
                        sx={{
                          position: 'absolute',
                          top: -8,
                          right: 20,
                          fontSize: '4rem',
                          fontFamily: '"Cormorant Garamond", serif',
                          color: 'primary.main',
                          opacity: 0.2,
                          lineHeight: 1,
                          pointerEvents: 'none',
                        }}
                      >
                        &ldquo;
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                        <Avatar
                          src={testimonial.avatar}
                          alt={testimonial.name}
                          sx={{
                            width: 56,
                            height: 56,
                            mr: 2,
                            border: '2px solid',
                            borderColor: 'primary.main',
                          }}
                        />
                        <Box>
                          <Typography
                            variant="h6"
                            component="div"
                            sx={{ color: 'text.primary' }}
                          >
                            {testimonial.name}
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{ color: 'primary.main', fontWeight: 500 }}
                          >
                            {testimonial.role}
                          </Typography>
                        </Box>
                      </Box>
                      <Typography
                        variant="body1"
                        sx={{ color: 'text.secondary', fontStyle: 'italic' }}
                      >
                        &ldquo;{testimonial.content}&rdquo;
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        <SectionDivider />

        {/* ─── YouTube Section ─── */}
        <YouTubeSection />

        <SectionDivider />

        {/* ─── CTA Section ─── */}
        <Box
          sx={{
            py: { xs: 8, md: 12 },
            textAlign: 'center',
            position: 'relative',
            overflow: 'hidden',
            '&::before': {
              content: '""',
              position: 'absolute',
              inset: 0,
              background:
                'radial-gradient(ellipse at 50% 50%, rgba(232,160,32,0.08) 0%, transparent 60%)',
              pointerEvents: 'none',
            },
            borderTop: '1px solid rgba(232,160,32,0.1)',
          }}
        >
          <Container maxWidth="md" sx={{ position: 'relative' }}>
            <Typography
              sx={{
                fontFamily: '"Space Mono", monospace',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.2em',
                color: 'primary.main',
                mb: 2,
              }}
            >
              GET STARTED
            </Typography>
            <Typography variant="h2" component="h2" sx={{ mb: 2, fontWeight: 700 }}>
              Ready to Start Your Journey?
            </Typography>
            <Typography
              variant="h6"
              sx={{ mb: 5, color: 'text.secondary', maxWidth: 520, mx: 'auto' }}
            >
              Join thousands of successful students who chose Neram Classes
            </Typography>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                flexWrap: 'wrap',
              }}
            >
              <Button
                variant="contained"
                size="large"
                href="/apply"
                sx={{
                  px: 4,
                  py: 1.75,
                  fontSize: '14px',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 1.25,
                  '& .arrow': { fontSize: '18px', transition: 'transform 0.3s' },
                  '&:hover .arrow': { transform: 'translateX(4px)' },
                }}
              >
                Apply Now
                <span className="arrow">&rarr;</span>
              </Button>
              <Button
                variant="text"
                size="large"
                href={`${APP_URL}/tools`}
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  color: 'text.primary',
                  px: 0.5,
                  py: 1.75,
                  borderBottom: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 0,
                  '&:hover': {
                    color: 'primary.main',
                    borderBottomColor: 'primary.main',
                    bgcolor: 'transparent',
                  },
                }}
              >
                Explore Free Tools &nearr;
              </Button>
            </Box>
          </Container>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

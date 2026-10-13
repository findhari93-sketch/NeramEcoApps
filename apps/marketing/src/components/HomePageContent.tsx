'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { ThemeProvider } from '@mui/material/styles';
import { Box, Container, Typography, Grid, Card, CardContent, Button } from '@neram/ui';
import { neramaiArchitekDarkTheme } from '@neram/ui';
import { NewHeroSection } from '@/components/hero';
import CourseCard from '@/components/CourseCard';
import SectionDivider from '@/components/SectionDivider';
import NorthEastIcon from '@mui/icons-material/NorthEast';
import { APP_URL } from '@/lib/seo/constants';
import type { Testimonial } from '@/components/ui/testimonials-columns';
import type { AskSeniorsEvent, AskSeniorsCollege } from '@neram/database';

// Lazy-load below-fold components to reduce initial JS bundle
const YouTubeSection = dynamic(() => import('@/components/YouTubeSection'), { ssr: false });
const AskSeniorsSection = dynamic(
  () => import('./ask-seniors/AskSeniorsSection'),
  { ssr: false }
);
const AnnouncementsSection = dynamic(
  () => import('@/components/marketing-content').then((mod) => ({ default: mod.AnnouncementsSection })),
  { ssr: false }
);
const SocialProofSection = dynamic(
  () => import('@/components/social-proof').then((mod) => ({ default: mod.SocialProofSection })),
  { ssr: false }
);
const TestimonialsColumn = dynamic(
  () => import('@/components/ui/testimonials-columns').then((mod) => ({ default: mod.TestimonialsColumn })),
  { ssr: false }
);
const StudentResultsTeaser = dynamic(
  () => import('@/components/achievements/StudentResultsTeaser'),
  { ssr: false }
);

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
    image: '/images/courses/architecture-crash.svg',
  },
  {
    id: 3,
    slug: 'revit-training',
    title: 'Revit Architecture Training',
    description: 'Professional Autodesk Revit training for architects and designers',
    duration: '3 Months',
    level: 'Beginner to Advanced',
    image: '/images/courses/revit.svg',
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

/** Map DB testimonial format to the component's expected shape. */
function mapDbTestimonial(t: {
  content: Record<string, string>;
  student_photo: string | null;
  student_name: string;
  exam_type: string;
  year: number;
  college_admitted: string | null;
  city: string;
}): Testimonial {
  return {
    text: t.content?.en || t.content?.ta || Object.values(t.content || {})[0] || '',
    image: t.student_photo || '/images/placeholder-avatar.svg',
    name: t.student_name,
    role: `${t.exam_type.replace(/_/g, ' ')} ${t.year} - ${t.college_admitted || t.city}`,
  };
}

interface HomePageContentProps {
  askSeniorsEvent?: AskSeniorsEvent | null;
  askSeniorsColleges?: AskSeniorsCollege[];
}

export default function HomePageContent({ askSeniorsEvent, askSeniorsColleges }: HomePageContentProps) {
  const t = useTranslations('home');

  // Real reviews only. No placeholder people while it loads: the section stays
  // hidden until there is something true to show.
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/testimonials?homepage=true')
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled && json.success && Array.isArray(json.data) && json.data.length > 0) {
          setTestimonials(json.data.map(mapDbTestimonial));
        }
      })
      .catch(() => {
        // No reviews to show; the section stays hidden.
      });
    return () => { cancelled = true; };
  }, []);

  const firstColumn = testimonials.slice(0, Math.ceil(testimonials.length / 3));
  const secondColumn = testimonials.slice(
    Math.ceil(testimonials.length / 3),
    Math.ceil((testimonials.length * 2) / 3)
  );
  const thirdColumn = testimonials.slice(Math.ceil((testimonials.length * 2) / 3));

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
                fontFamily: '"SFMono-Regular", "Cascadia Code", "Consolas", monospace',
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
                fontFamily: '"SFMono-Regular", "Cascadia Code", "Consolas", monospace',
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

        {/* ─── Testimonials (only when real reviews loaded) ─── */}
        {testimonials.length > 0 && (
        <Box sx={{ py: { xs: 6, md: 10 }, position: 'relative' }}>
          <Container maxWidth="lg">
            <Typography
              align="center"
              sx={{
                fontFamily: '"SFMono-Regular", "Cascadia Code", "Consolas", monospace',
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

            <div
              className="flex justify-center gap-6"
              style={{
                maskImage:
                  'linear-gradient(to bottom, transparent, black 25%, black 75%, transparent)',
                WebkitMaskImage:
                  'linear-gradient(to bottom, transparent, black 25%, black 75%, transparent)',
                maxHeight: 740,
                overflow: 'hidden',
              }}
            >
              <TestimonialsColumn testimonials={firstColumn} duration={15} />
              <TestimonialsColumn
                testimonials={secondColumn}
                className="hidden md:block"
                duration={19}
              />
              <TestimonialsColumn
                testimonials={thirdColumn}
                className="hidden lg:block"
                duration={17}
              />
            </div>
          </Container>
        </Box>
        )}

        {testimonials.length > 0 && <SectionDivider />}

        {/* ─── Student Results Showcase ─── */}
        <StudentResultsTeaser />

        <SectionDivider />

        {/* ─── Ask Seniors (live event teaser, shown only when active) ─── */}
        {askSeniorsEvent && askSeniorsColleges && askSeniorsColleges.length > 0 && (
          <>
            <AskSeniorsSection event={askSeniorsEvent} colleges={askSeniorsColleges} />
            <SectionDivider />
          </>
        )}

        {/* ─── Social Proof (Audio, Video, Screenshots) ─── */}
        <SocialProofSection />

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
                fontFamily: '"SFMono-Regular", "Cascadia Code", "Consolas", monospace',
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
              component="p"
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
                endIcon={<NorthEastIcon fontSize="small" aria-hidden />}
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
                Explore Free Tools
              </Button>
            </Box>
          </Container>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

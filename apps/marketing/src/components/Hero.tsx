'use client';

import { useParams } from 'next/navigation';
import { Box, Container, Typography, Button, Grid } from '@neram/ui';
import { Link } from '@neram/ui';
import { type Locale } from '@/i18n';

export default function Hero() {
  const params = useParams();
  const locale = params.locale as Locale;

  return (
    <Box
      sx={{
        bgcolor: 'primary.main',
        color: 'primary.contrastText',
        py: { xs: 8, md: 12 },
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background Pattern (Optional) */}
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          opacity: 0.1,
          background: `
            linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.1) 30%, rgba(255,255,255,0.1) 70%, transparent 70%),
            linear-gradient(-45deg, transparent 30%, rgba(255,255,255,0.1) 30%, rgba(255,255,255,0.1) 70%, transparent 70%)
          `,
          backgroundSize: '60px 60px',
        }}
      />

      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
        <Grid container spacing={4} alignItems="center">
          <Grid item xs={12} md={7}>
            <Typography
              variant="h1"
              component="h1"
              gutterBottom
              sx={{
                fontWeight: 800,
                fontSize: { xs: '2.5rem', sm: '3.5rem', md: '4rem' },
                lineHeight: 1.2,
                mb: 3,
              }}
            >
              Transform Your Future with Quality Education
            </Typography>
            <Typography
              variant="h5"
              component="p"
              sx={{
                mb: 4,
                opacity: 0.95,
                fontWeight: 400,
                lineHeight: 1.6,
              }}
            >
              Join Neram Classes for expert coaching in NATA, JEE Paper 2, and Architecture
              entrance exams. Excellence in education since 2009.
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                size="large"
                component={Link}
                href={`/${locale}/apply`}
                sx={{
                  bgcolor: 'background.paper',
                  color: 'primary.main',
                  px: 4,
                  py: 1.5,
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  '&:hover': {
                    bgcolor: 'grey.100',
                  },
                }}
              >
                Apply Now
              </Button>
              <Button
                variant="outlined"
                size="large"
                component={Link}
                href={`/${locale}/courses`}
                sx={{
                  borderColor: 'primary.contrastText',
                  color: 'primary.contrastText',
                  px: 4,
                  py: 1.5,
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  '&:hover': {
                    borderColor: 'primary.contrastText',
                    bgcolor: 'rgba(255, 255, 255, 0.1)',
                  },
                }}
              >
                Explore Courses
              </Button>
            </Box>

            {/* Stats */}
            <Box
              sx={{
                display: 'flex',
                gap: { xs: 3, md: 6 },
                mt: 6,
                flexWrap: 'wrap',
              }}
            >
              <Box>
                <Typography variant="h3" sx={{ fontWeight: 700, mb: 0.5 }}>
                  15+
                </Typography>
                <Typography variant="body1" sx={{ opacity: 0.9 }}>
                  Years of Excellence
                </Typography>
              </Box>
              <Box>
                <Typography variant="h3" sx={{ fontWeight: 700, mb: 0.5 }}>
                  10,000+
                </Typography>
                <Typography variant="body1" sx={{ opacity: 0.9 }}>
                  Students Enrolled
                </Typography>
              </Box>
              <Box>
                <Typography variant="h3" sx={{ fontWeight: 700, mb: 0.5 }}>
                  95%
                </Typography>
                <Typography variant="body1" sx={{ opacity: 0.9 }}>
                  Success Rate
                </Typography>
              </Box>
            </Box>
          </Grid>

          {/* Image/Illustration Section */}
          <Grid item xs={12} md={5}>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100%',
                minHeight: { xs: 250, md: 400 },
              }}
            >
              <Box
                sx={{
                  width: '100%',
                  height: '100%',
                  bgcolor: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                }}
              >
                <Typography variant="h4" sx={{ opacity: 0.5 }}>
                  Hero Image/Illustration
                </Typography>
              </Box>
            </Box>
          </Grid>
        </Grid>
      </Container>

      {/* Wave Effect at Bottom (Optional) */}
      <Box
        sx={{
          position: 'absolute',
          bottom: -1,
          left: 0,
          right: 0,
          height: '100px',
          background: 'background.default',
          clipPath: 'polygon(0 50%, 100% 0, 100% 100%, 0 100%)',
        }}
      />
    </Box>
  );
}

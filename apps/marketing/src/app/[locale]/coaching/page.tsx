'use client';

import {
  Box,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@neram/ui';
import Link from 'next/link';

const coachingPrograms = [
  {
    id: 'architecture-year-long',
    title: 'Architecture Entrance - Year Long',
    subtitle: 'NATA + JEE Paper 2 (B.Arch/B.Planning)',
    description: 'Comprehensive year-long preparation for NATA and JEE Paper 2 with IIT/NIT architect alumni faculty.',
    features: [
      'Drawing & Sketching Masterclass',
      'Mathematics & Logical Reasoning',
      'General Aptitude Training',
      '500+ Practice Questions',
      'Weekly Mock Tests',
      'Personal Mentoring',
    ],
    duration: '1 Year',
    mode: ['Online', 'Offline'],
    slug: 'architecture-entrance-year-long',
    highlight: true,
  },
  {
    id: 'architecture-crash',
    title: 'Architecture Entrance - Crash Course',
    subtitle: 'NATA + JEE Paper 2 Intensive',
    description: 'Intensive crash course for NATA and JEE Paper 2. Perfect for quick revision and last-minute preparation.',
    features: [
      'Focused Revision',
      'Daily Practice Sessions',
      'Exam Strategies',
      'Previous Year Analysis',
      'Mock Tests',
      'Doubt Clearing Sessions',
    ],
    duration: '2-3 Months',
    mode: ['Online', 'Offline'],
    slug: 'architecture-entrance-crash-course',
    highlight: true,
  },
  {
    id: 'revit',
    title: 'Revit Architecture Training',
    subtitle: 'Professional BIM Software',
    description: 'Industry-focused Autodesk Revit training for architects and designers. Learn BIM modeling and documentation.',
    features: [
      'BIM Fundamentals',
      'Architectural Modeling',
      'Documentation & Sheets',
      'Rendering & Visualization',
      'Industry Projects',
      'Job Assistance',
    ],
    duration: '3 Months',
    mode: ['Online', 'Offline'],
    slug: 'revit-training',
    highlight: false,
  },
  {
    id: 'autocad',
    title: 'AutoCAD Training',
    subtitle: '2D & 3D Drafting',
    description: 'Complete AutoCAD training covering 2D drafting and 3D modeling for architecture professionals.',
    features: [
      '2D Drafting Basics',
      '3D Modeling',
      'Layouts & Plotting',
      'Industry Standards',
      'Real Projects',
      'Certificate',
    ],
    duration: '2 Months',
    mode: ['Online', 'Offline'],
    slug: 'autocad-training',
    highlight: false,
  },
];

const stats = [
  { value: '10,000+', label: 'Students Trained' },
  { value: '95%', label: 'Success Rate' },
  { value: '500+', label: 'Top Rank Holders' },
  { value: '15+', label: 'Years Experience' },
];

export default function CoachingPage() {
  return (
    <Box>
      {/* Hero Section */}
      <Box
        sx={{
          py: { xs: 8, md: 12 },
          background: 'linear-gradient(135deg, #1a237e 0%, #0d47a1 100%)',
          color: 'white',
        }}
      >
        <Container maxWidth="lg">
          <Grid container spacing={4} alignItems="center">
            <Grid item xs={12} md={7}>
              <Typography variant="h1" component="h1" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '2.5rem', md: '3.5rem' } }}>
                Transform Your Future with Expert Coaching
              </Typography>
              <Typography variant="h5" sx={{ mb: 4, opacity: 0.9 }}>
                Join India's premier coaching institute for NATA, JEE Paper 2, and Architecture entrance exams.
                Learn from IIT/NIT architect alumni, achieve the best.
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Button
                  variant="contained"
                  size="large"
                  component={Link}
                  href="/apply"
                  sx={{ bgcolor: 'white', color: 'primary.main', '&:hover': { bgcolor: 'grey.100' } }}
                >
                  Apply Now
                </Button>
                <Button
                  variant="outlined"
                  size="large"
                  component={Link}
                  href="/contact"
                  sx={{ borderColor: 'white', color: 'white', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}
                >
                  Book Free Counseling
                </Button>
              </Box>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* Stats Section */}
      <Box sx={{ py: 6, bgcolor: 'grey.100' }}>
        <Container maxWidth="lg">
          <Grid container spacing={4}>
            {stats.map((stat, index) => (
              <Grid item xs={6} md={3} key={index}>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h3" component="div" sx={{ fontWeight: 700, color: 'primary.main' }}>
                    {stat.value}
                  </Typography>
                  <Typography variant="body1" color="text.secondary">
                    {stat.label}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Coaching Programs Section */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 2, fontWeight: 700 }}>
            Our Coaching Programs
          </Typography>
          <Typography variant="h6" align="center" color="text.secondary" sx={{ mb: 6 }}>
            Specialized programs designed to help you achieve your academic goals
          </Typography>

          <Grid container spacing={4}>
            {coachingPrograms.map((program) => (
              <Grid item xs={12} md={6} key={program.id}>
                <Card
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    border: program.highlight ? '2px solid' : '1px solid',
                    borderColor: program.highlight ? 'primary.main' : 'divider',
                    position: 'relative',
                  }}
                >
                  {program.highlight && (
                    <Chip
                      label="Most Popular"
                      color="primary"
                      size="small"
                      sx={{ position: 'absolute', top: 16, right: 16 }}
                    />
                  )}
                  <CardContent sx={{ flexGrow: 1, p: 4 }}>
                    <Typography variant="h4" component="h3" gutterBottom sx={{ fontWeight: 600 }}>
                      {program.title}
                    </Typography>
                    <Typography variant="subtitle1" color="primary" gutterBottom>
                      {program.subtitle}
                    </Typography>
                    <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                      {program.description}
                    </Typography>

                    <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
                      <Chip label={program.duration} size="small" variant="outlined" />
                      {program.mode.map((m) => (
                        <Chip key={m} label={m} size="small" variant="outlined" color="primary" />
                      ))}
                    </Box>

                    <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600 }}>
                      What you'll learn:
                    </Typography>
                    <List dense>
                      {program.features.slice(0, 4).map((feature, idx) => (
                        <ListItem key={idx} sx={{ py: 0.5 }}>
                          <ListItemIcon sx={{ minWidth: 32 }}>
                            <Typography color="primary">✓</Typography>
                          </ListItemIcon>
                          <ListItemText primary={feature} />
                        </ListItem>
                      ))}
                    </List>

                    <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
                      <Button
                        variant="contained"
                        component={Link}
                        href={`/courses/${program.slug}`}
                        fullWidth
                      >
                        Learn More
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Why Choose Us Section */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 6, fontWeight: 700 }}>
            Why Choose Neram Classes?
          </Typography>
          <Grid container spacing={4}>
            {[
              { icon: '👨‍🏫', title: 'Expert Faculty', desc: 'Learn from IIT/NIT alumni and industry experts with 10+ years of teaching experience.' },
              { icon: '📚', title: 'Comprehensive Material', desc: 'Well-researched study material covering entire syllabus with practice questions.' },
              { icon: '🎯', title: 'Result Oriented', desc: 'Proven track record with thousands of successful students every year.' },
              { icon: '💡', title: 'Personal Attention', desc: 'Small batch sizes ensuring individual attention and doubt resolution.' },
              { icon: '🖥️', title: 'Online & Offline', desc: 'Flexible learning options - attend classes from anywhere or visit our centers.' },
              { icon: '📊', title: 'Regular Assessment', desc: 'Weekly tests and mock exams to track progress and identify improvement areas.' },
            ].map((item, index) => (
              <Grid item xs={12} sm={6} md={4} key={index}>
                <Card sx={{ height: '100%', textAlign: 'center', p: 3 }}>
                  <Typography variant="h2" sx={{ mb: 2 }}>{item.icon}</Typography>
                  <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>{item.title}</Typography>
                  <Typography variant="body2" color="text.secondary">{item.desc}</Typography>
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
          <Typography variant="h3" component="h2" gutterBottom sx={{ fontWeight: 700 }}>
            Ready to Start Your Preparation?
          </Typography>
          <Typography variant="h6" sx={{ mb: 4, opacity: 0.9 }}>
            Join Neram Classes today and take the first step towards your dream career.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              size="large"
              component={Link}
              href="/apply"
              sx={{ bgcolor: 'white', color: 'primary.main', '&:hover': { bgcolor: 'grey.100' } }}
            >
              Apply Now
            </Button>
            <Button
              variant="outlined"
              size="large"
              component={Link}
              href="/contact"
              sx={{ borderColor: 'white', color: 'white' }}
            >
              Contact Us
            </Button>
          </Box>
        </Container>
      </Box>
    </Box>
  );
}

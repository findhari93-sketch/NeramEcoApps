'use client';

import { useTranslations } from 'next-intl';
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

const openPositions = [
  {
    title: 'NATA/JEE Faculty - Mathematics',
    department: 'Academics',
    location: 'Chennai / Remote',
    type: 'Full-time',
    experience: '3+ years',
    description: 'Looking for experienced mathematics faculty to teach aptitude and mathematics for NATA/JEE Paper 2 aspirants.',
    requirements: [
      'B.Tech/M.Tech or M.Sc in Mathematics',
      'Experience in coaching for entrance exams',
      'Strong communication skills',
      'Ability to simplify complex concepts',
    ],
  },
  {
    title: 'Drawing & Sketching Instructor',
    department: 'Academics',
    location: 'Chennai',
    type: 'Full-time',
    experience: '2+ years',
    description: 'Seeking creative drawing instructors to train students in architectural sketching and perspective drawing.',
    requirements: [
      'B.Arch or Fine Arts degree',
      'Portfolio of architectural sketches',
      'Teaching experience preferred',
      'Patient and encouraging approach',
    ],
  },
  {
    title: 'Academic Counselor',
    department: 'Student Success',
    location: 'Chennai / Coimbatore',
    type: 'Full-time',
    experience: '1+ years',
    description: 'Guide students and parents through the admission process, course selection, and career planning.',
    requirements: [
      "Bachelor's degree in any field",
      'Excellent communication skills',
      'Knowledge of architecture entrance exams',
      'Empathetic and patient demeanor',
    ],
  },
  {
    title: 'Content Developer - Architecture',
    department: 'Content',
    location: 'Remote',
    type: 'Full-time / Contract',
    experience: '2+ years',
    description: 'Create engaging study materials, practice questions, and video content for architecture entrance preparation.',
    requirements: [
      'B.Arch degree preferred',
      'Excellent writing skills',
      'Experience in content creation',
      'Familiarity with exam patterns',
    ],
  },
  {
    title: 'Full Stack Developer',
    department: 'Technology',
    location: 'Chennai / Remote',
    type: 'Full-time',
    experience: '2+ years',
    description: 'Build and maintain our learning management system, student portal, and internal tools.',
    requirements: [
      'Experience with React, Next.js, Node.js',
      'Database design skills',
      'API development experience',
      'Understanding of EdTech platforms',
    ],
  },
  {
    title: 'Marketing Executive',
    department: 'Marketing',
    location: 'Chennai',
    type: 'Full-time',
    experience: '1+ years',
    description: 'Drive student enrollments through digital marketing, events, and partnerships.',
    requirements: [
      "Bachelor's degree in Marketing or related field",
      'Digital marketing experience',
      'Social media management skills',
      'Creative thinking ability',
    ],
  },
];

const benefits = [
  { icon: '💰', title: 'Competitive Salary', desc: 'Industry-leading compensation packages' },
  { icon: '🏥', title: 'Health Insurance', desc: 'Comprehensive health coverage for you and family' },
  { icon: '📚', title: 'Learning Budget', desc: 'Annual allowance for courses and certifications' },
  { icon: '🏠', title: 'Flexible Work', desc: 'Work from home options available' },
  { icon: '🎯', title: 'Growth Path', desc: 'Clear career progression opportunities' },
  { icon: '🎉', title: 'Team Events', desc: 'Regular team outings and celebrations' },
];

const values = [
  { title: 'Student First', desc: 'Every decision we make prioritizes student success and learning outcomes.' },
  { title: 'Excellence', desc: 'We strive for excellence in teaching, content, and every aspect of our work.' },
  { title: 'Innovation', desc: 'We embrace new technologies and methods to enhance the learning experience.' },
  { title: 'Collaboration', desc: 'We work together as a team, supporting each other to achieve common goals.' },
];

export default function CareersPage() {
  return (
    <Box>
      {/* Hero Section */}
      <Box
        sx={{
          py: { xs: 8, md: 12 },
          background: 'linear-gradient(135deg, #7b1fa2 0%, #4a148c 100%)',
          color: 'white',
        }}
      >
        <Container maxWidth="lg">
          <Grid container spacing={4} alignItems="center">
            <Grid item xs={12} md={8}>
              <Typography variant="h1" component="h1" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '2.5rem', md: '3.5rem' } }}>
                Shape the Future of Education
              </Typography>
              <Typography variant="h5" sx={{ mb: 4, opacity: 0.9 }}>
                Join Neram Classes and help thousands of students achieve their dream of becoming architects.
                We're building the best team in education.
              </Typography>
              <Button
                variant="contained"
                size="large"
                href="#openings"
                sx={{ bgcolor: 'white', color: 'secondary.main', '&:hover': { bgcolor: 'grey.100' } }}
              >
                View Open Positions
              </Button>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* Our Values Section */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 2, fontWeight: 700 }}>
            Our Values
          </Typography>
          <Typography variant="h6" align="center" color="text.secondary" sx={{ mb: 6 }}>
            What drives us every day
          </Typography>

          <Grid container spacing={4}>
            {values.map((value, index) => (
              <Grid item xs={12} sm={6} md={3} key={index}>
                <Card sx={{ height: '100%', textAlign: 'center', p: 3 }}>
                  <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, color: 'secondary.main' }}>
                    {value.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {value.desc}
                  </Typography>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Benefits Section */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 2, fontWeight: 700 }}>
            Why Work With Us
          </Typography>
          <Typography variant="h6" align="center" color="text.secondary" sx={{ mb: 6 }}>
            We take care of our team
          </Typography>

          <Grid container spacing={3}>
            {benefits.map((benefit, index) => (
              <Grid item xs={12} sm={6} md={4} key={index}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                  <Typography variant="h3">{benefit.icon}</Typography>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                      {benefit.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {benefit.desc}
                    </Typography>
                  </Box>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Open Positions Section */}
      <Box id="openings" sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 2, fontWeight: 700 }}>
            Open Positions
          </Typography>
          <Typography variant="h6" align="center" color="text.secondary" sx={{ mb: 6 }}>
            Find your next opportunity
          </Typography>

          <Grid container spacing={4}>
            {openPositions.map((position, index) => (
              <Grid item xs={12} md={6} key={index}>
                <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <CardContent sx={{ flexGrow: 1, p: 4 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                      <Typography variant="h5" sx={{ fontWeight: 600 }}>
                        {position.title}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                      <Chip label={position.department} size="small" color="secondary" />
                      <Chip label={position.location} size="small" variant="outlined" />
                      <Chip label={position.type} size="small" variant="outlined" />
                      <Chip label={position.experience} size="small" variant="outlined" />
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                      {position.description}
                    </Typography>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                      Requirements:
                    </Typography>
                    <List dense>
                      {position.requirements.map((req, idx) => (
                        <ListItem key={idx} sx={{ py: 0.25, px: 0 }}>
                          <ListItemIcon sx={{ minWidth: 24 }}>
                            <Typography variant="body2">•</Typography>
                          </ListItemIcon>
                          <ListItemText
                            primary={req}
                            primaryTypographyProps={{ variant: 'body2' }}
                          />
                        </ListItem>
                      ))}
                    </List>
                    <Button
                      variant="outlined"
                      color="secondary"
                      fullWidth
                      sx={{ mt: 2 }}
                      href={`mailto:careers@neramclasses.com?subject=Application for ${position.title}`}
                    >
                      Apply Now
                    </Button>
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
          background: 'linear-gradient(135deg, #7b1fa2 0%, #4a148c 100%)',
          color: 'white',
          textAlign: 'center',
        }}
      >
        <Container maxWidth="md">
          <Typography variant="h3" component="h2" gutterBottom sx={{ fontWeight: 700 }}>
            Don't See a Perfect Fit?
          </Typography>
          <Typography variant="h6" sx={{ mb: 4, opacity: 0.9 }}>
            We're always looking for talented individuals. Send us your resume and we'll keep you in mind for future opportunities.
          </Typography>
          <Button
            variant="contained"
            size="large"
            href="mailto:careers@neramclasses.com"
            sx={{ bgcolor: 'white', color: 'secondary.main', '&:hover': { bgcolor: 'grey.100' } }}
          >
            Send Your Resume
          </Button>
        </Container>
      </Box>
    </Box>
  );
}

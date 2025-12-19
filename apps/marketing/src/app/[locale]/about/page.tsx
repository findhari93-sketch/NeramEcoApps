'use client';

import { useTranslations } from 'next-intl';
import { Box, Container, Typography, Grid, Card, CardContent, Avatar } from '@neram/ui';

// Mock data for team members
const teamMembers = [
  {
    name: 'Dr. Ramesh Kumar',
    role: 'Founder & Director',
    bio: 'Ph.D. in Education, 25+ years of teaching experience',
    image: '/images/team/director.jpg',
  },
  {
    name: 'Prof. Anjali Menon',
    role: 'Academic Head',
    bio: 'M.Sc. Physics, Former IIT Faculty',
    image: '/images/team/academic-head.jpg',
  },
  {
    name: 'Mr. Vikram Singh',
    role: 'Mathematics Department Head',
    bio: 'M.Sc. Mathematics, 15+ years coaching experience',
    image: '/images/team/math-head.jpg',
  },
  {
    name: 'Dr. Lakshmi Iyer',
    role: 'Biology Department Head',
    bio: 'Ph.D. Molecular Biology, NEET Expert',
    image: '/images/team/bio-head.jpg',
  },
];

// Statistics
const stats = [
  { label: 'Years of Excellence', value: '15+' },
  { label: 'Students Enrolled', value: '10,000+' },
  { label: 'Success Rate', value: '95%' },
  { label: 'Expert Faculty', value: '50+' },
];

export default function AboutPage() {
  const t = useTranslations('about');

  return (
    <Box>
      {/* Hero Section */}
      <Box
        sx={{
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          py: { xs: 6, md: 10 },
        }}
      >
        <Container maxWidth="lg">
          <Typography
            variant="h2"
            component="h1"
            gutterBottom
            sx={{ fontWeight: 700 }}
          >
            About Neram Classes
          </Typography>
          <Typography variant="h5" sx={{ maxWidth: '800px', opacity: 0.9 }}>
            Empowering students with quality education and personalized guidance
            since 2009
          </Typography>
        </Container>
      </Box>

      {/* Mission & Vision Section */}
      <Box sx={{ py: { xs: 6, md: 10 } }}>
        <Container maxWidth="lg">
          <Grid container spacing={6}>
            <Grid item xs={12} md={6}>
              <Typography variant="h3" gutterBottom sx={{ fontWeight: 700 }}>
                Our Mission
              </Typography>
              <Typography variant="body1" paragraph>
                To provide world-class education that nurtures academic excellence,
                critical thinking, and holistic development. We are committed to
                making quality education accessible to all students, regardless of
                their background.
              </Typography>
              <Typography variant="body1">
                Our comprehensive teaching methodology combines traditional wisdom
                with modern pedagogical techniques to ensure every student reaches
                their full potential.
              </Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="h3" gutterBottom sx={{ fontWeight: 700 }}>
                Our Vision
              </Typography>
              <Typography variant="body1" paragraph>
                To be the most trusted and preferred educational institution,
                recognized for producing successful professionals who contribute
                positively to society.
              </Typography>
              <Typography variant="body1">
                We envision a future where every student has access to personalized
                learning experiences that prepare them not just for exams, but for
                life's challenges.
              </Typography>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* Statistics Section */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
        <Container maxWidth="lg">
          <Typography
            variant="h3"
            align="center"
            gutterBottom
            sx={{ mb: 6, fontWeight: 700 }}
          >
            Our Impact
          </Typography>
          <Grid container spacing={4}>
            {stats.map((stat, index) => (
              <Grid item xs={6} md={3} key={index}>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography
                    variant="h2"
                    color="primary"
                    sx={{ fontWeight: 700, mb: 1 }}
                  >
                    {stat.value}
                  </Typography>
                  <Typography variant="h6" color="text.secondary">
                    {stat.label}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Team Section */}
      <Box sx={{ py: { xs: 6, md: 10 } }}>
        <Container maxWidth="lg">
          <Typography
            variant="h3"
            align="center"
            gutterBottom
            sx={{ mb: 2, fontWeight: 700 }}
          >
            Meet Our Leadership
          </Typography>
          <Typography
            variant="h6"
            align="center"
            color="text.secondary"
            sx={{ mb: 6 }}
          >
            Experienced educators dedicated to your success
          </Typography>
          <Grid container spacing={4}>
            {teamMembers.map((member, index) => (
              <Grid item xs={12} sm={6} md={3} key={index}>
                <Card
                  sx={{
                    height: '100%',
                    textAlign: 'center',
                    transition: 'transform 0.2s',
                    '&:hover': {
                      transform: 'translateY(-8px)',
                      boxShadow: 4,
                    },
                  }}
                >
                  <CardContent sx={{ p: 3 }}>
                    <Avatar
                      src={member.image}
                      alt={member.name}
                      sx={{
                        width: 120,
                        height: 120,
                        mx: 'auto',
                        mb: 2,
                      }}
                    />
                    <Typography variant="h6" gutterBottom>
                      {member.name}
                    </Typography>
                    <Typography
                      variant="body2"
                      color="primary"
                      gutterBottom
                      sx={{ fontWeight: 600 }}
                    >
                      {member.role}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {member.bio}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Values Section */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
        <Container maxWidth="lg">
          <Typography
            variant="h3"
            align="center"
            gutterBottom
            sx={{ mb: 6, fontWeight: 700 }}
          >
            Our Core Values
          </Typography>
          <Grid container spacing={4}>
            {[
              {
                title: 'Excellence',
                description:
                  'We strive for the highest standards in everything we do',
              },
              {
                title: 'Integrity',
                description:
                  'We maintain honesty and strong moral principles in all our dealings',
              },
              {
                title: 'Innovation',
                description:
                  'We embrace new teaching methods and technologies to enhance learning',
              },
              {
                title: 'Inclusivity',
                description:
                  'We welcome students from all backgrounds and provide equal opportunities',
              },
            ].map((value, index) => (
              <Grid item xs={12} sm={6} md={3} key={index}>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>
                    {value.title}
                  </Typography>
                  <Typography variant="body1" color="text.secondary">
                    {value.description}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>
    </Box>
  );
}

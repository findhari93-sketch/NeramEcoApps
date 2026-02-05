'use client';

import { useTranslations } from 'next-intl';
import { Box, Container, Typography, Grid, Card, CardContent, Avatar } from '@neram/ui';

// Team members (could be moved to CMS/database later)
const teamMembers = [
  {
    name: 'Ar. Ramesh Kumar',
    role: 'Founder & Director',
    bio: 'B.Arch from IIT Kharagpur, 20+ years in architecture education',
    image: '/images/team/director.jpg',
  },
  {
    name: 'Ar. Anjali Menon',
    role: 'Academic Head',
    bio: 'B.Arch from NIT Trichy, NATA & JEE Paper 2 Expert',
    image: '/images/team/academic-head.jpg',
  },
  {
    name: 'Mr. Vikram Singh',
    role: 'Drawing & Design Head',
    bio: 'M.Arch, 15+ years coaching experience in architectural aptitude',
    image: '/images/team/design-head.jpg',
  },
  {
    name: 'Ms. Priya Sharma',
    role: 'Software Training Head',
    bio: 'Autodesk Certified Professional, Revit & AutoCAD Expert',
    image: '/images/team/software-head.jpg',
  },
];

// Statistics
const stats = [
  { key: 'yearsOfExcellence', value: '15+' },
  { key: 'studentsEnrolled', value: '10,000+' },
  { key: 'successRate', value: '95%' },
  { key: 'expertFaculty', value: '50+' },
];

// Core values
const coreValues = ['excellence', 'integrity', 'innovation', 'inclusivity'] as const;

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
            {t('pageTitle')}
          </Typography>
          <Typography variant="h5" sx={{ maxWidth: '800px', opacity: 0.9 }}>
            {t('heroSubtitle')}
          </Typography>
        </Container>
      </Box>

      {/* Mission & Vision Section */}
      <Box sx={{ py: { xs: 6, md: 10 } }}>
        <Container maxWidth="lg">
          <Grid container spacing={6}>
            <Grid item xs={12} md={6}>
              <Typography variant="h3" gutterBottom sx={{ fontWeight: 700 }}>
                {t('mission.title')}
              </Typography>
              <Typography variant="body1" paragraph>
                {t('mission.paragraph1')}
              </Typography>
              <Typography variant="body1">
                {t('mission.paragraph2')}
              </Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="h3" gutterBottom sx={{ fontWeight: 700 }}>
                {t('vision.title')}
              </Typography>
              <Typography variant="body1" paragraph>
                {t('vision.paragraph1')}
              </Typography>
              <Typography variant="body1">
                {t('vision.paragraph2')}
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
            {t('impact.title')}
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
                    {t(`impact.${stat.key}`)}
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
            {t('team.title')}
          </Typography>
          <Typography
            variant="h6"
            align="center"
            color="text.secondary"
            sx={{ mb: 6 }}
          >
            {t('team.subtitle')}
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
            {t('values.title')}
          </Typography>
          <Grid container spacing={4}>
            {coreValues.map((value, index) => (
              <Grid item xs={12} sm={6} md={3} key={index}>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>
                    {t(`values.${value}.title`)}
                  </Typography>
                  <Typography variant="body1" color="text.secondary">
                    {t(`values.${value}.description`)}
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

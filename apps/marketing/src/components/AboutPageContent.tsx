'use client';

import { Fragment } from 'react';
import { useTranslations } from 'next-intl';
import { Box, Container, Typography, Grid, Card, CardContent, Avatar, Chip, IconButton } from '@neram/ui';
import LinkedInIcon from '@mui/icons-material/LinkedIn';

// Team members (could be moved to CMS/database later)
// Cards degrade gracefully: empty fields are hidden and an empty image shows the initials avatar.
// Only set `image` once the file exists in public/images/team, otherwise every visit requests a 404.
// `honorific` is shown before the name but kept out of the initials.
const teamMembers: Array<{
  honorific?: string;
  name: string;
  role: string;
  institute: string;
  bio: string;
  image: string;
  linkedin?: string;
}> = [
  {
    name: 'TamilSelvan',
    role: 'Chief Information Officer (CIO)',
    institute: 'MBA, Alagappa University',
    bio: 'Student Guidance | Academic Coordination | Operations',
    image: '',
    linkedin: 'https://www.linkedin.com/in/tamil-selvan-b7395b177/',
  },
  {
    honorific: 'Ar.',
    name: 'Haribabu Manoharan',
    role: 'Student Advisor & Ex-Chief Technology Officer (CTO)',
    institute: 'NIT Trichy',
    bio: '',
    image: '/images/team/haribabu-manoharan.jpg',
    linkedin: 'https://www.linkedin.com/in/findhari/',
  },
  {
    name: 'Sudharshini Arjun',
    role: 'Architectural Mentor',
    institute: 'University of Oxford, UK',
    bio: 'RIBA Part 2 Architectural Assistant | Senior Architect at KOID India',
    image: '',
    linkedin: 'https://www.linkedin.com/in/sudharshini-rajan-47a0566b/',
  },
  {
    honorific: 'Ar.',
    name: 'Sivaram',
    role: 'Architecture Faculty & Mentor',
    institute: 'B.Arch, Anna University',
    bio: 'NATA & JEE Paper 2 | Architectural Aptitude | Drawing & Design',
    image: '/images/team/sivaram.jpg',
  },
  {
    honorific: 'Ms.',
    name: 'Shanthi Manoharan',
    role: 'Administration & Student Support Coordinator',
    institute: '',
    bio: 'Student Guidance | Parent Communication | Academic Administration',
    image: '',
  },
];

// Statistics
// Founder-confirmed proof points only (lib/seo/facts.ts PROOF_POINTS).
const stats: Array<{ key: string; value: string; label?: string }> = [
  { key: 'yearsOfExcellence', value: '10+' },
  { key: 'studentsEnrolled', value: '1,000+' },
  { key: 'airOne', value: 'AIR 1', label: 'JEE B.Arch 2024' },
];

// Story paragraphs (rendered in order)
const storyParagraphs = ['story.paragraph1', 'story.paragraph2', 'story.paragraph3'] as const;

// Core values
const coreValues = ['excellence', 'integrity', 'innovation', 'inclusivity'] as const;

// Deterministic initials + avatar color so missing photos degrade to a clean, branded fallback.
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_COLORS = ['#1565C0', '#00897B', '#5E35B1', '#AD1457', '#EF6C00', '#283593'];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function AboutPageContent() {
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

      {/* Our Story Section */}
      <Box sx={{ py: { xs: 6, md: 10 } }}>
        <Container maxWidth="lg">
          <Typography
            variant="h3"
            align="center"
            gutterBottom
            sx={{ mb: { xs: 4, md: 6 }, fontWeight: 700 }}
          >
            {t('story.title')}
          </Typography>
          <Box sx={{ maxWidth: 760, mx: 'auto' }}>
            {storyParagraphs.map((key, index) => (
              <Typography
                key={key}
                variant="body1"
                color="text.secondary"
                sx={{
                  fontSize: { xs: '1rem', md: '1.125rem' },
                  lineHeight: 1.8,
                  mb: index === storyParagraphs.length - 1 ? 0 : 3,
                }}
              >
                {t(key)}
              </Typography>
            ))}
          </Box>
        </Container>
      </Box>

      {/* Mission & Vision Section */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
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
      <Box sx={{ py: { xs: 6, md: 10 } }}>
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
              <Grid item xs={6} md={4} key={index}>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography
                    variant="h2"
                    color="primary"
                    sx={{ fontWeight: 700, mb: 1 }}
                  >
                    {stat.value}
                  </Typography>
                  <Typography variant="h6" color="text.secondary">
                    {stat.label ?? t(`impact.${stat.key}`)}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Team Section */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
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
            sx={{ mb: 6, maxWidth: 720, mx: 'auto' }}
          >
            {t('team.subtitle')}
          </Typography>
          <Grid container spacing={4} justifyContent="center">
            {teamMembers.map((member, index) => (
              <Grid item xs={12} sm={6} md={4} key={index}>
                <Card
                  sx={{
                    height: '100%',
                    textAlign: 'center',
                    borderRadius: 3,
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                    '&:hover': {
                      transform: 'translateY(-6px)',
                      boxShadow: 6,
                    },
                    '@media (prefers-reduced-motion: reduce)': {
                      transition: 'none',
                      '&:hover': { transform: 'none' },
                    },
                  }}
                >
                  <CardContent sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Avatar
                      src={member.image || undefined}
                      alt={[member.honorific, member.name].filter(Boolean).join(' ')}
                      sx={{
                        width: 112,
                        height: 112,
                        mx: 'auto',
                        mb: 2,
                        fontSize: '1.75rem',
                        fontWeight: 700,
                        bgcolor: getAvatarColor(member.name),
                        color: '#fff',
                        border: '3px solid',
                        borderColor: 'background.paper',
                        boxShadow: 2,
                      }}
                    >
                      {getInitials(member.name)}
                    </Avatar>
                    <Typography variant="h6" gutterBottom>
                      {[member.honorific, member.name].filter(Boolean).join(' ')}
                    </Typography>
                    {member.role && (
                      <Typography
                        variant="body2"
                        color="primary"
                        gutterBottom
                        sx={{ fontWeight: 600 }}
                      >
                        {member.role}
                      </Typography>
                    )}
                    {member.institute && (
                      <Chip
                        label={member.institute}
                        size="small"
                        sx={{
                          mt: 0.5,
                          mb: 1,
                          fontWeight: 600,
                          bgcolor: 'rgba(21, 101, 192, 0.10)',
                          color: 'primary.main',
                        }}
                      />
                    )}
                    {member.bio && (
                      <Typography variant="body2" color="text.secondary">
                        {/* Keep each "|" on the same line as the item before it so a wrap never starts with one */}
                        {member.bio.split(' | ').map((item, i, items) => (
                          <Fragment key={item}>
                            <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
                              {item}
                              {i < items.length - 1 ? ' |' : ''}
                            </Box>
                            {i < items.length - 1 ? ' ' : ''}
                          </Fragment>
                        ))}
                      </Typography>
                    )}
                    {member.linkedin && (
                      // mt: auto pins the link to the card bottom so icons line up across a row
                      <Box sx={{ mt: 'auto', pt: 1.5 }}>
                        <IconButton
                          component="a"
                          href={member.linkedin}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`${[member.honorific, member.name].filter(Boolean).join(' ')} on LinkedIn (opens in a new tab)`}
                          sx={{
                            width: 48,
                            height: 48,
                            color: '#0A66C2',
                            '&:hover': { bgcolor: 'rgba(10, 102, 194, 0.08)' },
                            '&:focus-visible': { outline: '2px solid #0A66C2', outlineOffset: 2 },
                          }}
                        >
                          <LinkedInIcon sx={{ fontSize: 28 }} />
                        </IconButton>
                      </Box>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Values Section */}
      <Box sx={{ py: { xs: 6, md: 10 } }}>
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

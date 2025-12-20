import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import {
  Box,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  Chip,
  Divider,
} from '@neram/ui';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Free NATA & JEE Paper 2 Resources 2025 - Study Materials | Neram Classes',
  description: 'Download free NATA and JEE Paper 2 study materials, e-books, practice papers, and resources. Get free access to quality preparation materials.',
  keywords: 'free NATA books, free JEE Paper 2 resources, NATA study material PDF, free architecture entrance resources',
  alternates: {
    canonical: 'https://neramclasses.com/en/free-resources',
  },
};

interface PageProps {
  params: { locale: string };
}

const resources = [
  {
    category: 'E-Books & Notes',
    items: [
      { title: 'NATA Mathematics Formula Sheet', type: 'PDF', size: '2 MB', downloads: '15K+' },
      { title: 'Aptitude Quick Reference Guide', type: 'PDF', size: '3 MB', downloads: '12K+' },
      { title: 'Perspective Drawing Basics', type: 'PDF', size: '5 MB', downloads: '20K+' },
      { title: 'Architectural Awareness Notes', type: 'PDF', size: '4 MB', downloads: '10K+' },
    ],
  },
  {
    category: 'Practice Papers',
    items: [
      { title: 'NATA 2024 Sample Paper', type: 'PDF', size: '1 MB', downloads: '25K+' },
      { title: 'JEE Paper 2 Practice Set', type: 'PDF', size: '2 MB', downloads: '18K+' },
      { title: 'Drawing Test Practice Sheets', type: 'PDF', size: '8 MB', downloads: '22K+' },
      { title: 'Aptitude Mock Test Series', type: 'PDF', size: '3 MB', downloads: '16K+' },
    ],
  },
  {
    category: 'Video Lectures',
    items: [
      { title: 'Introduction to NATA', type: 'Video', size: 'YouTube', downloads: '50K+ views' },
      { title: 'Perspective Drawing Tutorial', type: 'Video', size: 'YouTube', downloads: '35K+ views' },
      { title: 'Coordinate Geometry Basics', type: 'Video', size: 'YouTube', downloads: '28K+ views' },
      { title: 'Aptitude Shortcuts', type: 'Video', size: 'YouTube', downloads: '40K+ views' },
    ],
  },
  {
    category: 'Cheat Sheets',
    items: [
      { title: 'Trigonometry Formulas', type: 'PDF', size: '500 KB', downloads: '30K+' },
      { title: 'Famous Architects List', type: 'PDF', size: '1 MB', downloads: '15K+' },
      { title: 'Building Materials Quick Guide', type: 'PDF', size: '1 MB', downloads: '12K+' },
      { title: 'Drawing Tips & Tricks', type: 'PDF', size: '2 MB', downloads: '18K+' },
    ],
  },
];

const tools = [
  {
    title: 'NATA Cutoff Calculator',
    description: 'Calculate your expected cutoff rank based on score',
    icon: '🧮',
    link: '/tools/cutoff-calculator',
  },
  {
    title: 'College Predictor',
    description: 'Find colleges based on your expected rank',
    icon: '🎓',
    link: '/tools/college-predictor',
  },
  {
    title: 'Exam Center Locator',
    description: 'Find NATA exam centers near you',
    icon: '📍',
    link: '/tools/exam-centers',
  },
];

export default function FreeResourcesPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);

  return (
    <Box>
      {/* Hero Section */}
      <Box
        sx={{
          py: { xs: 6, md: 10 },
          background: 'linear-gradient(135deg, #00897b 0%, #00695c 100%)',
          color: 'white',
        }}
      >
        <Container maxWidth="lg">
          <Typography variant="h1" component="h1" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '2rem', md: '3rem' } }}>
            Free NATA & JEE Resources
          </Typography>
          <Typography variant="h5" sx={{ mb: 3, opacity: 0.9 }}>
            Quality study materials to kickstart your preparation - completely free!
          </Typography>
          <Button
            variant="contained"
            component={Link}
            href="/apply"
            sx={{ bgcolor: 'white', color: 'teal' }}
          >
            Get Premium Resources
          </Button>
        </Container>
      </Box>

      {/* Free Tools Section */}
      <Box sx={{ py: { xs: 4, md: 6 }, bgcolor: 'grey.50' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 4 }}>
            Free Online Tools
          </Typography>
          <Grid container spacing={3}>
            {tools.map((tool, index) => (
              <Grid item xs={12} md={4} key={index}>
                <Card
                  component={Link}
                  href={tool.link}
                  sx={{
                    height: '100%',
                    textDecoration: 'none',
                    transition: 'transform 0.2s',
                    '&:hover': { transform: 'translateY(-4px)' },
                  }}
                >
                  <CardContent sx={{ p: 4, textAlign: 'center' }}>
                    <Typography variant="h2" sx={{ mb: 2 }}>{tool.icon}</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>{tool.title}</Typography>
                    <Typography variant="body2" color="text.secondary">{tool.description}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Resources Grid */}
      {resources.map((category, categoryIndex) => (
        <Box
          key={categoryIndex}
          sx={{
            py: { xs: 6, md: 10 },
            bgcolor: categoryIndex % 2 === 0 ? 'background.default' : 'grey.50',
          }}
        >
          <Container maxWidth="lg">
            <Typography variant="h2" component="h2" gutterBottom sx={{ fontWeight: 700, mb: 4 }}>
              {category.category}
            </Typography>
            <Grid container spacing={3}>
              {category.items.map((item, index) => (
                <Grid item xs={12} sm={6} md={3} key={index}>
                  <Card sx={{ height: '100%' }}>
                    <CardContent sx={{ p: 3 }}>
                      <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                        {item.title}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                        <Chip label={item.type} size="small" color="primary" />
                        <Chip label={item.size} size="small" variant="outlined" />
                      </Box>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {item.downloads} downloads
                      </Typography>
                      <Button
                        variant="outlined"
                        fullWidth
                        size="small"
                        href="#"
                      >
                        {item.type === 'Video' ? 'Watch Now' : 'Download'}
                      </Button>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>
      ))}

      {/* Premium Resources CTA */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'teal', color: 'white', textAlign: 'center' }}>
        <Container maxWidth="md">
          <Typography variant="h3" component="h2" gutterBottom sx={{ fontWeight: 700 }}>
            Want More Resources?
          </Typography>
          <Typography variant="h6" sx={{ mb: 4, opacity: 0.9 }}>
            Get access to 500+ premium study materials, video lectures, and mock tests
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              size="large"
              component={Link}
              href="/apply"
              sx={{ bgcolor: 'white', color: 'teal' }}
            >
              Join Premium
            </Button>
            <Button
              variant="outlined"
              size="large"
              component={Link}
              href="/previous-year-papers"
              sx={{ borderColor: 'white', color: 'white' }}
            >
              Previous Year Papers
            </Button>
          </Box>
        </Container>
      </Box>
    </Box>
  );
}

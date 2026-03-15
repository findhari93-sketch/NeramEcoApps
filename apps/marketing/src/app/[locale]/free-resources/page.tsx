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
import { JsonLd } from '@/components/seo/JsonLd';
import { generateFAQSchema, generateBreadcrumbSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import { APP_URL } from '@/lib/seo/constants';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'Free NATA & JEE Paper 2 Resources 2026 - Study Materials',
    description: 'Download free NATA and JEE Paper 2 study materials, e-books, practice papers, and resources. Get free access to quality preparation materials.',
    keywords: 'free NATA books, free JEE Paper 2 resources, NATA study material PDF, free architecture entrance resources',
    alternates: buildAlternates(locale, '/free-resources'),
  };
}

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
    external: false,
  },
  {
    title: 'College Predictor',
    description: 'Find colleges based on your expected rank',
    icon: '🎓',
    link: `${APP_URL}/tools/college-predictor`,
    external: true,
  },
  {
    title: 'Exam Center Locator',
    description: 'Find NATA exam centers near you',
    icon: '📍',
    link: `${APP_URL}/tools/exam-centers`,
    external: true,
  },
];

export default function FreeResourcesPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);

  const baseUrl = 'https://neramclasses.com';
  const faqs = [
    {
      question: 'Are these NATA study materials really free to download?',
      answer: 'Yes, all the study materials listed on this page are completely free to download and use. Neram Classes provides these free resources including formula sheets, practice papers, drawing guides, and cheat sheets to help students begin their NATA and JEE Paper 2 preparation without any cost. Premium resources with detailed video lectures and comprehensive mock tests are available through our coaching programs.',
    },
    {
      question: 'What free resources are most important for NATA preparation?',
      answer: 'The most important free resources for NATA preparation are: (1) Previous year question papers with solutions for understanding exam patterns, (2) Mathematics formula sheets for quick revision, (3) Drawing practice sheets for daily sketching exercises, and (4) Aptitude quick reference guides for reasoning and spatial ability topics. Start with these foundational resources and supplement with video tutorials for topics you find challenging.',
    },
    {
      question: 'Can I prepare for NATA using only free resources?',
      answer: 'While free resources provide a good foundation, relying solely on them may not be sufficient for competitive scores in NATA. Free materials cover basics well, but structured coaching provides personalized feedback on drawings, systematic mock test series with performance analysis, and expert guidance on time management strategies. Many successful NATA candidates use a combination of free resources for self-study and coaching for guided preparation.',
    },
    {
      question: 'Are there free online tools to help with NATA preparation?',
      answer: 'Yes, several free online tools are available for NATA preparation including cutoff calculators to estimate your rank, college predictors to find suitable colleges based on your expected score, and exam center locators. Neram Classes offers these tools along with free sample mock tests. Additionally, YouTube has many free video lectures covering NATA Mathematics, Aptitude, and Drawing topics that complement your preparation.',
    },
    {
      question: 'How often are the free study materials updated?',
      answer: 'Our free study materials are updated annually to reflect the latest NATA and JEE Paper 2 exam patterns, syllabus changes, and new question trends. The formula sheets and cheat sheets are reviewed before each exam season. Practice papers are updated with questions reflecting the most recent exam patterns. We recommend downloading the latest versions before starting your preparation to ensure you are studying the most current content.',
    },
  ];

  return (
    <>
      <JsonLd data={generateFAQSchema(faqs)} />
      <JsonLd data={generateBreadcrumbSchema([
        { name: 'Home', url: baseUrl },
        { name: 'Free Resources' },
      ])} />
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
                  component={tool.external ? 'a' : Link}
                  href={tool.external ? tool.link : tool.link}
                  {...(tool.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
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
                        href={`${APP_URL}/tools`}
                        target="_blank"
                        rel="noopener noreferrer"
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
    </>
  );
}

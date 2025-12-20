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
  title: 'Best Books for NATA & JEE Paper 2 2025 - Recommended Books | Neram Classes',
  description: 'Complete list of best books for NATA and JEE Paper 2 preparation. Subject-wise book recommendations for Mathematics, Aptitude, and Drawing.',
  keywords: 'best books for NATA, NATA books, JEE Paper 2 books, NATA preparation books, architecture entrance books',
  alternates: {
    canonical: 'https://neramclasses.com/en/best-books-nata-jee',
  },
};

interface PageProps {
  params: { locale: string };
}

const bookRecommendations = {
  mathematics: [
    {
      title: 'NCERT Mathematics (Class 11 & 12)',
      author: 'NCERT',
      level: 'Foundation',
      description: 'Essential for building basics. Cover all chapters thoroughly.',
      mustHave: true,
    },
    {
      title: 'Objective Mathematics by R.D. Sharma',
      author: 'R.D. Sharma',
      level: 'Intermediate',
      description: 'Comprehensive problems for JEE level mathematics.',
      mustHave: true,
    },
    {
      title: 'Problems in Calculus of One Variable',
      author: 'I.A. Maron',
      level: 'Advanced',
      description: 'For mastering calculus concepts and problem-solving.',
      mustHave: false,
    },
    {
      title: 'Coordinate Geometry by S.L. Loney',
      author: 'S.L. Loney',
      level: 'Intermediate',
      description: 'Best for coordinate geometry - high weightage topic.',
      mustHave: true,
    },
  ],
  aptitude: [
    {
      title: 'A Modern Approach to Verbal & Non-Verbal Reasoning',
      author: 'R.S. Aggarwal',
      level: 'Foundation',
      description: 'Complete guide for logical and visual reasoning.',
      mustHave: true,
    },
    {
      title: 'Analytical Reasoning',
      author: 'M.K. Pandey',
      level: 'Intermediate',
      description: 'Excellent for puzzle-based and analytical problems.',
      mustHave: false,
    },
    {
      title: 'General Knowledge by Lucent',
      author: 'Lucent Publications',
      level: 'Foundation',
      description: 'For current affairs and general awareness section.',
      mustHave: true,
    },
    {
      title: 'Architecture Entrance Aptitude Test',
      author: 'Various',
      level: 'Specific',
      description: 'Covers architectural awareness and building knowledge.',
      mustHave: true,
    },
  ],
  drawing: [
    {
      title: 'Drawing for Architects',
      author: 'Francis D.K. Ching',
      level: 'Foundation',
      description: 'Bible for architectural drawing and visualization.',
      mustHave: true,
    },
    {
      title: 'Perspective Made Easy',
      author: 'Ernest R. Norling',
      level: 'Foundation',
      description: 'Perfect for learning perspective drawing from scratch.',
      mustHave: true,
    },
    {
      title: 'Design Drawing',
      author: 'Francis D.K. Ching',
      level: 'Intermediate',
      description: 'Advanced techniques for design and composition.',
      mustHave: false,
    },
    {
      title: 'NATA Drawing Skills',
      author: 'Various Coaching Materials',
      level: 'Specific',
      description: 'Practice books specifically designed for NATA drawing test.',
      mustHave: true,
    },
  ],
  architecture: [
    {
      title: 'A History of Architecture',
      author: 'Sir Banister Fletcher',
      level: 'Reference',
      description: 'Comprehensive history of world architecture.',
      mustHave: false,
    },
    {
      title: 'Form, Space & Order',
      author: 'Francis D.K. Ching',
      level: 'Intermediate',
      description: 'Understanding architectural concepts and principles.',
      mustHave: true,
    },
    {
      title: 'Building Construction Illustrated',
      author: 'Francis D.K. Ching',
      level: 'Foundation',
      description: 'Learn about building materials and construction methods.',
      mustHave: true,
    },
  ],
};

export default function BestBooksNataJeePage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);

  return (
    <Box>
      {/* Hero Section */}
      <Box
        sx={{
          py: { xs: 6, md: 10 },
          background: 'linear-gradient(135deg, #6a1b9a 0%, #4a148c 100%)',
          color: 'white',
        }}
      >
        <Container maxWidth="lg">
          <Typography variant="h1" component="h1" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '2rem', md: '3rem' } }}>
            Best Books for NATA & JEE Paper 2
          </Typography>
          <Typography variant="h5" sx={{ mb: 3, opacity: 0.9 }}>
            Expert-recommended books for comprehensive preparation
          </Typography>
          <Button
            variant="contained"
            component={Link}
            href="/free-resources"
            sx={{ bgcolor: 'white', color: 'secondary.main' }}
          >
            Get Free Study Materials
          </Button>
        </Container>
      </Box>

      {/* Mathematics Books */}
      <Box sx={{ py: { xs: 6, md: 10 } }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" gutterBottom sx={{ fontWeight: 700, mb: 4 }}>
            📐 Mathematics Books
          </Typography>
          <Grid container spacing={3}>
            {bookRecommendations.mathematics.map((book, index) => (
              <Grid item xs={12} sm={6} md={3} key={index}>
                <Card sx={{ height: '100%', position: 'relative' }}>
                  {book.mustHave && (
                    <Chip
                      label="Must Have"
                      color="error"
                      size="small"
                      sx={{ position: 'absolute', top: 12, right: 12 }}
                    />
                  )}
                  <CardContent sx={{ p: 3 }}>
                    <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, pr: book.mustHave ? 8 : 0 }}>
                      {book.title}
                    </Typography>
                    <Typography variant="body2" color="primary" sx={{ mb: 1 }}>
                      by {book.author}
                    </Typography>
                    <Chip label={book.level} size="small" variant="outlined" sx={{ mb: 2 }} />
                    <Typography variant="body2" color="text.secondary">
                      {book.description}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Aptitude Books */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" gutterBottom sx={{ fontWeight: 700, mb: 4 }}>
            🧠 Aptitude Books
          </Typography>
          <Grid container spacing={3}>
            {bookRecommendations.aptitude.map((book, index) => (
              <Grid item xs={12} sm={6} md={3} key={index}>
                <Card sx={{ height: '100%', position: 'relative' }}>
                  {book.mustHave && (
                    <Chip
                      label="Must Have"
                      color="error"
                      size="small"
                      sx={{ position: 'absolute', top: 12, right: 12 }}
                    />
                  )}
                  <CardContent sx={{ p: 3 }}>
                    <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, pr: book.mustHave ? 8 : 0 }}>
                      {book.title}
                    </Typography>
                    <Typography variant="body2" color="primary" sx={{ mb: 1 }}>
                      by {book.author}
                    </Typography>
                    <Chip label={book.level} size="small" variant="outlined" sx={{ mb: 2 }} />
                    <Typography variant="body2" color="text.secondary">
                      {book.description}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Drawing Books */}
      <Box sx={{ py: { xs: 6, md: 10 } }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" gutterBottom sx={{ fontWeight: 700, mb: 4 }}>
            ✏️ Drawing & Sketching Books
          </Typography>
          <Grid container spacing={3}>
            {bookRecommendations.drawing.map((book, index) => (
              <Grid item xs={12} sm={6} md={3} key={index}>
                <Card sx={{ height: '100%', position: 'relative' }}>
                  {book.mustHave && (
                    <Chip
                      label="Must Have"
                      color="error"
                      size="small"
                      sx={{ position: 'absolute', top: 12, right: 12 }}
                    />
                  )}
                  <CardContent sx={{ p: 3 }}>
                    <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, pr: book.mustHave ? 8 : 0 }}>
                      {book.title}
                    </Typography>
                    <Typography variant="body2" color="primary" sx={{ mb: 1 }}>
                      by {book.author}
                    </Typography>
                    <Chip label={book.level} size="small" variant="outlined" sx={{ mb: 2 }} />
                    <Typography variant="body2" color="text.secondary">
                      {book.description}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Architecture Awareness Books */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" gutterBottom sx={{ fontWeight: 700, mb: 4 }}>
            🏛️ Architecture Awareness Books
          </Typography>
          <Grid container spacing={3}>
            {bookRecommendations.architecture.map((book, index) => (
              <Grid item xs={12} sm={6} md={4} key={index}>
                <Card sx={{ height: '100%', position: 'relative' }}>
                  {book.mustHave && (
                    <Chip
                      label="Must Have"
                      color="error"
                      size="small"
                      sx={{ position: 'absolute', top: 12, right: 12 }}
                    />
                  )}
                  <CardContent sx={{ p: 3 }}>
                    <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, pr: book.mustHave ? 8 : 0 }}>
                      {book.title}
                    </Typography>
                    <Typography variant="body2" color="primary" sx={{ mb: 1 }}>
                      by {book.author}
                    </Typography>
                    <Chip label={book.level} size="small" variant="outlined" sx={{ mb: 2 }} />
                    <Typography variant="body2" color="text.secondary">
                      {book.description}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Study Tips */}
      <Box sx={{ py: { xs: 6, md: 10 } }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 6 }}>
            How to Use These Books Effectively
          </Typography>
          <Grid container spacing={4}>
            {[
              { tip: 'Start with NCERT', desc: 'Complete NCERT for all subjects before moving to reference books.' },
              { tip: 'Make Notes', desc: 'Create concise notes while reading for quick revision later.' },
              { tip: 'Practice Daily', desc: 'Solve problems from each book daily, not just reading.' },
              { tip: 'Focus on Drawings', desc: 'Spend 2+ hours daily on drawing practice from recommended books.' },
            ].map((item, index) => (
              <Grid item xs={12} sm={6} md={3} key={index}>
                <Card sx={{ height: '100%', textAlign: 'center', p: 3 }}>
                  <Typography variant="h4" sx={{ mb: 2 }}>{index + 1}</Typography>
                  <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>{item.tip}</Typography>
                  <Typography variant="body2" color="text.secondary">{item.desc}</Typography>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* CTA Section */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'secondary.main', color: 'white', textAlign: 'center' }}>
        <Container maxWidth="md">
          <Typography variant="h3" component="h2" gutterBottom sx={{ fontWeight: 700 }}>
            Need Expert Guidance?
          </Typography>
          <Typography variant="h6" sx={{ mb: 4, opacity: 0.9 }}>
            Books are important, but guided coaching makes the difference
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              size="large"
              component={Link}
              href="/apply"
              sx={{ bgcolor: 'white', color: 'secondary.main' }}
            >
              Join Coaching
            </Button>
            <Button
              variant="outlined"
              size="large"
              component={Link}
              href="/free-resources"
              sx={{ borderColor: 'white', color: 'white' }}
            >
              Free Resources
            </Button>
          </Box>
        </Container>
      </Box>
    </Box>
  );
}

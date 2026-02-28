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
} from '@neram/ui';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'NATA & Architecture Blog - Tips, News & Guides | Neram Classes',
    description: 'Read the latest articles on NATA preparation, architecture career, JEE Paper 2 tips, and more. Expert insights from Neram Classes faculty.',
    keywords: 'NATA blog, architecture blog, NATA preparation tips, JEE Paper 2 articles, architecture career',
    alternates: buildAlternates(locale, '/blog'),
  };
}

interface PageProps {
  params: { locale: string };
}

// Static blog posts data (will be replaced with database fetch)
const blogPosts = [
  {
    slug: 'nata-2025-preparation-strategy',
    title: 'NATA 2025 Preparation Strategy: Complete Guide for Aspirants',
    excerpt: 'Learn the complete preparation strategy for NATA 2025 with expert tips on drawing, aptitude, and mathematics preparation.',
    category: 'Preparation',
    author: 'Neram Classes',
    publishedAt: '2025-01-15',
    readTime: '8 min read',
    featured: true,
  },
  {
    slug: 'top-10-drawing-techniques-nata',
    title: 'Top 10 Drawing Techniques Every NATA Aspirant Must Master',
    excerpt: 'Master these essential drawing techniques to score high in the NATA drawing section. Expert tips from our faculty.',
    category: 'Drawing',
    author: 'Neram Classes',
    publishedAt: '2025-01-10',
    readTime: '6 min read',
    featured: true,
  },
  {
    slug: 'best-nata-coaching-chennai',
    title: 'Best NATA Coaching in Chennai - Complete Guide 2026',
    excerpt: 'Find the best NATA coaching institutes in Chennai. Compare features, fees, and success rates to make the right choice.',
    category: 'City Guide',
    author: 'Neram Classes',
    publishedAt: '2025-01-05',
    readTime: '5 min read',
    featured: false,
  },
  {
    slug: 'best-nata-coaching-coimbatore',
    title: 'Best NATA Coaching in Coimbatore - Top Institutes 2026',
    excerpt: 'Comprehensive guide to NATA coaching in Coimbatore. Find the right coaching institute for your preparation.',
    category: 'City Guide',
    author: 'Neram Classes',
    publishedAt: '2025-01-03',
    readTime: '5 min read',
    featured: false,
  },
  {
    slug: 'best-nata-coaching-madurai',
    title: 'Best NATA Coaching in Madurai - Expert Guide 2026',
    excerpt: 'Looking for NATA coaching in Madurai? Here is everything you need to know about preparation options.',
    category: 'City Guide',
    author: 'Neram Classes',
    publishedAt: '2025-01-02',
    readTime: '5 min read',
    featured: false,
  },
  {
    slug: 'best-nata-coaching-trichy',
    title: 'Best NATA Coaching in Trichy - Top Choices 2026',
    excerpt: 'Discover the best NATA coaching options in Trichy. Compare and choose the right coaching for your success.',
    category: 'City Guide',
    author: 'Neram Classes',
    publishedAt: '2025-01-01',
    readTime: '5 min read',
    featured: false,
  },
  {
    slug: 'best-nata-coaching-pudukkottai',
    title: 'Best NATA Coaching in Pudukkottai - Neram Classes HQ 2026',
    excerpt: 'Looking for NATA coaching in Pudukkottai? As the headquarters of Neram Classes, Pudukkottai students get direct access to our expert faculty and personalized coaching.',
    category: 'City Guide',
    author: 'Neram Classes',
    publishedAt: '2026-01-10',
    readTime: '17 min read',
    featured: false,
  },
  {
    slug: 'best-nata-coaching-salem',
    title: 'Best NATA Coaching in Salem - Complete Guide 2026',
    excerpt: 'Find the best NATA coaching in Salem, the Steel City of India. Expert architecture entrance preparation with flexible online and offline options.',
    category: 'City Guide',
    author: 'Neram Classes',
    publishedAt: '2026-01-08',
    readTime: '16 min read',
    featured: false,
  },
  {
    slug: 'best-nata-coaching-tiruppur',
    title: 'Best NATA Coaching in Tiruppur - Expert Guide 2026',
    excerpt: 'Discover the best NATA coaching for Tiruppur students. World-class architecture entrance preparation through expert online and offline coaching.',
    category: 'City Guide',
    author: 'Neram Classes',
    publishedAt: '2026-01-05',
    readTime: '17 min read',
    featured: false,
  },
  {
    slug: 'best-nata-coaching-bangalore',
    title: 'Best NATA Coaching in Bangalore 2026 - Complete Guide',
    excerpt: 'Find the best NATA coaching in Bangalore. Expert online and offline classes for architecture aspirants in India\'s IT capital.',
    category: 'City Guide',
    author: 'Neram Classes',
    publishedAt: '2026-01-22',
    readTime: '15 min read',
    featured: false,
  },
  {
    slug: 'best-nata-coaching-dubai',
    title: 'Best NATA Coaching for Students in Dubai 2026',
    excerpt: 'Looking for NATA coaching in Dubai? Neram Classes offers comprehensive online NATA preparation for Indian students in the UAE.',
    category: 'City Guide',
    author: 'Neram Classes',
    publishedAt: '2026-02-01',
    readTime: '15 min read',
    featured: false,
  },
  {
    slug: 'best-nata-coaching-doha',
    title: 'Best NATA Coaching for Students in Doha 2026',
    excerpt: 'Expert NATA coaching for Indian students in Doha, Qatar. Online live classes with timezone accommodation and personal mentoring.',
    category: 'City Guide',
    author: 'Neram Classes',
    publishedAt: '2026-02-05',
    readTime: '14 min read',
    featured: false,
  },
  {
    slug: 'best-nata-coaching-muscat',
    title: 'Best NATA Coaching for Students in Muscat 2026',
    excerpt: 'Comprehensive NATA coaching for Indian students in Muscat, Oman. Online live interactive classes with expert IIT/NIT alumni faculty.',
    category: 'City Guide',
    author: 'Neram Classes',
    publishedAt: '2026-02-08',
    readTime: '14 min read',
    featured: false,
  },
  {
    slug: 'best-nata-coaching-riyadh',
    title: 'Best NATA Coaching for Students in Riyadh 2026',
    excerpt: 'Top NATA coaching for Indian students in Riyadh, Saudi Arabia. Online classes with weekend batches and Gulf timezone support.',
    category: 'City Guide',
    author: 'Neram Classes',
    publishedAt: '2026-02-10',
    readTime: '14 min read',
    featured: false,
  },
  {
    slug: 'best-nata-coaching-kuwait-city',
    title: 'Best NATA Coaching for Students in Kuwait City 2026',
    excerpt: 'Expert NATA preparation for Indian students in Kuwait City. Online coaching with Gulf timezone accommodation and complete study materials.',
    category: 'City Guide',
    author: 'Neram Classes',
    publishedAt: '2026-02-12',
    readTime: '14 min read',
    featured: false,
  },
];

const categories = ['All', 'Preparation', 'Drawing', 'City Guide', 'Career', 'News'];

export default function BlogPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);

  const featuredPosts = blogPosts.filter((post) => post.featured);
  const recentPosts = blogPosts.filter((post) => !post.featured);
  const baseUrl = 'https://neramclasses.com';

  return (
    <>
      <JsonLd
        data={generateBreadcrumbSchema([
          { name: 'Home', url: baseUrl },
          { name: 'Blog' },
        ])}
      />
    <Box>
      {/* Hero Section */}
      <Box
        sx={{
          py: { xs: 6, md: 10 },
          background: 'linear-gradient(135deg, #ec407a 0%, #d81b60 100%)',
          color: 'white',
        }}
      >
        <Container maxWidth="lg">
          <Typography variant="h1" component="h1" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '2rem', md: '3rem' } }}>
            NATA & Architecture Blog
          </Typography>
          <Typography variant="h5" sx={{ mb: 3, opacity: 0.9 }}>
            Expert insights, preparation tips, and latest news for architecture aspirants
          </Typography>
        </Container>
      </Box>

      {/* Categories */}
      <Box sx={{ py: 3, bgcolor: 'grey.50', borderBottom: 1, borderColor: 'divider' }}>
        <Container maxWidth="lg">
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
            {categories.map((cat, index) => (
              <Chip
                key={index}
                label={cat}
                variant={index === 0 ? 'filled' : 'outlined'}
                color={index === 0 ? 'primary' : 'default'}
                clickable
                sx={{ fontSize: '0.9rem' }}
              />
            ))}
          </Box>
        </Container>
      </Box>

      {/* Featured Posts */}
      <Box sx={{ py: { xs: 6, md: 10 } }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" gutterBottom sx={{ fontWeight: 700, mb: 4 }}>
            Featured Articles
          </Typography>
          <Grid container spacing={4}>
            {featuredPosts.map((post, index) => (
              <Grid item xs={12} md={6} key={index}>
                <Card
                  component={Link}
                  href={`/blog/${post.slug}`}
                  sx={{
                    height: '100%',
                    textDecoration: 'none',
                    transition: 'transform 0.2s',
                    '&:hover': { transform: 'translateY(-4px)' },
                  }}
                >
                  <CardContent sx={{ p: 4 }}>
                    <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                      <Chip label={post.category} size="small" color="primary" />
                      <Chip label={post.readTime} size="small" variant="outlined" />
                    </Box>
                    <Typography variant="h5" component="h3" gutterBottom sx={{ fontWeight: 600 }}>
                      {post.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      {post.excerpt}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {post.author} • {new Date(post.publishedAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Recent Posts */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" gutterBottom sx={{ fontWeight: 700, mb: 4 }}>
            Recent Articles
          </Typography>
          <Grid container spacing={3}>
            {recentPosts.map((post, index) => (
              <Grid item xs={12} sm={6} md={4} key={index}>
                <Card
                  component={Link}
                  href={`/blog/${post.slug}`}
                  sx={{
                    height: '100%',
                    textDecoration: 'none',
                    transition: 'transform 0.2s',
                    '&:hover': { transform: 'translateY(-4px)' },
                  }}
                >
                  <CardContent sx={{ p: 3 }}>
                    <Chip label={post.category} size="small" sx={{ mb: 2 }} />
                    <Typography variant="h6" component="h3" gutterBottom sx={{ fontWeight: 600 }}>
                      {post.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      {post.excerpt}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(post.publishedAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Newsletter CTA */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'secondary.main', color: 'white', textAlign: 'center' }}>
        <Container maxWidth="md">
          <Typography variant="h3" component="h2" gutterBottom sx={{ fontWeight: 700 }}>
            Stay Updated
          </Typography>
          <Typography variant="h6" sx={{ mb: 4, opacity: 0.9 }}>
            Get the latest articles and tips delivered to your inbox
          </Typography>
          <Button
            variant="contained"
            size="large"
            component={Link}
            href="/apply"
            sx={{ bgcolor: 'white', color: 'secondary.main' }}
          >
            Subscribe Now
          </Button>
        </Container>
      </Box>
    </Box>
    </>
  );
}

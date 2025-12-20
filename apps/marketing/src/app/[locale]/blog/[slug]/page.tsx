import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import {
  Box,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  Chip,
  Paper,
  Divider,
} from '@neram/ui';
import Link from 'next/link';
import { locales } from '@/i18n';

interface PageProps {
  params: { locale: string; slug: string };
}

// Static blog posts data (will be replaced with database fetch)
const blogPosts: Record<string, {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  category: string;
  author: string;
  publishedAt: string;
  readTime: string;
  tags: string[];
}> = {
  'nata-2025-preparation-strategy': {
    slug: 'nata-2025-preparation-strategy',
    title: 'NATA 2025 Preparation Strategy: Complete Guide for Aspirants',
    excerpt: 'Learn the complete preparation strategy for NATA 2025 with expert tips on drawing, aptitude, and mathematics preparation.',
    content: `
## Introduction

The National Aptitude Test in Architecture (NATA) is the gateway to pursuing a career in architecture. With proper preparation and strategy, you can crack NATA with a top rank. This guide will help you understand the complete preparation strategy for NATA 2025.

## Understanding NATA 2025

NATA tests your aptitude for architecture through three main sections:
- **Mathematics (40 marks)**: Tests your mathematical ability
- **General Aptitude (80 marks)**: Tests reasoning and awareness
- **Drawing Test (80 marks)**: Tests your drawing and visualization skills

## Month-wise Preparation Plan

### Months 1-2: Foundation Building
- Complete NCERT Mathematics for Class 11-12
- Start daily sketching practice (minimum 1 hour)
- Learn basic architectural terminology
- Understand the exam pattern thoroughly

### Months 3-4: Core Preparation
- Complete the entire NATA syllabus
- Practice previous year papers
- Focus on 3D visualization
- Study famous architects and buildings

### Months 5-6: Intensive Practice
- Take weekly mock tests
- Analyze mistakes thoroughly
- Time-bound practice sessions
- Focus on weak areas

## Key Tips for Success

1. **Practice Drawing Daily**: The drawing section carries 80 marks. Dedicate at least 2 hours daily.
2. **Master Perspective**: Perspective drawing is crucial. Practice 1-point, 2-point, and 3-point perspectives.
3. **Time Management**: Practice with strict time limits from the beginning.
4. **Stay Updated**: Know about current architectural trends and famous buildings.

## Conclusion

With dedicated preparation and the right strategy, you can achieve a top rank in NATA 2025. Join Neram Classes for expert guidance and comprehensive preparation.
    `,
    category: 'Preparation',
    author: 'Neram Classes',
    publishedAt: '2025-01-15',
    readTime: '8 min read',
    tags: ['NATA 2025', 'Preparation Strategy', 'Study Tips'],
  },
  'top-10-drawing-techniques-nata': {
    slug: 'top-10-drawing-techniques-nata',
    title: 'Top 10 Drawing Techniques Every NATA Aspirant Must Master',
    excerpt: 'Master these essential drawing techniques to score high in the NATA drawing section. Expert tips from our faculty.',
    content: `
## Introduction

The drawing section in NATA carries 80 marks out of 200, making it crucial for your success. Here are the top 10 drawing techniques you must master.

## 1. Perspective Drawing

Understanding perspective is fundamental to architectural drawing. Master:
- One-point perspective
- Two-point perspective
- Three-point perspective

## 2. Freehand Sketching

Practice sketching objects without rulers. This improves your:
- Hand-eye coordination
- Speed
- Artistic expression

## 3. Shading Techniques

Learn different shading methods:
- Hatching
- Cross-hatching
- Stippling
- Blending

## 4. Proportions and Scale

Understanding proportions helps in:
- Human figure drawing
- Object relationships
- Spatial compositions

## 5. Light and Shadow

Master the interplay of:
- Direct light
- Ambient light
- Cast shadows
- Core shadows

## 6. Composition Skills

Learn to compose your drawings with:
- Balance
- Focal points
- Negative space

## 7. Texture Rendering

Practice depicting different textures:
- Wood grain
- Brick patterns
- Glass reflections
- Metal surfaces

## 8. Memory Drawing

Practice drawing objects from memory:
- Common objects
- Architectural elements
- Human figures

## 9. Creative Visualization

Develop your imagination for:
- Abstract concepts
- Story-based drawings
- Design problems

## 10. Speed Drawing

Practice completing drawings within time limits:
- Quick sketches
- Timed exercises
- Mock test practice

## Conclusion

Regular practice of these techniques will significantly improve your NATA drawing score. Join Neram Classes for guided practice sessions.
    `,
    category: 'Drawing',
    author: 'Neram Classes',
    publishedAt: '2025-01-10',
    readTime: '6 min read',
    tags: ['Drawing', 'NATA Tips', 'Techniques'],
  },
};

// Generate static params for blog posts
export function generateStaticParams() {
  const params: { locale: string; slug: string }[] = [];
  for (const locale of locales) {
    for (const slug of Object.keys(blogPosts)) {
      params.push({ locale, slug });
    }
  }
  return params;
}

// Generate metadata
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const post = blogPosts[params.slug];
  if (!post) return {};

  return {
    title: `${post.title} | Neram Classes Blog`,
    description: post.excerpt,
    keywords: post.tags.join(', '),
    alternates: {
      canonical: `https://neramclasses.com/en/blog/${params.slug}`,
    },
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: 'article',
      publishedTime: post.publishedAt,
      authors: [post.author],
    },
  };
}

export default function BlogPostPage({ params: { locale, slug } }: PageProps) {
  setRequestLocale(locale);

  const post = blogPosts[slug];
  if (!post) {
    notFound();
  }

  // Get related posts (same category, different slug)
  const relatedPosts = Object.values(blogPosts)
    .filter((p) => p.category === post.category && p.slug !== slug)
    .slice(0, 2);

  return (
    <Box>
      {/* Hero Section */}
      <Box
        sx={{
          py: { xs: 6, md: 10 },
          background: 'linear-gradient(135deg, #ec407a 0%, #d81b60 100%)',
          color: 'white',
        }}
      >
        <Container maxWidth="md">
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <Chip label={post.category} sx={{ bgcolor: 'white', color: 'secondary.main' }} />
            <Chip label={post.readTime} sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }} />
          </Box>
          <Typography variant="h1" component="h1" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '2rem', md: '2.5rem' } }}>
            {post.title}
          </Typography>
          <Typography variant="body1" sx={{ opacity: 0.9, mb: 2 }}>
            {post.author} • {new Date(post.publishedAt).toLocaleDateString('en-IN', { dateStyle: 'long' })}
          </Typography>
        </Container>
      </Box>

      {/* Article Content */}
      <Box sx={{ py: { xs: 4, md: 8 } }}>
        <Container maxWidth="md">
          <Paper sx={{ p: { xs: 3, md: 6 } }}>
            {/* Render content as simple paragraphs (in production, use MDX or rich text renderer) */}
            {post.content.split('\n').map((line, index) => {
              if (line.startsWith('## ')) {
                return (
                  <Typography key={index} variant="h4" component="h2" gutterBottom sx={{ mt: 4, fontWeight: 600 }}>
                    {line.replace('## ', '')}
                  </Typography>
                );
              }
              if (line.startsWith('### ')) {
                return (
                  <Typography key={index} variant="h5" component="h3" gutterBottom sx={{ mt: 3, fontWeight: 600 }}>
                    {line.replace('### ', '')}
                  </Typography>
                );
              }
              if (line.startsWith('- ')) {
                return (
                  <Typography key={index} variant="body1" component="li" sx={{ ml: 3, mb: 1 }}>
                    {line.replace('- ', '')}
                  </Typography>
                );
              }
              if (line.trim()) {
                return (
                  <Typography key={index} variant="body1" paragraph>
                    {line}
                  </Typography>
                );
              }
              return null;
            })}

            <Divider sx={{ my: 4 }} />

            {/* Tags */}
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 4 }}>
              {post.tags.map((tag, index) => (
                <Chip key={index} label={tag} variant="outlined" size="small" />
              ))}
            </Box>

            {/* Share & CTA */}
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Button variant="contained" component={Link} href="/apply">
                Join Neram Classes
              </Button>
              <Button variant="outlined" component={Link} href="/blog">
                More Articles
              </Button>
            </Box>
          </Paper>
        </Container>
      </Box>

      {/* Related Posts */}
      {relatedPosts.length > 0 && (
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="lg">
            <Typography variant="h2" component="h2" gutterBottom sx={{ fontWeight: 700, mb: 4 }}>
              Related Articles
            </Typography>
            <Grid container spacing={4}>
              {relatedPosts.map((relatedPost, index) => (
                <Grid item xs={12} md={6} key={index}>
                  <Card
                    component={Link}
                    href={`/blog/${relatedPost.slug}`}
                    sx={{
                      height: '100%',
                      textDecoration: 'none',
                      transition: 'transform 0.2s',
                      '&:hover': { transform: 'translateY(-4px)' },
                    }}
                  >
                    <CardContent sx={{ p: 4 }}>
                      <Chip label={relatedPost.category} size="small" sx={{ mb: 2 }} />
                      <Typography variant="h5" component="h3" gutterBottom sx={{ fontWeight: 600 }}>
                        {relatedPost.title}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {relatedPost.excerpt}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>
      )}

      {/* Newsletter CTA */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'secondary.main', color: 'white', textAlign: 'center' }}>
        <Container maxWidth="md">
          <Typography variant="h3" component="h2" gutterBottom sx={{ fontWeight: 700 }}>
            Start Your NATA Journey Today
          </Typography>
          <Typography variant="h6" sx={{ mb: 4, opacity: 0.9 }}>
            Join Neram Classes for expert coaching and comprehensive preparation
          </Typography>
          <Button
            variant="contained"
            size="large"
            component={Link}
            href="/apply"
            sx={{ bgcolor: 'white', color: 'secondary.main' }}
          >
            Enroll Now
          </Button>
        </Container>
      </Box>
    </Box>
  );
}

import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Button,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@neram/ui';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema, generateFAQSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import { APP_URL } from '@/lib/seo/constants';
import LastUpdatedBadge from '@/components/nata/LastUpdatedBadge';
import Breadcrumbs from '@/components/seo/Breadcrumbs';


export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'Best Books for NATA 2026 Preparation — Section-wise Recommendations',
    description:
      'Expert-recommended books for NATA 2026 preparation. Section-wise book list for Drawing, Mathematics, and General Aptitude. Includes free resources and study materials.',
    keywords:
      'best books for NATA, NATA preparation books, NATA drawing books, NATA mathematics books, NATA study material',
    alternates: buildAlternates(locale, '/nata-2026/best-books'),
  };
}

interface PageProps {
  params: { locale: string };
}

const drawingBooks = [
  {
    title: 'Architecture: Form, Space and Order',
    author: 'Francis D.K. Ching',
    why: 'The definitive reference for understanding architectural form and spatial relationships. Excellent for developing visual vocabulary and composition skills needed in Part A.',
    price: 'Rs. 800–1,200',
  },
  {
    title: 'Architectural Graphics',
    author: 'Francis D.K. Ching',
    why: 'Covers graphic communication techniques including lettering, line weights, rendering, and perspective drawing. Essential for improving drawing quality and presentation.',
    price: 'Rs. 600–900',
  },
  {
    title: 'Design Drawing',
    author: 'Francis D.K. Ching',
    why: 'Bridges the gap between design thinking and drawing skills. Teaches how to translate ideas into visual representations — a core NATA skill.',
    price: 'Rs. 700–1,000',
  },
  {
    title: 'Perspective Made Easy',
    author: 'Ernest Norling',
    why: 'A beginner-friendly guide to understanding perspective drawing. Helps with drawing buildings, interiors, and environments accurately in NATA sketching questions.',
    price: 'Rs. 200–400',
  },
  {
    title: 'Keys to Drawing',
    author: 'Bert Dodson',
    why: 'Practical exercises for improving observational drawing skills. Great for developing the quick sketching ability needed in the 30-minute drawing questions.',
    price: 'Rs. 400–600',
  },
];

const mathBooks = [
  {
    title: 'RD Sharma Class 11 & 12 Mathematics',
    author: 'R.D. Sharma',
    why: 'Comprehensive coverage of algebra, trigonometry, coordinate geometry, and calculus. The problem variety builds strong fundamentals for NATA numerical ability questions.',
    price: 'Rs. 500–700 (per volume)',
  },
  {
    title: 'NCERT Mathematics (Class 11 & 12)',
    author: 'NCERT',
    why: 'The foundation for all competitive exam math. NATA questions are often based on NCERT-level concepts. Start here before moving to advanced books.',
    price: 'Rs. 100–200 (per volume)',
  },
  {
    title: 'Problems in General Physics',
    author: 'I.E. Irodov',
    why: 'For advanced students who want to strengthen problem-solving skills. The physics-math overlap questions help with spatial and analytical thinking.',
    price: 'Rs. 300–500',
  },
];

const aptitudeBooks = [
  {
    title: 'Verbal & Non-Verbal Reasoning',
    author: 'R.S. Aggarwal',
    why: 'The go-to book for visual reasoning, mirror images, paper folding, figure completion, and pattern recognition — all tested in NATA Part B.',
    price: 'Rs. 400–600',
  },
  {
    title: 'A Modern Approach to Logical Reasoning',
    author: 'R.S. Aggarwal',
    why: 'Covers logical sequences, deductions, and analytical reasoning. Helps develop the critical thinking skills tested in NATA\'s design sensitivity section.',
    price: 'Rs. 300–500',
  },
  {
    title: 'General Knowledge',
    author: 'Lucent\'s Publications',
    why: 'Covers architecture awareness, famous buildings, historical progressions, and current affairs — all tested in NATA\'s General Knowledge section.',
    price: 'Rs. 200–300',
  },
];

const completeGuides = [
  {
    title: 'A Complete Self Study Guide for B.Arch',
    author: 'P.K. Mishra',
    why: 'The most popular all-in-one NATA preparation book. Covers drawing, aptitude, mathematics, and includes practice papers. Best for self-study students.',
    price: 'Rs. 500–700',
  },
  {
    title: 'NATA & B.Arch Complete Guide',
    author: 'Arihant Publications',
    why: 'Comprehensive guide with topic-wise theory, solved examples, and practice questions. Includes previous year question analysis and mock tests.',
    price: 'Rs. 400–600',
  },
];

const faqs = [
  {
    question: 'Which single book is best for NATA preparation?',
    answer:
      'If you can only buy one book, go with "A Complete Self Study Guide for B.Arch" by P.K. Mishra. It covers all three sections — drawing, mathematics, and general aptitude — with practice questions. However, for best results, supplement it with Francis Ching\'s books for drawing and RS Aggarwal for reasoning.',
  },
  {
    question: 'Are NCERT books enough for NATA mathematics?',
    answer:
      'NCERT books cover the fundamental concepts well and many NATA questions are based on NCERT-level math. However, for thorough preparation, supplement with RD Sharma for more practice problems. Focus on algebra, trigonometry, coordinate geometry, and basic calculus.',
  },
  {
    question: 'Do I need to buy all the books listed here?',
    answer:
      'No. Pick 1-2 books per section based on your weak areas. If you are strong in math, skip the advanced books. If drawing is your weakness, invest in Francis Ching\'s books. The complete guides (PK Mishra or Arihant) are good starting points for most students.',
  },
  {
    question: 'Are there free study materials for NATA preparation?',
    answer:
      'Yes. Neram Classes provides free study materials including a question bank, topic-wise practice questions, and drawing references through the student app at app.neramclasses.com. NCERT textbooks are also available for free download from ncert.nic.in.',
  },
  {
    question: 'How early should I start reading these books for NATA?',
    answer:
      'Start at least 3-4 months before the exam for a comfortable pace. Begin with NCERT math and general aptitude books, then move to drawing practice and specialized books. The last month should focus on mock tests and previous year papers rather than new theory.',
  },
];

export default function BestBooksPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);
  const baseUrl = 'https://neramclasses.com';
  const localeUrl = (path: string) => locale === 'en' ? `${baseUrl}${path}` : `${baseUrl}/${locale}${path}`;

  const renderBookList = (books: typeof drawingBooks) => (
    <>
      {books.map((book, idx) => (
        <Card key={idx} sx={{ mb: 2 }}>
          <CardContent sx={{ p: { xs: 3, md: 4 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1, flexWrap: 'wrap' }}>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>{book.title}</Typography>
              <Chip label={book.price} size="small" variant="outlined" />
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontStyle: 'italic' }}>
              by {book.author}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.8 }}>
              {book.why}
            </Typography>
          </CardContent>
        </Card>
      ))}
    </>
  );

  return (
    <>
      <JsonLd data={generateBreadcrumbSchema([{ name: 'Home', url: localeUrl('') }, { name: 'NATA 2026', url: localeUrl('/nata-2026') }, { name: 'Best Books' }])} />
      <JsonLd data={generateFAQSchema(faqs)} />

      <Box>
        {/* Hero */}
        <Box sx={{ py: { xs: 8, md: 12 }, background: 'linear-gradient(135deg, #1a237e 0%, #0d47a1 100%)', color: 'white' }}>
          <Container maxWidth="lg">
            <Breadcrumbs
              variant="light"
              items={[
                { name: 'Home', href: `/${locale}` },
                { name: 'NATA 2026', href: `/${locale}/nata-2026` },
                { name: 'Best Books' },
              ]}
            />
            <Chip label="NATA 2026" sx={{ bgcolor: 'white', color: 'primary.main', mb: 2, fontWeight: 600 }} />
            <Typography variant="h1" component="h1" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '2rem', sm: '2.5rem', md: '3.5rem' } }}>
              Best Books for NATA 2026 Preparation
            </Typography>
            <Typography variant="h5" sx={{ mb: 2, opacity: 0.9, fontSize: { xs: '1.1rem', md: '1.5rem' } }}>
              The best books for NATA 2026 preparation include &ldquo;A Complete Self Study Guide for B.Arch&rdquo; by PK Mishra for overall preparation, &ldquo;Verbal &amp; Non-Verbal Reasoning&rdquo; by RS Aggarwal for aptitude, and &ldquo;Architectural Graphics&rdquo; by Francis Ching for drawing skills. Combine these with daily practice and mock tests for best results.
            </Typography>
            <LastUpdatedBadge date="March 13, 2026" />
          </Container>
        </Box>

        {/* Drawing & Composition Books */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" gutterBottom sx={{ mb: 2, fontWeight: 700 }}>
              Drawing &amp; Composition Books
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4, lineHeight: 1.8 }}>
              Part A (Drawing Test) carries 80 marks. These books will help you develop strong sketching, composition, and perspective skills.
            </Typography>
            {renderBookList(drawingBooks)}
          </Container>
        </Box>

        {/* Mathematics Books */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" gutterBottom sx={{ mb: 2, fontWeight: 700 }}>
              Mathematics Books
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4, lineHeight: 1.8 }}>
              The Numerical Ability section in Part B tests algebra, trigonometry, coordinate geometry, and basic calculus. These books cover all required topics.
            </Typography>
            {renderBookList(mathBooks)}
          </Container>
        </Box>

        {/* General Aptitude Books */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" gutterBottom sx={{ mb: 2, fontWeight: 700 }}>
              General Aptitude Books
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4, lineHeight: 1.8 }}>
              Part B includes visual reasoning, design sensitivity, language interpretation, and general knowledge about architecture. These books cover all aptitude areas.
            </Typography>
            {renderBookList(aptitudeBooks)}
          </Container>
        </Box>

        {/* Complete NATA Guides */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" gutterBottom sx={{ mb: 2, fontWeight: 700 }}>
              Complete NATA Guides
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4, lineHeight: 1.8 }}>
              These all-in-one guides cover drawing, mathematics, and aptitude in a single book. Best for students who want a structured, comprehensive resource.
            </Typography>
            {renderBookList(completeGuides)}
          </Container>
        </Box>

        {/* Free Resources CTA */}
        <Box sx={{ py: { xs: 4, md: 6 }, bgcolor: 'background.default', textAlign: 'center' }}>
          <Container maxWidth="md">
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>Free Study Materials</Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              Access free NATA study materials, question banks, and drawing references through the Neram Classes student app.
            </Typography>
            <Button variant="contained" size="large" component="a" href={`${APP_URL}/tools/nata/question-bank`} target="_blank" rel="noopener noreferrer">
              Access Free Resources
            </Button>
          </Container>
        </Box>

        {/* Also Read */}
        <Box sx={{ py: { xs: 6, md: 8 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="md">
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>Also Read</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              {[
                { title: 'NATA 2026 Syllabus', slug: 'syllabus' },
                { title: 'Preparation Tips', slug: 'preparation-tips' },
                { title: 'Previous Year Papers', slug: 'previous-year-papers' },
                { title: 'NATA 2026 Exam Pattern', slug: 'exam-pattern' },
              ].map((item) => (
                <Link key={item.slug} href={`/${locale}/nata-2026/${item.slug}`} style={{ textDecoration: 'none' }}>
                  <Card sx={{ p: 2, color: 'inherit', transition: 'box-shadow 0.2s', '&:hover': { boxShadow: 3 } }}>
                    <Typography variant="subtitle1" color="primary.main" sx={{ fontWeight: 600 }}>{item.title} &rarr;</Typography>
                  </Card>
                </Link>
              ))}
            </Box>
          </Container>
        </Box>

        {/* FAQ */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 4, fontWeight: 700 }}>FAQs — Best Books for NATA</Typography>
            {faqs.map((faq, index) => (
              <Accordion key={index} disableGutters sx={{ '&:before': { display: 'none' }, mb: 1, borderRadius: 1, overflow: 'hidden' }}>
                <AccordionSummary expandIcon={<Typography sx={{ fontSize: '1.2rem', fontWeight: 600 }}>+</Typography>} sx={{ bgcolor: 'white', '&:hover': { bgcolor: 'grey.100' } }}>
                  <Typography sx={{ fontWeight: 600 }}>{faq.question}</Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ bgcolor: 'white' }}>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.8 }}>{faq.answer}</Typography>
                </AccordionDetails>
              </Accordion>
            ))}
          </Container>
        </Box>

        {/* CTA Banner */}
        <Box sx={{ py: { xs: 6, md: 10 }, background: 'linear-gradient(135deg, #0d47a1 0%, #1565c0 100%)', color: 'white', textAlign: 'center' }}>
          <Container maxWidth="md">
            <Typography variant="h3" component="h2" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '1.75rem', md: '2.5rem' } }}>
              Prepare for NATA 2026 with Neram Classes
            </Typography>
            <Typography variant="h6" sx={{ mb: 4, opacity: 0.9 }}>Expert coaching with structured study plans and curated resources.</Typography>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button variant="contained" size="large" component={Link} href="/apply" sx={{ background: '#ffffff', color: '#0d47a1', fontWeight: 700, px: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', '&:hover': { background: '#f0f0f0' } }}>Start Free Trial</Button>
              <Button variant="outlined" size="large" component={Link} href={`/${locale}/nata-2026`} sx={{ borderColor: 'white', color: 'white' }}>Back to NATA 2026 Guide</Button>
            </Box>
          </Container>
        </Box>
      </Box>
    </>
  );
}

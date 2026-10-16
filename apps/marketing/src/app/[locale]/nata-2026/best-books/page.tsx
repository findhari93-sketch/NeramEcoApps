import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Box } from '@neram/ui';
import AutoStoriesOutlinedIcon from '@mui/icons-material/AutoStoriesOutlined';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema, generateFAQSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import { APP_URL } from '@/lib/seo/constants';
import { nataGuideNav, nataRelated } from '@/components/nata/guideNav';
import { ArticleSection, CtaBand, CtaButton, FaqList, GuideArticle, InfoCard, InlineCta, tokens } from '@/design-system';


export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'Best Books for NATA 2026 Preparation: Section-wise Recommendations',
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

interface Book {
  title: string;
  author: string;
  why: string;
  price: string;
}

const drawingBooks: Book[] = [
  {
    title: 'Architecture: Form, Space and Order',
    author: 'Francis D.K. Ching',
    why: 'The definitive reference for understanding architectural form and spatial relationships. Excellent for developing visual vocabulary and composition skills needed in Part A.',
    price: 'Rs. 800-1,200',
  },
  {
    title: 'Architectural Graphics',
    author: 'Francis D.K. Ching',
    why: 'Covers graphic communication techniques including lettering, line weights, rendering, and perspective drawing. Essential for improving drawing quality and presentation.',
    price: 'Rs. 600-900',
  },
  {
    title: 'Design Drawing',
    author: 'Francis D.K. Ching',
    why: 'Bridges the gap between design thinking and drawing skills. Teaches how to translate ideas into visual representations, a core NATA skill.',
    price: 'Rs. 700-1,000',
  },
  {
    title: 'Perspective Made Easy',
    author: 'Ernest Norling',
    why: 'A beginner-friendly guide to understanding perspective drawing. Helps with drawing buildings, interiors, and environments accurately in NATA sketching questions.',
    price: 'Rs. 200-400',
  },
  {
    title: 'Keys to Drawing',
    author: 'Bert Dodson',
    why: 'Practical exercises for improving observational drawing skills. Great for developing the quick sketching ability needed in the 30-minute drawing questions.',
    price: 'Rs. 400-600',
  },
];

const mathBooks: Book[] = [
  {
    title: 'RD Sharma Class 11 & 12 Mathematics',
    author: 'R.D. Sharma',
    why: 'Comprehensive coverage of algebra, trigonometry, coordinate geometry, and calculus. The problem variety builds strong fundamentals for NATA numerical ability questions.',
    price: 'Rs. 500-700 (per volume)',
  },
  {
    title: 'NCERT Mathematics (Class 11 & 12)',
    author: 'NCERT',
    why: 'The foundation for all competitive exam math. NATA questions are often based on NCERT-level concepts. Start here before moving to advanced books.',
    price: 'Rs. 100-200 (per volume)',
  },
  {
    title: 'Problems in General Physics',
    author: 'I.E. Irodov',
    why: 'For advanced students who want to strengthen problem-solving skills. The physics-math overlap questions help with spatial and analytical thinking.',
    price: 'Rs. 300-500',
  },
];

const aptitudeBooks: Book[] = [
  {
    title: 'Verbal & Non-Verbal Reasoning',
    author: 'R.S. Aggarwal',
    why: 'The go-to book for visual reasoning, mirror images, paper folding, figure completion, and pattern recognition. All tested in NATA Part B.',
    price: 'Rs. 400-600',
  },
  {
    title: 'A Modern Approach to Logical Reasoning',
    author: 'R.S. Aggarwal',
    why: 'Covers logical sequences, deductions, and analytical reasoning. Helps develop the critical thinking skills tested in NATA\'s design sensitivity section.',
    price: 'Rs. 300-500',
  },
  {
    title: 'General Knowledge',
    author: 'Lucent\'s Publications',
    why: 'Covers architecture awareness, famous buildings, historical progressions, and current affairs. All tested in NATA\'s General Knowledge section.',
    price: 'Rs. 200-300',
  },
];

const completeGuides: Book[] = [
  {
    title: 'A Complete Self Study Guide for B.Arch',
    author: 'P.K. Mishra',
    why: 'The most popular all-in-one NATA preparation book. Covers drawing, aptitude, mathematics, and includes practice papers. Best for self-study students.',
    price: 'Rs. 500-700',
  },
  {
    title: 'NATA & B.Arch Complete Guide',
    author: 'Arihant Publications',
    why: 'Comprehensive guide with topic-wise theory, solved examples, and practice questions. Includes previous year question analysis and mock tests.',
    price: 'Rs. 400-600',
  },
];

const faqs = [
  {
    question: 'Which single book is best for NATA preparation?',
    answer:
      'If you can only buy one book, go with "A Complete Self Study Guide for B.Arch" by P.K. Mishra. It covers all three sections: drawing, mathematics, and general aptitude, with practice questions. However, for best results, supplement it with Francis Ching\'s books for drawing and RS Aggarwal for reasoning.',
  },
  {
    question: 'Are NCERT books enough for NATA mathematics?',
    answer:
      'NCERT books cover the fundamental concepts well and many NATA questions are based on NCERT-level math. However, for thorough preparation, supplement with RD Sharma for more practice problems. Focus on algebra, trigonometry, coordinate geometry, and basic calculus.',
  },
  {
    question: 'Do I need to buy all the books listed here?',
    answer:
      'No. Pick 1-2 books per section based on your weak areas. If you are strong in math, skip the advanced books. If drawing is your weakness, invest in Francis Ching\'s books. The complete guides by PK Mishra or Arihant are good starting points for most students.',
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

function BookList({ books }: { books: Book[] }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {books.map((book) => (
        <InfoCard key={book.title} title={book.title} meta={book.price}>
          <Box component="span" sx={{ display: 'block', mb: 0.5, fontStyle: 'italic', color: tokens.ink }}>
            by {book.author}
          </Box>
          {book.why}
        </InfoCard>
      ))}
    </Box>
  );
}

export default function BestBooksPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);
  const baseUrl = 'https://neramclasses.com';
  const localeUrl = (path: string) => locale === 'en' ? `${baseUrl}${path}` : `${baseUrl}/${locale}${path}`;

  return (
    <>
      <JsonLd data={generateBreadcrumbSchema([{ name: 'Home', url: localeUrl('') }, { name: 'NATA 2026', url: localeUrl('/nata-2026') }, { name: 'Best Books' }])} />
      <JsonLd data={generateFAQSchema(faqs)} />

      <GuideArticle
        breadcrumb={[{ name: 'Home', href: '/' }, { name: 'NATA 2026', href: '/nata-2026' }, { name: 'Best Books' }]}
        eyebrow="NATA 2026 · Exam guide"
        title="Best Books for NATA 2026 Preparation"
        lede="The best books for NATA 2026 preparation include “A Complete Self Study Guide for B.Arch” by PK Mishra for overall preparation, “Verbal & Non-Verbal Reasoning” by RS Aggarwal for aptitude, and “Architectural Graphics” by Francis Ching for drawing skills. Combine these with daily practice and mock tests for best results."
        verified="Updated March 13, 2026 · Source: Official NATA 2026 Brochure V1.0"
        nav={nataGuideNav('best-books')}
        related={nataRelated(['syllabus', 'preparation-tips', 'previous-year-papers', 'exam-pattern'])}
        back={{ label: 'Back to NATA 2026 guide', href: '/nata-2026' }}
      >
        <ArticleSection
          id="drawing-books"
          title="Drawing & Composition Books"
          intro="Part A (Drawing Test) carries 80 marks. These books will help you develop strong sketching, composition, and perspective skills."
        >
          <BookList books={drawingBooks} />
        </ArticleSection>

        <ArticleSection
          id="mathematics-books"
          title="Mathematics Books"
          intro="The Numerical Ability section in Part B tests algebra, trigonometry, coordinate geometry, and basic calculus. These books cover all required topics."
        >
          <BookList books={mathBooks} />
        </ArticleSection>

        <InlineCta
          eyebrow="Free resources"
          icon={<AutoStoriesOutlinedIcon />}
          title="Free Study Materials"
          body="Access free NATA study materials, question banks, and drawing references through the Neram Classes student app."
          action={
            <CtaButton href={`${APP_URL}/tools/nata/question-bank`} external>
              Access Free Resources
            </CtaButton>
          }
        />

        <ArticleSection
          id="aptitude-books"
          title="General Aptitude Books"
          intro="Part B includes visual reasoning, design sensitivity, language interpretation, and general knowledge about architecture. These books cover all aptitude areas."
        >
          <BookList books={aptitudeBooks} />
        </ArticleSection>

        <ArticleSection
          id="complete-guides"
          title="Complete NATA Guides"
          intro="These all-in-one guides cover drawing, mathematics, and aptitude in a single book. Best for students who want a structured, comprehensive resource."
        >
          <BookList books={completeGuides} />
        </ArticleSection>

        <ArticleSection id="faq" title="FAQs: Best Books for NATA">
          <FaqList items={faqs} defaultOpen={-1} />
        </ArticleSection>
      </GuideArticle>

      <CtaBand
        title="Prepare for NATA 2026 with Neram Classes"
        lede="Expert coaching with structured study plans and curated resources."
        actions={
          <>
            <CtaButton href="/apply">Start Free Trial</CtaButton>
            <CtaButton variant="link" href="/demo-class">
              Book a free demo class
            </CtaButton>
          </>
        }
      />
    </>
  );
}

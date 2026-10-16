import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Box } from '@neram/ui';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema, generateFAQSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import { APP_URL } from '@/lib/seo/constants';
import { nataGuideNav, nataRelated } from '@/components/nata/guideNav';
import { ArticleSection, CtaBand, CtaButton, FaqList, GuideArticle, InfoCard, InlineCta, TopicCard } from '@/design-system';


export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'NATA 2026 Syllabus: Simplified Topics with Sample Questions',
    description:
      'Complete NATA 2026 syllabus for Part A (Drawing Test) and Part B (MCQ/NCQ). Topic-wise breakdown with simplified explanations. Includes important topics and preparation tips.',
    keywords:
      'NATA 2026 syllabus, NATA syllabus topics, NATA Part A syllabus, NATA Part B syllabus, NATA drawing test syllabus, NATA MCQ topics',
    alternates: buildAlternates(locale, '/nata-2026/syllabus'),
  };
}

interface PageProps {
  params: { locale: string };
}

const partATopics = [
  {
    code: 'A1',
    title: 'Composition and Color',
    marks: '25 marks',
    desc: 'Creating suitable compositions for various situations and coloring them appropriately. Re-arranging various shapes in a visually appealing manner and coloring it suitably. Tests your sense of color harmony and composition skills.',
  },
  {
    code: 'A2',
    title: 'Sketching & Composition, Black and White',
    marks: '25 marks',
    desc: 'Ability to draw, visualize, and depict a situation involving buildings/its components, people, environment, and products with an understanding of scale, proportions, textures, shades, and shadow.',
  },
  {
    code: 'A3',
    title: '3D Composition',
    marks: '30 marks',
    desc: 'Creating interesting 3D compositions for a given situation using a kit provided at the test center. This is a new format that tests your spatial thinking and ability to work with physical materials in three dimensions.',
  },
];

const partBTopics = [
  {
    category: 'Visual Reasoning',
    topics: [
      'Understanding and reconstructing 2D and 3D compositions',
      'Knowledge about composition and technical concepts',
      'Mirror images, paper folding, figure completion',
      'Spatial visualization: 2D to 3D and vice versa',
    ],
  },
  {
    category: 'Logical Derivation',
    topics: [
      'Decoding a situation, composition, or context to generate meaning',
      'Understanding minute information hidden in a particular situation',
      'Drawing conclusions from given data or visual inputs',
      'Pattern recognition and logical sequences',
    ],
  },
  {
    category: 'General Knowledge, Architecture & Design',
    topics: [
      'General awareness of architecture and design, current issues',
      'Knowledge about important buildings and historical progression',
      'Innovation in materials and construction technology',
      'Famous architects and their contributions',
      'Urban planning basics and sustainability concepts',
    ],
  },
  {
    category: 'Language Interpretation',
    topics: [
      'Ability to correctly and logically generate meaning of words and sentences',
      'Understanding of English grammar',
      'Reading comprehension and inference',
    ],
  },
  {
    category: 'Design Sensitivity and Thinking',
    topics: [
      'Ability to observe, record, and analyse people, space, product, and environment',
      'Critical thinking, reasoning, and identifying subtle communications',
      'Understanding semantics and metaphors',
      'Problem identification, definition, and analysis of given situations',
    ],
  },
  {
    category: 'Numerical Ability',
    topics: [
      'Basic Mathematics and its association with creative thinking',
      'Unfolding space with use of geometry',
      'Algebra, trigonometry, coordinate geometry, calculus basics',
      'Statistics, probability, and number series',
    ],
  },
];

const faqs = [
  {
    question: 'Is NATA syllabus same as JEE Maths?',
    answer:
      'NATA 2026 Part B includes Numerical Ability which overlaps with basic Maths (algebra, trigonometry, geometry). However, NATA focuses more on visual reasoning, design sensitivity, language interpretation, and architecture awareness, areas JEE does not cover. Part A is entirely drawing-based.',
  },
  {
    question: 'How do I prepare for the 3D Composition question (A3)?',
    answer:
      'The 3D Composition question (30 marks) requires creating spatial compositions using a kit provided at the center. Practice with paper folding, origami, clay modeling, and geometric solids. Focus on understanding volume, space, and three-dimensional relationships.',
  },
  {
    question: 'What is the difference between MCQ and NCQ in Part B?',
    answer:
      'MCQ (Multiple Choice Questions) have 4 options to choose from, and there are 42 of these. NCQ (No Choice Questions) require you to type a numerical answer without any options, and there are 8 of these. Both types have no negative marking.',
  },
  {
    question: 'Are there negative marks in NATA?',
    answer:
      'No, there are no negative marks in NATA 2026. Both Part A (drawing & composition) and Part B (MCQ/NCQ) do not penalize for wrong answers, so attempt all questions.',
  },
  {
    question: 'What topics come under Design Sensitivity and Thinking?',
    answer:
      'This includes observation and analysis of people, space, products, and environment. Also covers critical thinking, reasoning, identifying subtle communications, understanding semantics and metaphors, problem identification and definition, and analysis of given situations.',
  },
];

export default function SyllabusPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);
  const baseUrl = 'https://neramclasses.com';
  const localeUrl = (path: string) => locale === 'en' ? `${baseUrl}${path}` : `${baseUrl}/${locale}${path}`;

  return (
    <>
      <JsonLd data={generateBreadcrumbSchema([{ name: 'Home', url: localeUrl('') }, { name: 'NATA 2026', url: localeUrl('/nata-2026') }, { name: 'Syllabus' }])} />
      <JsonLd data={generateFAQSchema(faqs)} />

      <GuideArticle
        breadcrumb={[{ name: 'Home', href: '/' }, { name: 'NATA 2026', href: '/nata-2026' }, { name: 'Syllabus' }]}
        eyebrow="NATA 2026 · Exam guide"
        title="NATA 2026 Syllabus"
        lede="NATA 2026 has two parts: Part A tests drawing skills (80 marks, offline) and Part B tests mathematics, general aptitude, and architecture awareness (120 marks, online). Here is the complete topic-wise syllabus."
        verified="Updated March 13, 2026 · Source: Official NATA 2026 Brochure V1.0"
        nav={nataGuideNav('syllabus')}
        related={nataRelated(['exam-pattern', 'scoring-and-results', 'dos-and-donts', 'cutoff-calculator'])}
        back={{ label: 'Back to NATA 2026 guide', href: '/nata-2026' }}
      >
        <ArticleSection
          id="part-a"
          title="Part A: Drawing Test (80 Marks)"
          intro="Part A is conducted offline on paper. You get 90 minutes to complete 3 questions. The test center provides paper/base material. You must bring: pencils, erasers, dry colors, and scale (up to 15 cm). No geometry box or other instruments allowed."
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {partATopics.map((topic) => (
              <InfoCard key={topic.code} code={topic.code} title={topic.title} meta={topic.marks} body={topic.desc} />
            ))}
          </Box>
        </ArticleSection>

        <ArticleSection
          id="part-b"
          title="Part B: MCQ/NCQ (120 Marks)"
          intro="Part B is conducted online in a computer-based adaptive test format. You get 90 minutes (108 seconds per question) to answer 50 questions: 42 MCQs (Multiple Choice) and 8 NCQs (No Choice / Numerical). No negative marking. Medium: English and Hindi."
        >
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 1.5 }}>
            {partBTopics.map((section) => (
              <TopicCard key={section.category} title={section.category} items={section.topics} />
            ))}
          </Box>
        </ArticleSection>

        <InlineCta
          eyebrow="Practise this syllabus"
          icon={<QuizOutlinedIcon />}
          title="Topic-wise NATA practice questions, free"
          action={
            <CtaButton href={`${APP_URL}/tools/nata/question-bank`} external>
              Open Question Bank
            </CtaButton>
          }
        />

        <ArticleSection id="faq" title="FAQs: NATA 2026 Syllabus">
          <FaqList items={faqs} defaultOpen={-1} />
        </ArticleSection>
      </GuideArticle>

      <CtaBand
        title="Prepare for NATA 2026 with Neram Classes"
        lede="Expert coaching for drawing and aptitude with proven results."
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

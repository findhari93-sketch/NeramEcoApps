import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Box, Typography } from '@neram/ui';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema, generateFAQSchema, generateHowToSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import { APP_URL } from '@/lib/seo/constants';
import { nataGuideNav, nataRelated } from '@/components/nata/guideNav';
import {
  ArticleSection,
  CheckList,
  CtaBand,
  CtaButton,
  FaqList,
  GuideArticle,
  InfoCard,
  InlineCta,
  StepList,
  TopicCard,
  tokens,
} from '@/design-system';


export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'NATA 2026 Drawing Test: Complete Guide to Scoring 80/80',
    description:
      'Complete guide to NATA 2026 Drawing Test (Part A). Covers all 3 sections: 2D Composition & Color (25 marks), 3D Composition (25 marks), and Visualization through Sketching (30 marks). Tips, marking scheme, and practice strategy.',
    keywords:
      'NATA drawing test, NATA 2026 drawing, NATA Part A, NATA 3D composition, NATA sketching, NATA drawing marks, NATA composition test',
    alternates: buildAlternates(locale, '/nata-2026/drawing-test'),
  };
}

interface PageProps {
  params: { locale: string };
}

const faqs = [
  {
    question: 'What is the NATA drawing test format in 2026?',
    answer:
      'The NATA 2026 drawing test (Part A) is 80 marks across 3 sections: 2D Composition & Colour (25 marks, 45 min), 3D Composition (25 marks, 45 min), and Visualization through Sketching (30 marks, 45 min). The total duration is 135 minutes and it is conducted offline on A4 drawing sheets.',
  },
  {
    question: 'What is the 3D Composition section in NATA?',
    answer:
      'Introduced in 2025, the 3D Composition section (25 marks) requires candidates to create a three-dimensional model or composition using a physical kit provided at the test center. It tests spatial understanding, form, structure, and the ability to think in three dimensions.',
  },
  {
    question: 'What materials can I bring to the NATA drawing test?',
    answer:
      'You can bring pencils (HB, 2B, 4B, 6B), erasers, sharpener, color pencils, crayons, geometry box (compass, set squares, protractor, scale), watercolors, poster colors, and sketch pens. Oil paints, acrylic paints, electronic gadgets, calculators, and reference materials are not allowed.',
  },
  {
    question: 'How is the NATA drawing test evaluated?',
    answer:
      'Drawing sheets are evaluated by a panel of expert evaluators from architecture and design backgrounds. Each sheet is assessed by multiple evaluators independently, and the average score is taken. Key factors include composition, creativity, proportion, perspective accuracy, use of color, and neatness.',
  },
  {
    question: 'How much time do I get for the drawing test?',
    answer:
      'You get 135 minutes total for Part A (Drawing Test). This is divided across 3 sections of approximately 45 minutes each: 2D Composition & Colour, 3D Composition, and Visualization through Sketching.',
  },
  {
    question: 'Can I use watercolors in the NATA drawing test?',
    answer:
      'Yes, watercolors and poster colors are allowed in the NATA drawing test. You may also use color pencils, crayons, and sketch pens. However, oil paints and acrylic paints are not permitted.',
  },
];

const howToSteps = [
  {
    name: 'Master Basic Composition',
    text: 'Learn the principles of 2D composition including balance, rhythm, contrast, harmony, and unity. Practice creating compositions with geometric shapes, organic forms, and color schemes daily.',
  },
  {
    name: 'Practice 3D Visualization',
    text: 'Practice drawing isometric views, perspective drawings (1-point, 2-point, and 3-point), and converting 2D plans/elevations into 3D sketches. Build small physical models to understand form and space.',
  },
  {
    name: 'Learn Color Theory',
    text: 'Study the color wheel, complementary colors, analogous colors, triadic color schemes, warm and cool colors. Practice applying color theory in your compositions for visual impact.',
  },
  {
    name: 'Practice Time Management',
    text: 'Set a strict 45-minute timer for each section during practice. Learn to plan your composition in the first 5 minutes, execute in 35 minutes, and refine in the last 5 minutes.',
  },
  {
    name: 'Attempt Mock Drawing Tests',
    text: 'Take full-length mock drawing tests under exam conditions using the same materials you will use in the actual exam. Get feedback from architecture professionals or experienced teachers.',
  },
];

const sections = [
  {
    code: 'A1',
    title: 'Section A1: 2D Composition & Colour',
    meta: '25 Marks · 45 Min',
    desc: 'Compose a 2D design using given elements such as shapes, colors, and themes. Tests your sense of composition, color harmony, and creative expression.',
    medium: 'Color pencils, crayons, watercolors, or poster colors on A4 sheet.',
  },
  {
    code: 'A2',
    title: 'Section A2: 3D Composition',
    meta: 'NEW · 25 Marks · 45 Min',
    desc: 'Create a 3D model or composition using a physical kit provided at the center. Introduced in 2025, this section tests spatial understanding, form, and structure.',
    medium: 'Physical kit provided at the exam center.',
  },
  {
    code: 'A3',
    title: 'Section A3: Visualization through Sketching',
    meta: '30 Marks · 45 Min',
    desc: 'Sketch a 3D perspective from given 2D plan and elevation views. Tests your ability to visualize three-dimensional forms from two-dimensional drawings.',
    medium: 'Pencils (HB, 2B, 4B, 6B) on A4 sheet.',
  },
];

const allowed = [
  'Pencils (HB, 2B, 4B, 6B)',
  'Erasers',
  'Sharpener',
  'Color pencils',
  'Crayons',
  'Geometry box (compass, set squares, protractor, scale)',
  'Watercolors',
  'Poster colors',
  'Sketch pens',
];

const notAllowed = ['Oil paints', 'Acrylic paints', 'Electronic gadgets', 'Calculators', 'Textbooks', 'Reference materials', 'Pre-drawn sheets'];

const evaluationFactors = [
  { title: 'Composition', body: 'Layout, balance, and visual hierarchy of the design' },
  { title: 'Creativity', body: 'Originality and imaginative use of given elements' },
  { title: 'Proportion', body: 'Accuracy of scale and relative sizes of objects' },
  { title: 'Perspective Accuracy', body: 'Correct representation of depth and 3D space' },
  { title: 'Use of Color', body: 'Effective application of color theory and harmony' },
  { title: 'Neatness', body: 'Clean execution, tidy lines, and overall presentation' },
];

const scoringTips = [
  { title: 'Practice daily', body: 'Draw at least 2-3 compositions per day. Consistency is more important than spending hours in one sitting.' },
  { title: 'Master 3D perspective', body: 'Practice isometric and perspective drawings (1-point, 2-point, 3-point). This is essential for Section A3.' },
  { title: 'Understand color theory', body: 'Learn complementary, analogous, and triadic color schemes. Good color use can significantly boost your Section A1 score.' },
  { title: 'Time management', body: 'Allocate 45 minutes per section strictly. Practice with a timer to build discipline.' },
  { title: 'Study architectural landmarks', body: 'Studying famous buildings and structures gives you a library of forms and compositions to draw from during the exam.' },
  { title: 'Practice with actual materials', body: 'Use the same pencils, colors, and drawing sheets you will use in the exam. Familiarity with your tools reduces exam-day anxiety.' },
];

const bodySx = { m: 0, fontSize: '1.0625rem', lineHeight: 1.7, color: tokens.ink } as const;

/** TopicCard layout for a "not allowed" list (block icon instead of a check). */
function NotAllowedCard({ title, items }: { title: string; items: string[] }) {
  return (
    <Box sx={{ bgcolor: tokens.surface, border: `1px solid ${tokens.line}`, borderRadius: `${tokens.radius}px`, p: 3, display: 'flex', flexDirection: 'column', gap: 1.5, color: tokens.ink }}>
      <Typography component="h3" sx={{ m: 0, fontSize: '1.125rem', fontWeight: 700, lineHeight: 1.3 }}>
        {title}
      </Typography>
      <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {items.map((item) => (
          <Box component="li" key={item} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', fontSize: '0.9375rem', lineHeight: 1.4 }}>
            <BlockOutlinedIcon aria-hidden sx={{ fontSize: 18, color: tokens.inkMuted, flexShrink: 0, mt: '1px' }} />
            {item}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export default function DrawingTestPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);
  const baseUrl = 'https://neramclasses.com';
  const localeUrl = (path: string) => locale === 'en' ? `${baseUrl}${path}` : `${baseUrl}/${locale}${path}`;

  return (
    <>
      <JsonLd
        data={generateBreadcrumbSchema([
          { name: 'Home', url: localeUrl('') },
          { name: 'NATA 2026', url: localeUrl('/nata-2026') },
          { name: 'Drawing Test' },
        ])}
      />
      <JsonLd data={generateFAQSchema(faqs)} />
      <JsonLd
        data={generateHowToSchema({
          name: 'How to Prepare for NATA Drawing Test',
          description:
            'Step-by-step preparation guide for the NATA 2026 Drawing Test (Part A) covering composition, 3D visualization, color theory, time management, and mock tests.',
          steps: howToSteps,
          totalTime: 'P90D',
        })}
      />

      <GuideArticle
        breadcrumb={[{ name: 'Home', href: '/' }, { name: 'NATA 2026', href: '/nata-2026' }, { name: 'Drawing Test' }]}
        eyebrow="NATA 2026 · Exam guide"
        title="NATA 2026 Drawing Test: Complete Guide"
        lede="The NATA 2026 Drawing Test (Part A) is worth 80 out of 200 marks and is conducted offline on A4 drawing sheets. It consists of 3 sections: 2D Composition & Colour (25 marks), 3D Composition (25 marks), and Visualization through Sketching (30 marks), with a total duration of 135 minutes."
        verified="Updated March 13, 2026 · Source: Official NATA 2026 Brochure V1.0"
        nav={nataGuideNav('drawing-test')}
        related={nataRelated(['syllabus', 'exam-pattern', 'dos-and-donts'])}
        back={{ label: 'Back to NATA 2026 guide', href: '/nata-2026' }}
      >
        <ArticleSection
          id="overview"
          title="Drawing Test Overview: Part A (80 Marks)"
          intro="The Drawing Test is the offline portion of NATA, conducted on physical A4 drawing sheets at the exam center. Unlike Part B (the online MCQ section), Part A tests your hands-on drawing, composition, and spatial visualization skills. It carries 80 out of 200 total marks and is divided into 3 distinct sections."
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {sections.map((s) => (
              <InfoCard key={s.code} code={s.code} title={s.title} meta={s.meta} body={s.desc}>
                <strong>Medium:</strong> {s.medium}
              </InfoCard>
            ))}
          </Box>
        </ArticleSection>

        <ArticleSection id="materials" title="Materials Allowed in the Drawing Test">
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 1.5 }}>
            <TopicCard title="Allowed" items={allowed} />
            <NotAllowedCard title="Not Allowed" items={notAllowed} />
          </Box>
        </ArticleSection>

        <ArticleSection
          id="evaluation"
          title="How the Drawing Test is Evaluated"
          intro="The drawing sheets are evaluated by a panel of expert evaluators from architecture and design backgrounds. Each drawing sheet is independently assessed by multiple evaluators, and the average score is taken to ensure fairness."
        >
          <ArticleSection id="evaluation-factors" as="h3" title="Key Evaluation Factors">
            <CheckList items={evaluationFactors} />
          </ArticleSection>
        </ArticleSection>

        <ArticleSection id="tips" title="Tips to Score High in NATA Drawing Test">
          <StepList items={scoringTips} columnMin={220} />
        </ArticleSection>

        <InlineCta
          eyebrow="Free tool"
          icon={<BrushOutlinedIcon />}
          title="Practice Drawing for NATA 2026"
          body="Use our free Drawing Practice tool with sample prompts, timer, and expert tips to sharpen your skills."
          action={
            <CtaButton href={`${APP_URL}/tools/nata/drawing-practice`} external>
              Start Drawing Practice (Free)
            </CtaButton>
          }
        />

        <ArticleSection id="faq" title="FAQs: NATA 2026 Drawing Test">
          <FaqList items={faqs} defaultOpen={-1} />
        </ArticleSection>
      </GuideArticle>

      <CtaBand
        title="Prepare for NATA 2026 with Neram Classes"
        lede="Expert coaching, free tools, and personalized guidance."
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

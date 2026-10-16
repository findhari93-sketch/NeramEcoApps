import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Box } from '@neram/ui';
import AppsOutlinedIcon from '@mui/icons-material/AppsOutlined';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema, generateFAQSchema, generateHowToSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import { APP_URL } from '@/lib/seo/constants';
import { nataGuideNav, nataRelated } from '@/components/nata/guideNav';
import { ArticleSection, CheckList, CtaBand, CtaButton, DataTable, FaqList, GuideArticle, InfoCard, InlineCta, tokens } from '@/design-system';


export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'NATA 2026 Preparation Tips: Expert Strategy & Study Plan',
    description:
      'Expert NATA 2026 preparation strategy with month-wise study plan. Section-wise tips for Drawing (80 marks), Mathematics & Aptitude (120 marks). Daily schedule, recommended resources, and common mistakes to avoid.',
    keywords:
      'NATA preparation tips, NATA study plan, how to prepare for NATA, NATA preparation strategy, NATA drawing tips, NATA 2026 preparation',
    alternates: buildAlternates(locale, '/nata-2026/preparation-tips'),
  };
}

interface PageProps {
  params: { locale: string };
}

const faqs = [
  {
    question: 'How many months should I prepare for NATA?',
    answer:
      'At least 6 months of dedicated preparation is recommended for NATA 2026. This gives you enough time to build drawing fundamentals (2 months), practice and improve (2 months), and take mock tests with focused revision (2 months). Students who start earlier can afford a more relaxed schedule.',
  },
  {
    question: 'How many hours should I study daily for NATA?',
    answer:
      '3-4 hours of focused daily study is ideal. Split your time with 1.5 hours on drawing practice, 1.5 hours on mathematics, and 1 hour on general aptitude and revision. Consistency matters more than long hours. Studying 3 hours daily for 6 months beats 8 hours daily for 2 months.',
  },
  {
    question: 'Should I join coaching for NATA preparation?',
    answer:
      'While self-study is possible with discipline, professional coaching provides structured guidance, expert feedback on drawings, curated mock tests, and peer learning. Coaching is especially helpful for the drawing section where subjective evaluation makes self-assessment difficult. Neram Classes offers both online and offline NATA coaching.',
  },
  {
    question: 'What is the best way to prepare for the NATA drawing test?',
    answer:
      'Practice daily compositions with themes like urban scenes, nature, abstract concepts, and architectural spaces. Study famous architectural landmarks and their design elements. Master color theory and shading techniques. Practice 3D visualization and perspective drawing. Time yourself, as you get limited time per drawing in the actual exam.',
  },
  {
    question: 'Can I prepare for NATA and JEE Paper 2 simultaneously?',
    answer:
      'Yes, there is significant overlap between NATA and JEE Paper 2 (B.Arch). Both test drawing ability, mathematical aptitude, and general awareness. The mathematics syllabus is largely common. However, JEE Paper 2 has a slightly different drawing format. Preparing for both together is efficient. Just practice the specific drawing formats of each exam separately.',
  },
  {
    question: 'What score should I target in NATA 2026?',
    answer:
      'Aim for 140+ out of 200 for admission to top architecture colleges. The drawing section (80 marks) is where most students can maximize scores with consistent practice. For mathematics and aptitude (120 marks), target 80+ by focusing on accuracy over speed. A balanced performance across both sections is key.',
  },
];

const studyPlanPhases = [
  {
    phase: 'Phase 1',
    code: '01',
    months: 'Month 1-2',
    title: 'Foundation Building',
    items: [
      'Learn basics of freehand drawing: lines, shapes, proportions',
      'Study fundamental math concepts: algebra, trigonometry basics',
      'Build aptitude foundation: logical reasoning, pattern recognition',
      'Practice basic 2D compositions and sketching daily',
      'Study famous architectural styles and landmarks',
      'Start a drawing journal and sketch one object daily',
    ],
  },
  {
    phase: 'Phase 2',
    code: '02',
    months: 'Month 3-4',
    title: 'Practice & Improvement',
    items: [
      'Practice 2-3 full compositions daily with time limits',
      'Solve advanced math problems: coordinate geometry, mensuration',
      'Build general knowledge of architecture and current affairs',
      'Practice color theory and shading techniques',
      'Attempt section-wise mock tests weekly',
      'Analyze mistakes and maintain an error log',
    ],
  },
  {
    phase: 'Phase 3',
    code: '03',
    months: 'Month 5-6',
    title: 'Mock Tests & Revision',
    items: [
      'Take 2-3 full-length mock tests per week',
      'Focus on weak areas identified from mock test analysis',
      'Master time management by practicing completing sections within limits',
      'Revise all math formulas and aptitude shortcuts',
      'Practice drawing under exam-like pressure',
      'Review previous year NATA papers for pattern familiarity',
    ],
  },
];

const sectionStrategies = [
  {
    title: 'Drawing & Composition',
    marks: '80 marks',
    tips: [
      'Practice 2-3 compositions daily on diverse themes (urban, nature, abstract)',
      'Study architectural landmarks: Taj Mahal, Lotus Temple, Fallingwater, Guggenheim',
      'Master color theory: understand complementary, analogous, and triadic schemes',
      'Practice 3D visualization: isometric views, perspective drawing, shadow casting',
      'Develop your own unique style while maintaining technical accuracy',
      'Time yourself strictly, as exam conditions have limited time per drawing',
    ],
  },
  {
    title: 'Mathematics',
    marks: '40 marks (Part B)',
    tips: [
      'Focus on algebra, trigonometry, coordinate geometry, and mensuration',
      'Practice mental math for speed and avoid calculator dependency',
      'Master formulas: areas, volumes, trigonometric identities',
      'Solve 20-30 problems daily from each topic',
      'Learn shortcut methods for common calculation patterns',
      'Practice with previous year NATA math questions',
    ],
  },
  {
    title: 'General Aptitude',
    marks: '80 marks (Part B)',
    tips: [
      'Build general knowledge of Indian and world architecture',
      'Stay updated with current affairs related to design and architecture',
      'Practice logical reasoning: sequences, analogies, classifications',
      'Develop visual perception: identify patterns, symmetry, spatial relationships',
      'Study basic physics concepts: light, color, materials, structures',
      'Read about famous architects and their signature styles',
    ],
  },
];

const dailySchedule = [
  { time: '6:00 - 7:30 AM', activity: 'Drawing Practice', duration: '1.5 hrs', description: 'Freehand compositions, sketching, perspective drawing' },
  { time: '8:00 - 9:30 AM', activity: 'Mathematics', duration: '1.5 hrs', description: 'Problem solving, formula practice, previous year questions' },
  { time: '4:00 - 5:30 PM', activity: 'General Aptitude & GK', duration: '1.5 hrs', description: 'Reasoning, architecture GK, current affairs, visual perception' },
  { time: '7:00 - 8:00 PM', activity: 'Mock Test / Revision', duration: '1 hr', description: 'Timed mock tests or revision of weak areas' },
];

const commonMistakes = [
  'Ignoring the drawing section, which carries 80 marks and is the easiest to improve with practice',
  'Not practicing under timed conditions. Speed and time management are critical in NATA',
  'Skipping 3D composition practice. Spatial visualization questions are high-weightage',
  'Memorizing instead of understanding math concepts. NATA tests application, not rote learning',
  'Not taking enough full-length mock tests. Mock tests build exam temperament and identify weak areas',
  'Starting preparation too late. 6 months minimum is needed for a strong foundation',
];

const howToSteps = [
  { name: 'Understand the Exam Pattern', text: 'Study the NATA 2026 exam structure: Part A (Drawing, 80 marks) and Part B (Mathematics 40 marks + General Aptitude 80 marks). Understand marking scheme, duration, and question types.' },
  { name: 'Build Drawing Fundamentals', text: 'Start with basic freehand drawing skills: lines, shapes, proportions, and perspectives. Practice daily sketching and study architectural compositions. Build a foundation in color theory and shading.' },
  { name: 'Master Mathematics Topics', text: 'Cover algebra, trigonometry, coordinate geometry, mensuration, and 3D geometry. Practice problem-solving daily and learn shortcut methods for common calculations.' },
  { name: 'Develop General Aptitude', text: 'Build knowledge of architecture, design principles, logical reasoning, and visual perception. Stay updated with current affairs related to architecture and design.' },
  { name: 'Practice with Mock Tests', text: 'Start taking section-wise mock tests from Month 3 and full-length mock tests from Month 5. Analyze your performance, identify weak areas, and track improvement over time.' },
  { name: 'Review and Revise', text: 'In the final month, focus on revision of formulas, practice weak areas, and take mock tests under exam conditions. Maintain an error log and review it regularly.' },
];


export default function PreparationTipsPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);
  const baseUrl = 'https://neramclasses.com';
  const localeUrl = (path: string) => locale === 'en' ? `${baseUrl}${path}` : `${baseUrl}/${locale}${path}`;

  return (
    <>
      <JsonLd
        data={generateBreadcrumbSchema([
          { name: 'Home', url: localeUrl('') },
          { name: 'NATA 2026', url: localeUrl('/nata-2026') },
          { name: 'Preparation Tips' },
        ])}
      />
      <JsonLd data={generateFAQSchema(faqs)} />
      <JsonLd
        data={generateHowToSchema({
          name: 'How to Prepare for NATA 2026',
          description: 'A step-by-step guide to prepare for NATA 2026 exam with a 6-month study plan covering drawing, mathematics, and general aptitude.',
          steps: howToSteps,
          totalTime: 'P180D',
        })}
      />

      <GuideArticle
        breadcrumb={[{ name: 'Home', href: '/' }, { name: 'NATA 2026', href: '/nata-2026' }, { name: 'Preparation Tips' }]}
        eyebrow="NATA 2026 · Exam guide"
        title="NATA 2026 Preparation Tips"
        lede="Start your NATA 2026 preparation at least 6 months before the exam. Focus 60% of your time on Drawing & Composition (80 marks) and 40% on Mathematics & General Aptitude (120 marks). Daily practice of 3-4 hours with structured mock tests is the proven strategy for scoring above 140."
        verified="Updated March 13, 2026 · Source: Official NATA 2026 Brochure V1.0"
        nav={nataGuideNav('preparation-tips')}
        related={nataRelated(['drawing-test', 'syllabus', 'exam-pattern', 'scoring-and-results'])}
        back={{ label: 'Back to NATA 2026 guide', href: '/nata-2026' }}
      >
        <ArticleSection
          id="study-plan"
          title="Month-wise NATA 2026 Study Plan"
          intro="A structured 6-month study plan divided into three phases. Each phase builds on the previous one, gradually increasing difficulty and exam readiness."
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {studyPlanPhases.map((phase) => (
              <InfoCard key={phase.phase} code={phase.code} title={phase.title} meta={`${phase.phase} · ${phase.months}`}>
                <Box sx={{ mt: 1, color: tokens.ink }}>
                  <CheckList variant="compact" items={phase.items} />
                </Box>
              </InfoCard>
            ))}
          </Box>
        </ArticleSection>

        <ArticleSection
          id="section-strategy"
          title="Section-wise Preparation Strategy"
          intro="NATA 2026 has two parts: Drawing (Part A, 80 marks) and MCQ (Part B, 120 marks). Here is a detailed strategy for each section."
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {sectionStrategies.map((section) => (
              <InfoCard key={section.title} title={section.title} meta={section.marks}>
                <Box sx={{ mt: 1, color: tokens.ink }}>
                  <CheckList variant="compact" items={section.tips} />
                </Box>
              </InfoCard>
            ))}
          </Box>
        </ArticleSection>

        <ArticleSection
          id="daily-schedule"
          title="Recommended Daily Study Schedule"
          intro="A balanced daily schedule of 5.5 hours covering all sections. Adjust timings to fit your routine, but maintain the proportions."
        >
          <DataTable
            caption="Recommended daily NATA study schedule"
            hideCaption
            columns={['Time', 'Activity', 'Duration', 'Focus']}
            mutedColumn={3}
            rows={dailySchedule.map((slot) => [slot.time, slot.activity, slot.duration, slot.description])}
          />
        </ArticleSection>

        <ArticleSection
          id="common-mistakes"
          title="Common Mistakes NATA Aspirants Make"
          intro="Avoid these common pitfalls that can cost you valuable marks and preparation time."
        >
          <CheckList tone="no" columnMin={1000} items={commonMistakes} />
        </ArticleSection>

        <InlineCta
          eyebrow="Free tools"
          icon={<AppsOutlinedIcon />}
          title="Practice with our free NATA tools"
          body="Use our free mock tests, drawing practice tools, and score predictor to boost your NATA preparation."
          action={
            <CtaButton href={`${APP_URL}/tools/nata`} external>
              Explore NATA Tools (Free)
            </CtaButton>
          }
        />

        <ArticleSection id="faq" title="FAQs: NATA 2026 Preparation">
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

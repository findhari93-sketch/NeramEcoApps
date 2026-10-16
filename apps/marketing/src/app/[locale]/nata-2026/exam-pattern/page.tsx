import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Box, Typography } from '@neram/ui';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema, generateFAQSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import { nataGuideNav, nataRelated } from '@/components/nata/guideNav';
import { ArticleSection, CheckList, CtaBand, CtaButton, DataTable, FactGrid, FaqList, GuideArticle, InfoCard, tokens } from '@/design-system';


export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'NATA 2026 Exam Pattern: Part A & Part B Detailed Breakdown',
    description:
      'Complete NATA 2026 exam pattern with Part A (Drawing, 80 marks, offline) and Part B (MCQ/NCQ, 120 marks, online adaptive). Duration, marking scheme, and question types explained.',
    keywords:
      'NATA 2026 exam pattern, NATA paper pattern, NATA marking scheme, NATA Part A Part B, NATA question types, NATA 2026 marks distribution',
    alternates: buildAlternates(locale, '/nata-2026/exam-pattern'),
  };
}

interface PageProps {
  params: { locale: string };
}

const partAFacts = [
  { label: 'Mode', value: 'Offline (Pen & Paper)' },
  { label: 'Marks', value: '80' },
  { label: 'Duration', value: '90 minutes' },
  { label: 'Questions', value: '3 questions' },
  { label: 'Medium', value: 'English and Hindi' },
  { label: 'Negative Marking', value: 'No' },
];

const partAQuestions = [
  { code: 'A1', title: 'Composition & Color', marks: '25 marks', desc: 'Create compositions and color them appropriately.' },
  { code: 'A2', title: 'Sketching & Composition B&W', marks: '25 marks', desc: 'Draw buildings, people, environment with scale, proportion, shading.' },
  { code: 'A3', title: '3D Composition', marks: '30 marks', desc: 'Create a 3D composition using a kit provided at the center.' },
];

const partBFacts = [
  { label: 'Mode', value: 'Online (Computer Adaptive)' },
  { label: 'Marks', value: '120' },
  { label: 'Duration', value: '90 minutes (108 sec/question)' },
  { label: 'Questions', value: '50 (42 MCQ + 8 NCQ)' },
  { label: 'Medium', value: 'English and Hindi' },
  { label: 'Negative Marking', value: 'No' },
];

const partBTopics = [
  { title: 'Visual Reasoning', body: '2D/3D composition understanding' },
  { title: 'Logical Derivation', body: 'Decoding situations and drawing conclusions' },
  { title: 'GK, Architecture & Design', body: 'Buildings, history, materials' },
  { title: 'Language Interpretation', body: 'Grammar, word meanings' },
  { title: 'Design Sensitivity & Thinking', body: 'Observation, critical thinking' },
  { title: 'Numerical Ability', body: 'Math with creative/geometric applications' },
];

const session1 = [
  { time: '09:00 AM', event: 'Report to Examination Centre' },
  { time: '09:15 AM', event: 'Gate opens to examination hall' },
  { time: '09:45 AM', event: 'Registration must be completed' },
  { time: '10:00 AM', event: 'Gate closes, examination begins (Part A + Part B)' },
  { time: '10:15 AM', event: 'Late entry cutoff. No entry after this.' },
  { time: '01:00 PM', event: 'Examination ends, exit allowed' },
];

const session2 = [
  { time: '12:30 PM', event: 'Report to Examination Centre' },
  { time: '12:45 PM', event: 'Gate opens to examination hall' },
  { time: '01:15 PM', event: 'Registration must be completed' },
  { time: '01:30 PM', event: 'Gate closes, examination begins (Part A + Part B)' },
  { time: '01:45 PM', event: 'Late entry cutoff. No entry after this.' },
  { time: '04:30 PM', event: 'Examination ends, exit allowed' },
];

const subheadSx = { m: 0, fontSize: '1.0625rem', fontWeight: 700, color: tokens.ink } as const;

/** A note: white box with a 3px gold rail on the left (no tinted fill). */
const noteSx = {
  bgcolor: tokens.surface,
  border: `1px solid ${tokens.line}`,
  borderLeft: 'none',
  borderRadius: `${tokens.radius}px`,
  boxShadow: `inset 3px 0 0 ${tokens.gold500}`,
  px: { xs: 2.5, sm: 3 },
  py: 2,
  fontSize: '1rem',
  lineHeight: 1.6,
  color: tokens.ink,
} as const;

const faqs = [
  {
    question: 'How many questions are there in NATA 2026?',
    answer:
      'NATA 2026 has 3 questions in Part A (offline, 80 marks) and 50 questions in Part B (online, 120 marks): 42 MCQs and 8 NCQs. The total is 200 marks. Part A tests drawing and composition skills while Part B is a computer-based adaptive test.',
  },
  {
    question: 'Is NATA 2026 Part B adaptive?',
    answer:
      'Yes, Part B of NATA 2026 uses Computer Adaptive Testing (CAT). You get 108 seconds per question. The difficulty adjusts based on your performance. Correct answers lead to harder questions and incorrect ones lead to easier questions.',
  },
  {
    question: 'Can I use a calculator in NATA?',
    answer:
      'No, calculators, mobile phones, Bluetooth devices, slide rules, log tables, and electronic watches with calculator facilities are strictly not allowed in the examination hall. Possession of such items may lead to cancellation of candidature.',
  },
  {
    question: 'What materials can I bring for Part A drawing?',
    answer:
      'For Part A, you must bring: pencils, erasers, dry colors, and a scale (up to 15 cm only). No geometry box, compass, set squares, or other instruments are allowed. The exam center provides drawing paper/material and rough sheets.',
  },
  {
    question: 'How many attempts are available in NATA 2026?',
    answer:
      'You can take up to 2 attempts in Phase 1 (April–June 2026) for Centralized Admission Counselling, OR 1 attempt in Phase 2 (August 7–8, 2026) for vacant seats. You cannot appear in both phases. Your best raw score is used for percentile calculation.',
  },
  {
    question: 'What is the new 3D Composition question in Part A?',
    answer:
      'Question A3 (30 marks) requires creating an interesting 3D composition for a given situation using a kit provided at the test center. This tests your ability to think in three dimensions and create spatial compositions.',
  },
];

export default function ExamPatternPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);
  const baseUrl = 'https://neramclasses.com';
  const localeUrl = (path: string) => locale === 'en' ? `${baseUrl}${path}` : `${baseUrl}/${locale}${path}`;

  return (
    <>
      <JsonLd data={generateBreadcrumbSchema([{ name: 'Home', url: localeUrl('') }, { name: 'NATA 2026', url: localeUrl('/nata-2026') }, { name: 'Exam Pattern' }])} />
      <JsonLd data={generateFAQSchema(faqs)} />

      <GuideArticle
        breadcrumb={[{ name: 'Home', href: '/' }, { name: 'NATA 2026', href: '/nata-2026' }, { name: 'Exam Pattern' }]}
        eyebrow="NATA 2026 · Exam guide"
        title="NATA 2026 Exam Pattern"
        lede="NATA 2026 is a 200-mark exam in two parts: Part A, Drawing & Composition (80 marks, offline, 90 minutes) and Part B, MCQ/NCQ (120 marks, online adaptive, 90 minutes). The medium is English and Hindi."
        verified="Updated March 13, 2026 · Source: Official NATA 2026 Brochure V1.0"
        nav={nataGuideNav('exam-pattern')}
        related={nataRelated(['syllabus', 'scoring-and-results', 'dos-and-donts', 'photo-signature-requirements'])}
        back={{ label: 'Back to NATA 2026 guide', href: '/nata-2026' }}
      >
        <ArticleSection id="part-a" eyebrow="Part A" title="Drawing & Composition Test">
          <FactGrid items={partAFacts} />
          <Typography component="h3" sx={subheadSx}>
            Question Breakdown:
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {partAQuestions.map((q) => (
              <InfoCard key={q.code} code={q.code} title={q.title} meta={q.marks} body={q.desc} titleAs="h4" />
            ))}
          </Box>
          <Box sx={noteSx}>
            Materials to bring: Pencils, erasers, dry colors, scale (up to 15 cm). No geometry box or other instruments allowed.
          </Box>
        </ArticleSection>

        <ArticleSection id="part-b" eyebrow="Part B" title="MCQ / NCQ (Adaptive)">
          <FactGrid items={partBFacts} />
          <Typography component="h3" sx={subheadSx}>
            Topics Covered:
          </Typography>
          <CheckList items={partBTopics} columnMin={300} />
        </ArticleSection>

        <ArticleSection id="exam-day-schedule" title="Exam Day Schedule">
          <ArticleSection id="session-1" title="Session 1 (Morning)" as="h3">
            <DataTable
              caption="NATA 2026 Session 1 (Morning) schedule"
              hideCaption
              columns={['Time', 'Event']}
              rows={session1.map((row) => [row.time, row.event])}
            />
          </ArticleSection>
          <ArticleSection id="session-2" title="Session 2 (Afternoon)" as="h3">
            <DataTable
              caption="NATA 2026 Session 2 (Afternoon) schedule"
              hideCaption
              columns={['Time', 'Event']}
              rows={session2.map((row) => [row.time, row.event])}
            />
          </ArticleSection>
          <Box sx={{ ...noteSx, fontWeight: 600 }}>
            Fridays: 1 session (afternoon only). Saturdays: 2 sessions. Total duration: 3 hours (Part A 90 min + Part B 90 min). No exit before exam ends.
          </Box>
        </ArticleSection>

        <ArticleSection id="faq" title="FAQs: NATA 2026 Exam Pattern">
          <FaqList items={faqs} defaultOpen={-1} />
        </ArticleSection>
      </GuideArticle>

      <CtaBand
        title="Prepare for NATA 2026 with Neram Classes"
        lede="Master both Part A and Part B with expert coaching."
        actions={
          <>
            <CtaButton href="/apply">Start Free Trial</CtaButton>
            <CtaButton variant="link" href="/nata-2026">
              Back to NATA 2026 Guide
            </CtaButton>
          </>
        }
      />
    </>
  );
}

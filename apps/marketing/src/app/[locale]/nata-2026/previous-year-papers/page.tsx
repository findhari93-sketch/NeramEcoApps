import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Box, Typography } from '@neram/ui';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema, generateFAQSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import { APP_URL } from '@/lib/seo/constants';
import { nataGuideNav, nataRelated } from '@/components/nata/guideNav';
import {
  ArticleSection,
  CheckList,
  CtaBand,
  CtaButton,
  DataTable,
  FaqList,
  GuideArticle,
  InfoCard,
  InlineCta,
} from '@/design-system';


export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'NATA Previous Year Question Papers (2020-2025): Download & Analysis',
    description:
      'Download NATA previous year question papers from 2020 to 2025. Year-wise analysis of question patterns, difficulty trends, and topic-wise weightage. Free practice resources for NATA 2026.',
    keywords:
      'NATA previous year papers, NATA question papers, NATA 2025 paper, NATA paper analysis, NATA practice papers',
    alternates: buildAlternates(locale, '/nata-2026/previous-year-papers'),
  };
}

interface PageProps {
  params: { locale: string };
}

const yearWiseData = [
  {
    year: '2025',
    mode: 'Hybrid (Offline Drawing + Online MCQ)',
    difficulty: 'Moderate to High',
    changes: 'Introduced 3D Composition section with physical kit; increased drawing weightage',
  },
  {
    year: '2024',
    mode: 'Hybrid (Offline Drawing + Online MCQ)',
    difficulty: 'Moderate',
    changes: 'PCM-based aptitude questions; similar format to 2023',
  },
  {
    year: '2023',
    mode: 'Online + Offline',
    difficulty: 'Moderate',
    changes: 'Drawing weight increased; more emphasis on spatial reasoning',
  },
  {
    year: '2022',
    mode: 'Hybrid (First Year)',
    difficulty: 'Moderate',
    changes: 'First year of hybrid mode combining offline drawing and online MCQ',
  },
  {
    year: '2021',
    mode: 'Fully Online',
    difficulty: 'Easy to Moderate',
    changes: 'Fully online due to COVID-19; drawing tested via digital tools',
  },
  {
    year: '2020',
    mode: 'Fully Online',
    difficulty: 'Moderate',
    changes: 'First fully online NATA exam due to pandemic; reduced question count',
  },
];

const topicWeightage = [
  { topic: 'Mathematics (Numerical Ability)', weightage: '~20%', marks: '~40 marks', trend: 'Stable across years' },
  { topic: 'General Aptitude (Visual Reasoning, GK, Language)', weightage: '~40%', marks: '~80 marks', trend: 'Increasing focus on design sensitivity' },
  { topic: 'Drawing & Composition (Part A)', weightage: '~40%', marks: '~80 marks', trend: '3D Composition added from 2025' },
];

const pyqTips = [
  'Start with the most recent papers (2024-2025) to understand the current format and difficulty.',
  'Time yourself strictly: 90 minutes for Part A and 90 minutes for Part B.',
  'Analyze your mistakes after each paper. Note which topics need more practice.',
  'Focus on understanding the marking scheme. No negative marking means attempt every question.',
  'Practice the 3D Composition questions separately since this is a newer format.',
  'Compare question patterns across years to identify frequently tested topics.',
  'Use PYQs to build speed in drawing. Aim to complete each drawing question in 30 minutes.',
  'Recreate drawing questions from memory to improve visualization skills.',
];

const faqs = [
  {
    question: 'Does CoA officially release NATA previous year question papers?',
    answer:
      'No, the Council of Architecture (CoA) does not officially release full NATA question papers. However, solved sample papers and reconstructed questions from past exams are available through coaching platforms like Neram Classes. CoA does publish sample question formats and guidelines on nata.in.',
  },
  {
    question: 'Where can I find NATA previous year papers for free?',
    answer:
      'While official papers are not released, you can access reconstructed NATA papers and practice questions through Neram Classes\' free question bank at app.neramclasses.com. These are based on actual exam patterns and include year-wise analysis of topics and difficulty levels.',
  },
  {
    question: 'How many years of NATA papers should I practice?',
    answer:
      'Practice at least 3-5 years of papers (2020-2025) for comprehensive preparation. Focus more on 2022-2025 papers since the hybrid format started in 2022. Papers from 2020-2021 are still useful for aptitude and mathematics practice, though the exam format was different (fully online).',
  },
  {
    question: 'Has the NATA exam pattern changed significantly over the years?',
    answer:
      'Yes. From 2020-2021, NATA was fully online. In 2022, the hybrid format was introduced (offline drawing + online MCQ). In 2025, the 3D Composition section was added. The overall structure remains Part A (Drawing) and Part B (MCQ/NCQ), but the specific question types and weightage have evolved.',
  },
  {
    question: 'Are NATA previous year papers enough for preparation?',
    answer:
      'PYQs are essential but not sufficient alone. They help you understand the pattern, difficulty, and question types. Combine PYQ practice with: (1) daily drawing practice, (2) mathematics from NCERT/RD Sharma, (3) general knowledge reading, and (4) mock tests under timed conditions. Neram Classes provides structured preparation covering all these areas.',
  },
];

export default function PreviousYearPapersPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);
  const baseUrl = 'https://neramclasses.com';
  const localeUrl = (path: string) => locale === 'en' ? `${baseUrl}${path}` : `${baseUrl}/${locale}${path}`;

  return (
    <>
      <JsonLd data={generateBreadcrumbSchema([{ name: 'Home', url: localeUrl('') }, { name: 'NATA 2026', url: localeUrl('/nata-2026') }, { name: 'Previous Year Papers' }])} />
      <JsonLd data={generateFAQSchema(faqs)} />

      <GuideArticle
        breadcrumb={[{ name: 'Home', href: '/' }, { name: 'NATA 2026', href: '/nata-2026' }, { name: 'Previous Year Papers' }]}
        eyebrow="NATA 2026 · Exam guide"
        title="NATA Previous Year Question Papers (2020-2025)"
        lede="NATA previous year question papers from 2020-2025 are essential for understanding the exam pattern and difficulty level. While CoA does not officially release full question papers, solved sample papers and reconstructed questions from past exams are available through coaching platforms like Neram Classes."
        verified="Updated March 13, 2026 · Source: Official NATA 2026 Brochure V1.0"
        nav={nataGuideNav('previous-year-papers')}
        related={nataRelated(['exam-pattern', 'syllabus', 'preparation-tips', 'drawing-test'])}
        back={{ label: 'Back to NATA 2026 guide', href: '/nata-2026' }}
      >
        <ArticleSection
          id="year-wise-analysis"
          title="Year-wise Paper Analysis (2020-2025)"
          intro="Here is a comprehensive analysis of how the NATA exam has evolved over the past six years, including format changes, difficulty levels, and major updates."
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {yearWiseData.map((item) => (
              <InfoCard key={item.year} code={item.year} title={`NATA ${item.year}`} meta={item.difficulty}>
                <Typography component="p" sx={{ m: 0, fontSize: 'inherit', lineHeight: 'inherit', color: 'inherit' }}>
                  <strong>Mode:</strong> {item.mode}
                </Typography>
                <Typography component="p" sx={{ m: 0, fontSize: 'inherit', lineHeight: 'inherit', color: 'inherit' }}>
                  <strong>Key Changes:</strong> {item.changes}
                </Typography>
              </InfoCard>
            ))}
          </Box>
        </ArticleSection>

        <ArticleSection
          id="topic-weightage"
          title="Topic-wise Weightage Trends"
          intro="Based on analysis of previous years, here is the approximate topic-wise weightage in NATA."
        >
          <DataTable
            caption="Approximate topic-wise weightage in NATA"
            hideCaption
            columns={['Topic', 'Weightage', 'Marks', 'Trend']}
            mutedColumn={3}
            rows={topicWeightage.map((item) => [item.topic, item.weightage, item.marks, item.trend])}
          />
        </ArticleSection>

        <ArticleSection
          id="how-to-use-pyqs"
          title="How to Use PYQs Effectively"
          intro="Practicing previous year questions is one of the best strategies for NATA preparation. Here is how to make the most of them."
        >
          <CheckList items={pyqTips} columnMin={600} />
        </ArticleSection>

        <InlineCta
          eyebrow="Free practice"
          icon={<QuizOutlinedIcon />}
          title="Free NATA Practice Resources"
          body="Access our free NATA question bank with topic-wise practice questions based on previous year patterns."
          action={
            <CtaButton href={`${APP_URL}/tools/nata/question-bank`} external>
              Open Question Bank (Free)
            </CtaButton>
          }
        />

        <ArticleSection id="faq" title="FAQs: NATA Previous Year Papers">
          <FaqList items={faqs} defaultOpen={-1} />
        </ArticleSection>
      </GuideArticle>

      <CtaBand
        title="Prepare for NATA 2026 with Neram Classes"
        lede="Practice with curated question banks based on previous year patterns."
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

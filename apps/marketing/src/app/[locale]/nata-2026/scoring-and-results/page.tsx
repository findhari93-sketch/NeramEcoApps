import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Box, Typography } from '@neram/ui';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import { nataGuideNav, nataRelated } from '@/components/nata/guideNav';
import { ArticleSection, CheckList, CtaBand, CtaButton, FactGrid, FaqList, GuideArticle, InlineCta, tokens } from '@/design-system';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema, generateFAQSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import { APP_URL } from '@/lib/seo/constants';


export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'NATA 2026 Scoring, Qualifying Marks & Results',
    description:
      'NATA 2026 scoring system, qualifying marks (minimum 20 in Part A, 20 in Part B, 60 overall), result dates, multiple attempt scoring rules, and score validity.',
    keywords:
      'NATA 2026 results, NATA qualifying marks, NATA passing marks, NATA score validity, NATA 2026 cutoff, NATA scoring system',
    alternates: buildAlternates(locale, '/nata-2026/scoring-and-results'),
  };
}

interface PageProps {
  params: { locale: string };
}

const markSplit = [
  { label: 'Part A (Drawing)', value: '80 marks' },
  { label: 'Part B (MCQ/NCQ)', value: '120 marks' },
  { label: 'Total', value: '200 marks' },
];

const percentilePoints = [
  'Phase 1 (April–June): Percentile score computed after all test sessions end, based on your best raw score relative to the entire population.',
  'Phase 2 (August): Only Raw Scores issued, no percentile calculation.',
  'Phase 1 scores (with Percentile) are used for Centralized Admission Counselling (CAP).',
  'Phase 2 scores (Raw only) are used for admission against vacant seats after CAP.',
  'Admission authorities may use either best Raw Score or Percentile Score per their rules.',
];

const attemptRules = [
  'Phase 1 (April 4 – June 13, 2026): Up to 2 attempts for Centralized Admission Counselling (CAP).',
  'Phase 2 (August 7 & 8, 2026): 1 attempt only, for vacant seats after CAP.',
  'You can appear in only ONE phase: either Phase 1 or Phase 2, not both.',
  'Each attempt generates a raw score. A Statement of Marks is issued after each attempt.',
  'In Phase 1, your BEST raw score is used for final percentile computation.',
  'In Phase 2, only raw scores are issued. No percentile score.',
  'Each attempt requires separate fee payment.',
];

const cardSx = {
  bgcolor: tokens.surface,
  border: `1px solid ${tokens.line}`,
  borderRadius: `${tokens.radius}px`,
  px: { xs: 2.5, sm: 3 },
  py: 2.5,
  color: tokens.ink,
} as const;

/** A note: white box with a 3px gold rail on the left (no tinted fill). */
const noteSx = {
  ...cardSx,
  borderLeft: 'none',
  boxShadow: `inset 3px 0 0 ${tokens.gold500}`,
  fontSize: '1rem',
  fontWeight: 600,
  lineHeight: 1.6,
} as const;

const bodySx = { m: 0, fontSize: '1rem', lineHeight: 1.7, color: tokens.inkMuted } as const;

const faqs = [
  {
    question: 'What are the minimum qualifying marks for NATA 2026?',
    answer:
      'No minimum Raw Score is prescribed for qualifying in NATA 2026. The Final Scorecard issued by the Council, indicating the best Raw Score and the corresponding non-zero Percentile Score, shall be the valid qualifying NATA score.',
  },
  {
    question: 'If I attempt NATA multiple times, which score is considered?',
    answer:
      'In Phase 1, you can take up to 2 attempts. Your best raw score is used for percentile calculation. For example, if you score 100 in Attempt 1 and 120 in Attempt 2, your score of 120 will be used for percentile computation.',
  },
  {
    question: 'How long is the NATA 2026 score valid?',
    answer:
      'The NATA 2026 score is valid for the academic session 2026-2027 only. If you have a valid NATA 2025 score and do not appear in NATA 2026, the 2025 score remains valid for the 2026-27 session as well.',
  },
  {
    question: 'What is the percentile-based scoring system?',
    answer:
      'NATA 2026 adopts percentile-based scoring for Phase 1. After all test sessions in Phase 1 (April–June 2026), the final percentile score is calculated based on your best raw score relative to the entire population of examinees. Phase 2 (August) uses only raw scores without percentile.',
  },
  {
    question: 'Can I use my NATA 2025 score for 2026-27 admissions?',
    answer:
      'Yes, if you have a valid qualifying NATA 2025 score and have not taken admission during 2025-26, your score remains valid for 2026-27. However, if you take even one attempt in NATA 2026, your 2025 score becomes invalid.',
  },
];

export default function ScoringResultsPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);
  const baseUrl = 'https://neramclasses.com';
  const localeUrl = (path: string) => locale === 'en' ? `${baseUrl}${path}` : `${baseUrl}/${locale}${path}`;

  return (
    <>
      <JsonLd data={generateBreadcrumbSchema([{ name: 'Home', url: localeUrl('') }, { name: 'NATA 2026', url: localeUrl('/nata-2026') }, { name: 'Scoring & Results' }])} />
      <JsonLd data={generateFAQSchema(faqs)} />

      <GuideArticle
        breadcrumb={[{ name: 'Home', href: '/' }, { name: 'NATA 2026', href: '/nata-2026' }, { name: 'Scoring & Results' }]}
        eyebrow="NATA 2026 · Exam guide"
        title="NATA 2026 Scoring & Results"
        lede="NATA 2026 uses a percentile-based scoring system. No minimum Raw Score is prescribed. Your best raw score across attempts is used for percentile calculation. Score is valid for academic session 2026-2027."
        verified="Updated March 13, 2026 · Source: Official NATA 2026 Brochure V1.0"
        nav={nataGuideNav('scoring-and-results')}
        related={nataRelated(['exam-pattern', 'syllabus', 'cutoff-calculator', 'important-dates'])}
        back={{ label: 'Back to NATA 2026 guide', href: '/nata-2026' }}
      >
        <ArticleSection id="percentile-scoring" title="Percentile-Based Scoring">
          <FactGrid items={markSplit} cellMin={160} />
          <Box sx={noteSx}>
            No minimum Raw Score is prescribed for qualifying in NATA 2026. The Final Scorecard with a non-zero Percentile Score is the valid qualifying NATA score.
          </Box>
          <ArticleSection id="how-percentile-scoring-works" title="How Percentile Scoring Works" as="h3">
            <CheckList items={percentilePoints} columnMin={1000} />
          </ArticleSection>
        </ArticleSection>

        <ArticleSection id="attempt-structure" title="Attempt Structure & Scoring">
          <Box component="ol" sx={{ m: 0, p: 0, listStyle: 'none', borderTop: `1px solid ${tokens.ink}` }}>
            {attemptRules.map((rule, idx) => (
              <Box
                component="li"
                key={rule}
                sx={{ display: 'flex', gap: 2, py: 1.75, borderBottom: `1px solid ${tokens.line}`, fontSize: '1rem', lineHeight: 1.6, color: tokens.ink }}
              >
                <Box component="span" aria-hidden sx={{ fontFamily: tokens.fontMono, fontWeight: 700, color: tokens.gold800, minWidth: 28 }}>
                  {String(idx + 1).padStart(2, '0')}
                </Box>
                <span>{rule}</span>
              </Box>
            ))}
          </Box>
        </ArticleSection>

        <ArticleSection
          id="score-validity"
          title="Score Validity"
          intro={
            <>
              The NATA 2026 score is valid for <strong>the academic session 2026-2027 only</strong>.
            </>
          }
        >
          <Box sx={{ ...cardSx, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Typography component="h3" sx={{ m: 0, fontSize: '1.0625rem', fontWeight: 700 }}>
              NATA 2025 Score Carryover
            </Typography>
            <Typography component="p" sx={bodySx}>
              Candidates with a valid NATA 2025 score who have NOT taken admission during 2025-26 and do NOT appear in NATA 2026:
            </Typography>
            <Box component="ul" sx={{ ...bodySx, pl: 2.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <li>Will be assigned a Percentile Score for CAP round admissions in 2026-27.</li>
              <li>For vacant seat admissions, the best NATA 2025 score is treated as Raw Score.</li>
            </Box>
            <Typography component="p" sx={bodySx}>
              However, if you take any attempt in NATA 2026, your NATA 2025 score becomes invalid. NATA 2025 scores are also invalid for candidates who already secured admission based on NATA 2025.
            </Typography>
          </Box>
        </ArticleSection>

        <InlineCta
          eyebrow="Free tool"
          icon={<CalculateOutlinedIcon />}
          title="Check Which Colleges You Can Get Into"
          body="Use our free Cutoff Calculator to see colleges you qualify for based on your expected NATA score."
          action={
            <CtaButton href={`${APP_URL}/tools/nata/cutoff-calculator`} external>
              Open Cutoff Calculator (Free)
            </CtaButton>
          }
        />

        <ArticleSection id="faq" title="FAQs: NATA 2026 Scoring & Results">
          <FaqList items={faqs} defaultOpen={-1} />
        </ArticleSection>
      </GuideArticle>

      <CtaBand
        title="Prepare for NATA 2026 with Neram Classes"
        lede="Maximize your score with expert coaching and free tools."
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

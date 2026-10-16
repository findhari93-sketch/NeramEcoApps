import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Box, Typography } from '@neram/ui';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema, generateFAQSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import { APP_URL } from '@/lib/seo/constants';
import { nataGuideNav, nataRelated } from '@/components/nata/guideNav';
import { ArticleSection, CtaBand, CtaButton, FactGrid, FaqList, GuideArticle, InfoCard, InlineCta, tokens } from '@/design-system';


export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'NATA 2026 Cutoff Calculator: Check Your College Eligibility',
    description:
      'Use the free NATA 2026 cutoff calculator to check which architecture colleges you can get into based on your expected score, category, and state. It uses published counselling cutoffs for B.Arch colleges.',
    keywords:
      'NATA 2026 cutoff, NATA cutoff calculator, NATA college cutoff, NATA passing marks, NATA minimum score for college, B.Arch cutoff',
    alternates: buildAlternates(locale, '/nata-2026/cutoff-calculator'),
  };
}

interface PageProps {
  params: { locale: string };
}

const qualifying = [
  { label: 'Part A (Drawing)', min: '20 marks', total: 'out of 80' },
  { label: 'Part B (MCQ/NCQ)', min: '20 marks', total: 'out of 120' },
  { label: 'Overall', min: '60 marks', total: 'out of 200' },
];

const scoreRanges = [
  { range: '150 - 200', label: 'Excellent', desc: 'Top government colleges (SPA, NITs, IITs). State-rank holders. Best scholarships available.' },
  { range: '120 - 149', label: 'Very Good', desc: 'Good government colleges, top private colleges. Multiple options across states.' },
  { range: '100 - 119', label: 'Good', desc: 'Many private and aided colleges. Some government college options depending on category and state.' },
  { range: '60 - 99', label: 'Qualifying', desc: 'Qualified for admission. Private college options available. Consider retaking for better options.' },
];

const faqs = [
  {
    question: 'What is the expected NATA 2026 cutoff for top colleges?',
    answer:
      'Top government architecture colleges like SPA Delhi, SPA Bhopal, and IITs typically require NATA scores above 130-150 out of 200. The exact cutoff varies by category, state, and counselling round. Use our cutoff calculator for personalized predictions.',
  },
  {
    question: 'Is the NATA cutoff same for all categories?',
    answer:
      'No, the NATA cutoff varies by category. SC/ST/OBC/PwD candidates typically have lower cutoffs compared to General category. Each college sets its own cutoff based on NATA score, category, and available seats.',
  },
  {
    question: 'How accurate is the NATA cutoff calculator?',
    answer:
      'Our cutoff calculator uses data from previous years (2019-2025) and covers B.Arch colleges where counselling publishes cutoffs. While past data is a strong predictor, actual cutoffs may vary. Use the predictions as a guide, not a guarantee.',
  },
  {
    question: 'Can I get into a good college with 100 marks in NATA?',
    answer:
      'Yes, scoring 100 out of 200 in NATA qualifies you and opens up many good private and aided architecture colleges. For top government colleges, you may need 130+ marks. Use our cutoff calculator to see exact college options for your score.',
  },
];

const bodySx = { m: 0, fontSize: '1.0625rem', lineHeight: 1.7, color: tokens.ink } as const;

export default function CutoffCalculatorPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);
  const baseUrl = 'https://neramclasses.com';
  const localeUrl = (path: string) => locale === 'en' ? `${baseUrl}${path}` : `${baseUrl}/${locale}${path}`;

  return (
    <>
      <JsonLd data={generateBreadcrumbSchema([{ name: 'Home', url: localeUrl('') }, { name: 'NATA 2026', url: localeUrl('/nata-2026') }, { name: 'Cutoff Calculator' }])} />
      <JsonLd data={generateFAQSchema(faqs)} />

      <GuideArticle
        breadcrumb={[{ name: 'Home', href: '/' }, { name: 'NATA 2026', href: '/nata-2026' }, { name: 'Cutoff Calculator' }]}
        eyebrow="NATA 2026 · Exam guide"
        title="NATA 2026 Cutoff Calculator"
        lede="Enter your expected NATA 2026 score to see which architecture colleges you can get into. Our free cutoff calculator uses published cutoffs from 2019 to 2025."
        verified="Updated March 13, 2026 · Source: Official NATA 2026 Brochure V1.0"
        nav={nataGuideNav('cutoff-calculator')}
        related={nataRelated(['scoring-and-results', 'exam-pattern', 'eligibility', 'fee-structure'])}
        back={{ label: 'Back to NATA 2026 guide', href: '/nata-2026' }}
      >
        <ArticleSection
          id="qualification-check"
          title="Quick Qualification Check"
          intro="Before using the cutoff calculator, make sure you meet the minimum qualifying criteria for NATA 2026:"
        >
          <FactGrid
            cellMin={180}
            items={qualifying.map((item) => ({
              label: item.label,
              value: (
                <>
                  {item.min}{' '}
                  <Box component="span" sx={{ fontWeight: 400, fontSize: '0.875rem', color: tokens.inkMuted }}>
                    {item.total}
                  </Box>
                </>
              ),
            }))}
          />
          <Typography component="p" sx={bodySx}>
            If you meet all three criteria, you are qualified! Now use the cutoff calculator to find colleges matching your score.
          </Typography>
        </ArticleSection>

        <InlineCta
          eyebrow="Free tool"
          icon={<CalculateOutlinedIcon />}
          title="Use the Free Cutoff Calculator"
          body="Enter your NATA score, category, and preferred state to get a personalized list of colleges you can apply to. Data from published counselling cutoffs."
          action={
            <CtaButton href={`${APP_URL}/tools/nata/cutoff-calculator`} external>
              Open Cutoff Calculator (Free)
            </CtaButton>
          }
        />

        <ArticleSection id="score-ranges" title="What Can You Expect at Different Scores?">
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {scoreRanges.map((item) => (
              <InfoCard key={item.range} title={item.range} meta={item.label} body={item.desc} />
            ))}
          </Box>
        </ArticleSection>

        <ArticleSection id="faq" title="FAQs: NATA 2026 Cutoffs">
          <FaqList items={faqs} defaultOpen={-1} />
        </ArticleSection>
      </GuideArticle>

      <CtaBand
        title="Prepare for NATA 2026 with Neram Classes"
        lede="Score higher with expert coaching and reach your dream college."
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

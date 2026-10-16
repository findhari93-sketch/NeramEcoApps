import type { ReactNode } from 'react';
import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Box, Typography } from '@neram/ui';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema, generateFAQSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import { APP_URL } from '@/lib/seo/constants';
import { buildWhatsAppLink } from '@/lib/whatsapp';
import { getActiveNataBrochures, getActiveNataFaqs } from '@neram/database';
import { spokeMeta } from '@/components/nata/data/spokeMeta';
import { nataSpokeIcon } from '@/components/nata/guideNav';
import { CtaBand, CtaButton, EmptyState, FactGrid, FactsCard, FaqList, HubCard, InfoCard, PageHero, Section, tokens as t } from '@/design-system';

/**
 * NATA 2027 hub. Opened before the 2027 brochure, so it carries only what does
 * not change year to year (CoA, the two-part format, the evergreen guides) and
 * says "expected" for every date. The 2026 guides stay the detail pages until
 * the brochure is out; then add 2027 spokes and decide on a 301 for /nata-2026.
 * Entered from the /nata-2026 hub banner, the sitemap and search.
 */
export const revalidate = 86400;

const YEAR = 2027;

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }): Promise<Metadata> {
  return {
    // The [locale] layout template appends " | Neram Classes".
    title: 'NATA 2027: Exam Guide, Expected Dates, Syllabus & Eligibility',
    description:
      'NATA 2027 guide: expected exam dates, eligibility, syllabus, exam pattern and preparation plan. Dates follow the 2026 timeline until the Council of Architecture publishes the 2027 brochure.',
    keywords: 'NATA 2027, NATA exam 2027, NATA 2027 exam date, NATA 2027 eligibility, NATA 2027 syllabus, NATA 2027 preparation',
    alternates: buildAlternates(locale, '/nata-2027'),
  };
}

// Guides whose facts carry over to 2027 (format, syllabus, preparation).
const CARRY_OVER = new Set([
  'eligibility',
  'syllabus',
  'exam-pattern',
  'drawing-test',
  'scoring-and-results',
  'preparation-tips',
  'previous-year-papers',
  'best-books',
  'exam-centers',
  'photo-signature-requirements',
  'dos-and-donts',
  'cutoff-calculator',
]);
const PREPARE_NOW = spokeMeta.filter((s) => CARRY_OVER.has(s.slug));
const AWAITING_BROCHURE = spokeMeta.filter((s) => !CARRY_OVER.has(s.slug));

const QUICK_FACTS = [
  { label: 'Exam', value: `NATA ${YEAR}` },
  { label: 'Conducted By', value: 'CoA (Council of Architecture)' },
  { label: 'Brochure', value: 'Expected Feb to Mar 2027' },
  { label: 'Phase 1', value: 'Expected Apr to Jun 2027' },
  { label: 'Phase 2', value: 'Expected Aug 2027' },
  { label: 'For admission', value: 'B.Arch 2027-28' },
];

const TIMELINE: Array<{ label: string; value: string; subtext: string }> = [
  { label: 'Brochure and registration opens', value: 'Expected February to March 2027', subtext: 'The 2026 brochure came out in March 2026' },
  { label: 'Phase 1 tests', value: 'Expected April to June 2027', subtext: 'Up to 2 attempts in 2026' },
  { label: 'Phase 2 test', value: 'Expected August 2027', subtext: 'One attempt in 2026' },
  { label: 'Score used for', value: 'B.Arch admissions 2027-28', subtext: 'Counselling runs June to September' },
];

const FORMAT: Array<{ label: string; value: string; subtext?: string }> = [
  { label: 'Conducting Body', value: 'Council of Architecture (CoA)' },
  { label: 'Total Marks (2026)', value: '200', subtext: 'Part A Drawing 80 + Part B MCQ/NCQ 120' },
  { label: 'Duration (2026)', value: '3 Hours', subtext: '90 min each part' },
  { label: 'Mode (2026)', value: 'Part A offline + Part B online adaptive' },
  { label: 'Website', value: 'www.nata.in' },
];

const FREE_TOOLS: Array<{ title: string; link: string; icon: ReactNode }> = [
  { title: 'Eligibility Checker', link: `${APP_URL}/tools/nata/eligibility-checker`, icon: <CheckCircleOutlineIcon /> },
  { title: 'Cutoff Calculator', link: `${APP_URL}/tools/nata/cutoff-calculator`, icon: <CalculateOutlinedIcon /> },
  { title: 'College Predictor', link: `${APP_URL}/tools/nata/college-predictor`, icon: <SchoolOutlinedIcon /> },
  { title: 'Exam Centers', link: `${APP_URL}/tools/nata/exam-centers`, icon: <LocationOnOutlinedIcon /> },
  { title: 'Question Bank', link: `${APP_URL}/tools/nata/question-bank`, icon: <QuizOutlinedIcon /> },
];

const defaultFaqs = [
  {
    question: 'When is NATA 2027?',
    answer:
      'The Council of Architecture has not announced NATA 2027 dates yet. Going by 2026, the brochure is expected in February to March 2027, Phase 1 tests in April to June 2027 and Phase 2 in August 2027. This page is updated when the official notice is out.',
  },
  {
    question: 'Who can apply for NATA 2027?',
    answer:
      'Students who pass or are appearing in Class 12 (or a 10+3 diploma) with Mathematics in 2027 can take NATA 2027. The 2026 eligibility rules are explained in our eligibility guide, and CoA confirms the 2027 rules in its brochure.',
  },
  {
    question: 'Will the NATA 2027 exam pattern change?',
    answer:
      'NATA 2026 had 200 marks in two parts: a drawing test (80 marks, offline) and an MCQ/NCQ test (120 marks, online adaptive), 3 hours in all. The 2027 pattern is expected to stay similar (official notice awaited).',
  },
  {
    question: 'When should I start preparing for NATA 2027?',
    answer:
      'Now. Drawing skill takes months of daily practice, and the syllabus and format carry over from 2026. Start with the syllabus, the drawing test guide and previous year papers on this page.',
  },
];

function CardGrid({ min = 280, children }: { min?: number; children: ReactNode }) {
  return <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${min}px), 1fr))`, gap: { xs: 2, md: 2.5 } }}>{children}</Box>;
}

const facts = (items: Array<{ label: string; value: string; subtext?: string }>) =>
  items.map((item) => ({
    label: item.label,
    value: item.subtext ? (
      <>
        {item.value}
        <Box component="span" sx={{ display: 'block', mt: 0.25, fontSize: '0.875rem', fontWeight: 400, color: t.inkMuted }}>
          {item.subtext}
        </Box>
      </>
    ) : (
      item.value
    ),
  }));

export default async function Nata2027HubPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);
  const baseUrl = 'https://neramclasses.com';

  // Staff add the 2027 brochure and FAQs in Admin; until then the defaults show.
  const [brochures, dbFaqs] = await Promise.all([
    getActiveNataBrochures(YEAR).catch(() => []),
    getActiveNataFaqs({ year: YEAR, pageSlug: 'nata-2027-hub' }).catch(() => []),
  ]);
  const dynamicFaqs = dbFaqs.map((faq) => ({
    question: faq.question[locale] || faq.question['en'] || '',
    answer: faq.answer[locale] || faq.answer['en'] || '',
  }));
  const faqs = dynamicFaqs.length > 0 ? dynamicFaqs : defaultFaqs;

  return (
    <>
      <JsonLd data={generateBreadcrumbSchema([{ name: 'Home', url: baseUrl }, { name: `NATA ${YEAR}` }])} />
      <JsonLd data={generateFAQSchema(faqs)} />

      <PageHero
        breadcrumb={[{ name: 'Home', href: '/' }, { name: `NATA ${YEAR}` }]}
        eyebrow={`NATA ${YEAR} Guide`}
        title={
          <>
            NATA {YEAR}: Dates, Eligibility and <em>How to Prepare</em>
          </>
        }
        lede="NATA 2027 dates are not announced yet. The brochure is expected in February to March 2027 and Phase 1 tests in April to June 2027 (official notice awaited). The syllabus and format carry over from 2026, so preparation can start now."
        actions={
          <>
            <CtaButton href="/nata-2026/syllabus">See the Syllabus</CtaButton>
            <CtaButton variant="outline" href="/nata-online-coaching">
              NATA {YEAR} Coaching
            </CtaButton>
          </>
        }
        aside={<FactsCard title={`NATA ${YEAR} Quick Facts`} items={QUICK_FACTS} />}
        asideMin={380}
      />

      <Section id="dates" tone="light" header={{ eyebrow: 'Expected', title: `NATA ${YEAR} Expected Dates`, lede: 'Based on the 2026 timeline. Official notice awaited.', align: 'start' }}>
        <FactGrid cellMin={260} items={facts(TIMELINE)} />
      </Section>

      <Section
        id="prepare-now"
        tone="white"
        header={{ eyebrow: 'Start now', title: 'Prepare Now: These Carry Over to 2027', lede: 'Syllabus, format and preparation do not change much year to year. These guides were written for 2026.', align: 'start' }}
      >
        <CardGrid min={260}>
          {PREPARE_NOW.map((page) => (
            <HubCard key={page.slug} href={`/nata-2026/${page.slug}`} title={page.title} desc={page.desc} icon={nataSpokeIcon(page.slug)} cta="Read guide" />
          ))}
        </CardGrid>
      </Section>

      <Section
        id="awaiting-brochure"
        tone="light"
        header={{ title: 'Waiting for the 2027 Brochure', lede: 'These change every year. Until CoA publishes 2027 details, the 2026 versions show how it worked last time.', align: 'start' }}
      >
        <CardGrid min={260}>
          {AWAITING_BROCHURE.map((page) => (
            <HubCard key={page.slug} href={`/nata-2026/${page.slug}`} title={`${page.title} (2026)`} desc={page.desc} icon={<EventOutlinedIcon />} cta="See 2026 details" />
          ))}
        </CardGrid>
      </Section>

      <Section id="format" tone="white" header={{ title: 'Exam Format (as in 2026)', align: 'start' }}>
        <Typography component="p" sx={{ m: 0, mb: 2, maxWidth: t.container.article, fontSize: '1.0625rem', lineHeight: 1.7, color: t.ink }}>
          NATA (National Aptitude Test in Architecture) is conducted by the <strong>Council of Architecture (CoA)</strong> for admission to B.Arch courses across
          India. The 2027 format is expected to stay close to 2026 (official notice awaited).
        </Typography>
        <FactGrid cellMin={260} items={facts(FORMAT)} />
      </Section>

      <Section id="free-tools" tone="light" header={{ eyebrow: 'Free', title: 'Free NATA Tools', align: 'start' }}>
        <CardGrid min={240}>
          {FREE_TOOLS.map((tool) => (
            <HubCard key={tool.title} href={tool.link} title={tool.title} icon={tool.icon} badge="Free" cta="Open" external />
          ))}
        </CardGrid>
      </Section>

      <Section id="brochure" tone="white" header={{ title: 'Official Brochure', lede: `The NATA ${YEAR} information brochure from CoA`, align: 'start' }}>
        {brochures.length > 0 ? (
          <CardGrid min={340}>
            {brochures.map((b) => (
              <InfoCard key={b.id} icon={<DescriptionOutlinedIcon />} title={`NATA ${b.year}, v${b.version}`} meta={b.is_current ? 'Current Version' : undefined}>
                <Box sx={{ mt: 0.5 }}>
                  <CtaButton variant={b.is_current ? 'primary' : 'outline'} size="md" href={b.file_url} external startIcon={<DownloadOutlinedIcon />}>
                    Download PDF
                  </CtaButton>
                </Box>
              </InfoCard>
            ))}
          </CardGrid>
        ) : (
          <EmptyState
            icon={<DescriptionOutlinedIcon />}
            titleAs="h3"
            title={`NATA ${YEAR} Brochure: Not Out Yet`}
            body="CoA has not released the 2027 brochure. It is expected in February to March 2027, and we add it here the day it is out."
          />
        )}
      </Section>

      <Section id="faq" tone="light" width="narrow" header={{ eyebrow: 'Questions', title: 'Frequently Asked Questions', lede: `Common questions about NATA ${YEAR}` }}>
        <FaqList items={faqs} defaultOpen={-1} />
      </Section>

      <CtaBand
        eyebrow="Teaching NATA since 2009"
        title={`Start NATA ${YEAR} Preparation Early`}
        lede="Live online classes, daily drawing practice and mock tests."
        actions={
          <>
            <CtaButton href="/nata-online-coaching">Explore Coaching</CtaButton>
            <CtaButton variant="link" href={buildWhatsAppLink({ text: `Hi, I need help with NATA ${YEAR}` }).href} external>
              Ask on WhatsApp
            </CtaButton>
          </>
        }
      />
    </>
  );
}

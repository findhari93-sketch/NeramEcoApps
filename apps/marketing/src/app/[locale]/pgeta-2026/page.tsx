import type { ReactNode } from 'react';
import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Box } from '@neram/ui';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  generateBreadcrumbSchema,
  generateFAQSchema,
} from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import { getActivePgetaFaqs } from '@neram/database';
import ExamFaqSection from '@/components/exam-hub/sections/ExamFaqSection';
import { getExamGuide, scheduleTimeline } from '@/components/exam-hub/examGuides';
import {
  PGETA_QUICK_FACTS,
  PGETA_SCHEDULE,
  PGETA_MODULES,
  PGETA_FEES,
  PGETA_SCHOLARSHIP,
  PGETA_TEST_CITIES,
  PGETA_NOTABLE_INSTITUTES,
  PGETA_DEFAULT_FAQS,
} from '@/components/pgeta/data/pgetaContent';
import {
  CheckList,
  CtaBand,
  CtaButton,
  FactGrid,
  FactsCard,
  HubCard,
  InfoCard,
  LinkTile,
  PageHero,
  Section,
  Timeline,
  tokens as t,
} from '@/design-system';

/** Keeps prose, lists and timelines at a readable line length inside page-width bands. */
function Readable({ children }: { children: ReactNode }) {
  return <Box sx={{ maxWidth: t.container.article, width: '100%' }}>{children}</Box>;
}

/** Auto-fit card grid: one column on phones. */
function CardGrid({ min = 280, children }: { min?: number; children: ReactNode }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${min}px), 1fr))`, gap: { xs: 2, md: 2.5 } }}>
      {children}
    </Box>
  );
}

/** Plain name tiles (centres, cities): white, 1px line, radius 8. */
function NameTiles({ items, min = 160, label }: { items: readonly string[]; min?: number; label: string }) {
  return (
    <Box
      component="ul"
      aria-label={label}
      sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${min}px), 1fr))`, gap: 1.5 }}
    >
      {items.map((name) => (
        <Box
          component="li"
          key={name}
          sx={{ bgcolor: t.surface, border: `1px solid ${t.line}`, borderRadius: `${t.radius}px`, px: 2, py: 1.75, fontWeight: 600, fontSize: '1rem', lineHeight: 1.4, color: t.ink }}
        >
          {name}
        </Box>
      ))}
    </Box>
  );
}

export const revalidate = 86400;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'PGETA 2027 and 2026: COA M.Arch Entrance Guide',
    description:
      'PGETA 2027 dates are awaited, so this PGETA (PGEAT) guide follows the 2026 cycle: three CBT test dates (May 31, June 14, June 28), eligibility, 4-module exam pattern, fees, top-100 scholarship, test cities, and 132 participating M.Arch institutes. Conducted by the Council of Architecture (COA) for postgraduate architecture admissions.',
    keywords:
      'PGETA 2027, PGETA 2026, PGEAT 2026, PGETA exam, PGETA syllabus, PGETA eligibility, PGETA fees, PGETA test dates, COA M.Arch entrance, M.Arch admission 2026, COA postgraduate exam, Master of Architecture entrance India, PGETA registration',
    alternates: buildAlternates(locale, '/pgeta-2026'),
    openGraph: {
      title: 'PGETA 2026 (PGEAT): COA M.Arch Entrance Test, Complete Guide',
      description:
        'Three test dates, eligibility, 4-module pattern, fees, scholarships, and 132 participating M.Arch institutes for the COA postgraduate architecture entrance.',
      type: 'article',
    },
  };
}

interface PageProps {
  params: { locale: string };
}

export default async function Pgeta2026HubPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);

  const baseUrl = 'https://neramclasses.com';
  const dbFaqs = await getActivePgetaFaqs({ year: 2026, pageSlug: 'pgeta-2026-hub' }).catch(
    () => []
  );
  const dynamicFaqs = (dbFaqs as Array<{ question: Record<string, string>; answer: Record<string, string> }>).map(
    (faq) => ({
      question: faq.question[locale] || faq.question.en || '',
      answer: faq.answer[locale] || faq.answer.en || '',
    })
  );
  const faqs = dynamicFaqs.length > 0 ? dynamicFaqs : PGETA_DEFAULT_FAQS;

  // ─── Structured data ───
  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: baseUrl },
    { name: 'Exam Hub', url: `${baseUrl}/pgeta-2026` },
    { name: 'PGETA 2026' },
  ]);
  const faqSchema = generateFAQSchema(faqs);
  // Three Event schemas, one per test date.
  const eventSchemas = [
    { name: 'PGETA 2026 Test 1', startDate: '2026-05-31T10:00:00+05:30', endDate: '2026-05-31T12:00:00+05:30' },
    { name: 'PGETA 2026 Test 2', startDate: '2026-06-14T10:00:00+05:30', endDate: '2026-06-14T12:00:00+05:30' },
    { name: 'PGETA 2026 Test 3', startDate: '2026-06-28T10:00:00+05:30', endDate: '2026-06-28T12:00:00+05:30' },
  ].map((e) => ({
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: e.name,
    description:
      'Post Graduate Entrance Test in Architecture (PGETA), conducted by the Council of Architecture for M.Arch admissions in India.',
    startDate: e.startDate,
    endDate: e.endDate,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
    location: {
      '@type': 'Place',
      name: 'Designated CBT centres across major Indian cities',
      address: { '@type': 'PostalAddress', addressCountry: 'IN' },
    },
    organizer: {
      '@type': 'Organization',
      name: 'Council of Architecture (COA)',
      url: 'https://www.coa.gov.in',
    },
    inLanguage: 'en',
  }));
  const programSchema = {
    '@context': 'https://schema.org',
    '@type': 'EducationalOccupationalProgram',
    name: 'PGETA 2026 (Post Graduate Entrance Test in Architecture)',
    description:
      'National-level entrance test for admission to Master of Architecture (M.Arch) programs in India. Conducted by the Council of Architecture. Also commonly searched as PGEAT.',
    provider: {
      '@type': 'Organization',
      name: 'Council of Architecture (COA)',
      url: 'https://www.coa.gov.in',
    },
    occupationalCategory: 'Architect',
    educationalCredentialAwarded: 'M.Arch',
    educationalProgramMode: 'In-person CBT',
    timeOfDay: '10:00 to 12:00 IST',
  };

  const guide = getExamGuide('/pgeta-2026');

  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={faqSchema} />
      {eventSchemas.map((schema, i) => (
        <JsonLd key={i} data={schema} />
      ))}
      <JsonLd data={programSchema} />

      <PageHero
        breadcrumb={[{ name: 'Home', href: '/' }, { name: 'PGETA 2026' }]}
        pills={['NEW']}
        eyebrow="M.Arch Entrance"
        title="PGETA 2026 and 2027: The COA M.Arch Entrance, Decoded"
        lede="PGETA 2027 dates are expected (official notice awaited), so this guide uses the 2026 schedule, pattern and fees until COA publishes the 2027 brochure. PGETA, also commonly searched as PGEAT, is the unified national-level entrance test for Master of Architecture (M.Arch) programs in India. Conducted by the Council of Architecture (COA), with three test dates and best-score-retained policy. Below: dates, eligibility, exam pattern, fees, scholarships, and accepting institutes."
        actions={
          <>
            <CtaButton href="/apply">Talk to a counsellor</CtaButton>
            <CtaButton variant="outline" href="https://www.pgeta.in/" external>
              Official PGETA portal
            </CtaButton>
          </>
        }
      />

      {guide && (
        <Section id="guide" tone="light" header={{ eyebrow: 'PGETA 2026 guide', title: 'Explore the PGETA 2026 guide', align: 'start' }}>
          <CardGrid min={260}>
            {guide.spokes.map(({ slug, label, Icon }) => (
              <HubCard key={slug} href={`/pgeta-2026/${slug}`} title={label} icon={<Icon />} cta="Read guide" />
            ))}
          </CardGrid>
        </Section>
      )}

      <Section
        id="at-a-glance"
        tone="white"
        header={{
          title: 'PGETA 2026 at a glance',
          lede: 'The short answer first: PGETA 2026 is a 2-hour CBT with three attempt windows in May and June 2026. Eligibility is a B.Arch with at least 50% marks. The best score across attempts is retained for admission.',
          align: 'start',
          ledeWidth: 760,
        }}
      >
        <FactGrid items={PGETA_QUICK_FACTS.map((fact) => ({ label: fact.label, value: fact.value }))} cellMin={240} />
      </Section>

      <Section
        id="eligibility"
        tone="light"
        header={{
          title: 'Eligibility for PGETA 2026',
          lede: 'You need a Bachelor of Architecture (B.Arch) from a COA-approved institution with at least 50% aggregate marks.',
          align: 'start',
          ledeWidth: 760,
        }}
      >
        <Readable>
          <CheckList
            columnMin={700}
            items={[
              'B.Arch degree from a COA-approved institution.',
              'Minimum 50% aggregate marks (or equivalent CGPA).',
              'Final-year B.Arch students may apply, subject to passing their B.Arch.',
              'No upper age limit.',
              'COA registration is recommended for practising architects but not strictly required to attempt PGETA.',
            ]}
          />
        </Readable>
      </Section>

      <Section
        id="schedule"
        tone="white"
        header={{
          title: 'PGETA 2026 schedule, three attempts',
          lede: 'You may attempt all three tests. The best score is automatically retained for admission. Each attempt requires a separate registration fee.',
          align: 'start',
          ledeWidth: 760,
        }}
      >
        <Readable>
          <Timeline items={scheduleTimeline(PGETA_SCHEDULE)} />
        </Readable>
      </Section>

      <Section
        id="exam-pattern"
        tone="light"
        header={{
          title: 'PGETA 2026 exam pattern, 4 modules across 100 questions',
          lede: 'CBT format, 2 hours, 100 questions in English. Architecture and Design carries the largest weight; the rest cover engineering bridges, electives, and research aptitude.',
          align: 'start',
          ledeWidth: 760,
        }}
      >
        <CardGrid min={340}>
          {PGETA_MODULES.map((mod, idx) => (
            <InfoCard
              key={mod.title}
              code={String(idx + 1).padStart(2, '0')}
              title={mod.title}
              meta={`${mod.questions} Q`}
              body={mod.summary}
            />
          ))}
        </CardGrid>
      </Section>

      <Section
        id="fees"
        tone="white"
        header={{
          title: 'Fees and scholarships',
          lede: 'Per attempt fees vary by category. The COA also funds a top-100 scholarship.',
          align: 'start',
        }}
      >
        <CardGrid min={340}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <FactsCard
              title="Registration fees, per attempt"
              titleAs="h3"
              items={PGETA_FEES.map((fee) => ({ label: fee.category, value: fee.amount }))}
            />
            <Box component="p" sx={{ m: 0, fontSize: '0.9375rem', lineHeight: 1.5, color: t.inkMuted }}>
              Payment online via debit card, credit card, or net banking.
            </Box>
          </Box>
          <InfoCard icon={<WorkspacePremiumOutlinedIcon />} title={PGETA_SCHOLARSHIP.title}>
            <Box sx={{ mt: 0.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Box component="p" sx={{ m: 0, fontSize: '1.125rem', fontWeight: 800, lineHeight: 1.4, color: t.ink }}>
                {PGETA_SCHOLARSHIP.amount}
              </Box>
              <CheckList variant="compact" items={PGETA_SCHOLARSHIP.conditions} />
            </Box>
          </InfoCard>
        </CardGrid>
      </Section>

      <Section
        id="centres"
        tone="light"
        header={{
          title: 'Where is PGETA 2026 conducted?',
          lede: 'PGETA 2026 is held at designated CBT centres across major Indian cities. PGETA is not a from-home online test. You select preferred cities during registration; the final centre is allocated by the conducting body.',
          align: 'start',
          ledeWidth: 760,
        }}
      >
        <NameTiles items={PGETA_TEST_CITIES} label="PGETA 2026 test cities" />
      </Section>

      <Section
        id="participating-institutes"
        tone="white"
        header={{
          title: 'Participating M.Arch institutes',
          lede: 'COA lists approximately 132 approved Master of Architecture programs (as of 2022-23). The full list is on the COA approved-institutions page. Notable accepting institutions include:',
          align: 'start',
          ledeWidth: 760,
        }}
      >
        <NameTiles items={PGETA_NOTABLE_INSTITUTES} min={300} label="Notable PGETA accepting institutions" />
        <Box>
          <CtaButton variant="outline" size="md" href="https://www.coa.gov.in/pgInstitutionStatus.php" external>
            View full COA-approved list
          </CtaButton>
        </Box>
      </Section>

      <Section
        id="pgeta-vs-nata"
        tone="light"
        header={{
          title: 'PGETA vs NATA, what is the difference?',
          lede: 'Both are COA exams but at different levels. NATA is for B.Arch (undergraduate). PGETA is for M.Arch (postgraduate).',
          align: 'start',
          ledeWidth: 760,
        }}
      >
        <CardGrid min={320}>
          <InfoCard title="PGETA 2026">
            <Box sx={{ mt: 1 }}>
              <CheckList
                variant="compact"
                items={[
                  'Postgraduate (M.Arch, 2 years)',
                  'Eligibility: B.Arch with 50% minimum',
                  '2-hour CBT, 100 questions, 4 modules',
                  'Architectural theory, building science, research aptitude',
                  'Up to 3 attempts per year, best score',
                ]}
              />
            </Box>
          </InfoCard>
          <InfoCard title="NATA 2026">
            <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1.5, alignItems: 'flex-start' }}>
              <CheckList
                variant="compact"
                items={[
                  'Undergraduate (B.Arch, 5 years)',
                  'Eligibility: 12th pass with Mathematics',
                  'Drawing offline + MCQ/NCQ online, 3 hours',
                  'Drawing aptitude and design reasoning',
                  'Up to 2 attempts in Phase 1, 1 in Phase 2',
                ]}
              />
              <CtaButton variant="link" size="md" href="/nata-2026">
                See NATA 2026 hub
              </CtaButton>
            </Box>
          </InfoCard>
        </CardGrid>
      </Section>

      <ExamFaqSection faqs={faqs} subtitle="Common questions about PGETA 2026 (also known as PGEAT)" tone="white" />

      <Section id="related" tone="light" header={{ eyebrow: 'Related', title: 'Other exam hubs', align: 'start', size: 'article' }}>
        <CardGrid min={240}>
          <LinkTile href="/nata-2026" title="NATA 2026 hub" />
          <LinkTile href="/jee-barch-hub" title="JEE B.Arch hub" />
          <LinkTile href="/aat-2026" title="AAT 2026 hub" />
        </CardGrid>
      </Section>

      <CtaBand
        title="Planning your M.Arch journey?"
        lede="Talk to a counsellor about preparing for PGETA, choosing a specialisation, and shortlisting M.Arch institutes."
        actions={
          <>
            <CtaButton href="/apply">Talk to a counsellor</CtaButton>
            <CtaButton variant="link" href="https://www.pgeta.in/" external>
              Register on PGETA portal
            </CtaButton>
          </>
        }
      />
    </>
  );
}

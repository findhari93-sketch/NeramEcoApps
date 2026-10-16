import type { ReactNode } from 'react';
import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Box } from '@neram/ui';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  generateBreadcrumbSchema,
  generateFAQSchema,
} from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import { getActiveAatFaqs } from '@neram/database';
import ExamFaqSection from '@/components/exam-hub/sections/ExamFaqSection';
import { GuidePills } from '@/components/exam-hub/sections/GuideBlocks';
import { getExamGuide, scheduleTimeline } from '@/components/exam-hub/examGuides';
import {
  AAT_QUICK_FACTS,
  AAT_SCHEDULE,
  AAT_SYLLABUS,
  AAT_PARTICIPATING_IITS,
  AAT_CENTRES,
  AAT_DRAWING_KIT,
  AAT_DEFAULT_FAQS,
} from '@/components/aat/data/aatContent';
import {
  CheckList,
  CtaBand,
  CtaButton,
  FactGrid,
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

// ISR: revalidate hourly so dynamic FAQs from Supabase pick up admin edits.
export const revalidate = 86400;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title:
      'AAT 2026: Architecture Aptitude Test, IIT B.Arch Dates, Syllabus, Eligibility & Drawing Kit',
    description:
      'Complete AAT 2026 guide: registration June 1-2, exam June 4, results June 7. Eligibility, 5-section syllabus, exam pattern, drawing kit checklist, IIT centres, PwD provisions, FAQs. Conducted by JEE (Advanced) for B.Arch at IIT Roorkee, IIT Kharagpur, IIT (BHU) Varanasi.',
    keywords:
      'AAT 2026, Architecture Aptitude Test 2026, AAT exam 2026, AAT eligibility, AAT syllabus, AAT exam pattern, AAT JEE Advanced, AAT registration, AAT cut-off, IIT B.Arch admission, IIT Roorkee architecture, IIT Kharagpur architecture, IIT BHU architecture',
    alternates: buildAlternates(locale, '/aat-2026'),
    openGraph: {
      title: 'AAT 2026: Complete Guide to Architecture Aptitude Test for IIT B.Arch',
      description:
        'AAT 2026 dates, syllabus, eligibility, exam pattern, IIT centres, drawing kit checklist, and FAQs for B.Arch admissions to IIT Roorkee, IIT Kharagpur, and IIT (BHU) Varanasi.',
      type: 'article',
    },
  };
}

interface PageProps {
  params: { locale: string };
}

export default async function Aat2026HubPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);

  const baseUrl = 'https://neramclasses.com';
  const dbFaqs = await getActiveAatFaqs({ year: 2026, pageSlug: 'aat-2026-hub' }).catch(
    () => []
  );
  const dynamicFaqs = (dbFaqs as Array<{ question: Record<string, string>; answer: Record<string, string> }>).map(
    (faq) => ({
      question: faq.question[locale] || faq.question.en || '',
      answer: faq.answer[locale] || faq.answer.en || '',
    })
  );
  const faqs = dynamicFaqs.length > 0 ? dynamicFaqs : AAT_DEFAULT_FAQS;

  // ─── Structured data ───
  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: baseUrl },
    { name: 'Exam Hub', url: `${baseUrl}/aat-2026` },
    { name: 'AAT 2026' },
  ]);
  const faqSchema = generateFAQSchema(faqs);
  const eventSchema = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: 'Architecture Aptitude Test (AAT) 2026',
    description:
      'AAT 2026 is the qualifying test for B.Arch admission at IIT Roorkee, IIT Kharagpur, and IIT (BHU) Varanasi. Conducted by JEE (Advanced) 2026 board.',
    startDate: '2026-06-04T09:00:00+05:30',
    endDate: '2026-06-04T12:00:00+05:30',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
    location: AAT_CENTRES.map((iit) => ({
      '@type': 'Place',
      name: iit,
      address: { '@type': 'PostalAddress', addressCountry: 'IN' },
    })),
    organizer: {
      '@type': 'Organization',
      name: 'JEE (Advanced) 2026 Board',
      url: 'https://jeeadv.ac.in',
    },
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'INR',
      availability: 'https://schema.org/InStock',
      url: 'https://jeeadv.ac.in',
      validFrom: '2026-06-01T10:00:00+05:30',
    },
    inLanguage: 'en',
  };
  const programSchema = {
    '@context': 'https://schema.org',
    '@type': 'EducationalOccupationalProgram',
    name: 'AAT 2026 (Architecture Aptitude Test)',
    description:
      'Qualifying test for admission to the 5-year Bachelor of Architecture program at IIT Roorkee, IIT Kharagpur, and IIT (BHU) Varanasi. Eligibility requires JEE (Advanced) 2026 qualification.',
    provider: {
      '@type': 'Organization',
      name: 'JEE (Advanced) 2026',
      url: 'https://jeeadv.ac.in',
    },
    occupationalCategory: 'Architect',
    educationalCredentialAwarded: 'B.Arch',
    timeOfDay: '09:00 to 12:00 IST',
    educationalProgramMode: 'In-person',
    typicalCreditsPerTerm: { '@type': 'StructuredValue', value: 'Pass or Fail' },
  };

  const guide = getExamGuide('/aat-2026');

  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={faqSchema} />
      <JsonLd data={eventSchema} />
      <JsonLd data={programSchema} />

      <PageHero
        breadcrumb={[{ name: 'Home', href: '/' }, { name: 'AAT 2026' }]}
        pills={['NEW']}
        eyebrow="Architecture Aptitude Test"
        title="AAT 2026: The IIT Architecture Aptitude Test, Decoded"
        lede="AAT is the qualifying test for B.Arch at IIT Roorkee, IIT Kharagpur, and IIT (BHU) Varanasi. Pass status, plus your JEE (Advanced) 2026 rank, decides allotment. Here is everything you need: dates, syllabus, exam pattern, drawing kit, and the IIT centres."
        actions={
          <>
            <CtaButton href="/apply">Talk to a counsellor</CtaButton>
            <CtaButton variant="outline" href="https://jeeadv.ac.in/documents/aat-syllabus.pdf" external>
              Official AAT syllabus PDF
            </CtaButton>
          </>
        }
      />

      {guide && (
        <Section id="guide" tone="light" header={{ eyebrow: 'AAT 2026 guide', title: 'Explore the AAT 2026 guide', align: 'start' }}>
          <CardGrid min={260}>
            {guide.spokes.map(({ slug, label, Icon }) => (
              <HubCard key={slug} href={`/aat-2026/${slug}`} title={label} icon={<Icon />} cta="Read guide" />
            ))}
          </CardGrid>
        </Section>
      )}

      <Section
        id="at-a-glance"
        tone="white"
        header={{
          title: 'AAT 2026 at a glance',
          lede: 'The short answer first: AAT 2026 is a 3-hour offline pen-and-paper test on Thursday, June 4, 2026. It is free for JEE (Advanced) qualifiers, in English only, and the result is simply Pass or Fail.',
          align: 'start',
          ledeWidth: 760,
        }}
      >
        <FactGrid items={AAT_QUICK_FACTS.map((fact) => ({ label: fact.label, value: fact.value }))} cellMin={240} />
      </Section>

      <Section
        id="eligibility"
        tone="light"
        header={{
          title: 'Eligibility for AAT 2026',
          lede: 'Only candidates who have qualified JEE (Advanced) 2026 are eligible for AAT 2026. There is no separate eligibility check.',
          align: 'start',
          ledeWidth: 760,
        }}
      >
        <Readable>
          <CheckList
            columnMin={700}
            items={[
              'You must appear and qualify in JEE (Advanced) 2026.',
              'The Class XII (or equivalent) performance criterion in Clause 26 of the JEE (Advanced) 2026 brochure continues to apply for B.Arch admission.',
              'You register for AAT separately on the JEE (Advanced) 2026 portal during the 48-hour window after results.',
              'There is no age limit beyond what JEE (Advanced) requires.',
              'PwD candidates, see the dedicated provisions section below.',
            ]}
          />
        </Readable>
      </Section>

      <Section
        id="schedule"
        tone="white"
        header={{
          title: 'AAT 2026 schedule',
          lede: 'Registration is a tight 48-hour window after JEE (Advanced) results. Plan ahead.',
          align: 'start',
        }}
      >
        <Readable>
          <Timeline items={scheduleTimeline(AAT_SCHEDULE)} />
        </Readable>
      </Section>

      <Section
        id="exam-pattern"
        tone="light"
        header={{
          title: 'AAT 2026 exam pattern',
          lede: 'One offline pen-and-paper test of 3 hours. The question paper is in English only. The result is Pass or Fail, with cut-off decided by the Joint Implementation Committee. No marks, percentile, or AAT rank is published.',
          align: 'start',
          ledeWidth: 760,
        }}
      >
        <FactGrid
          cellMin={240}
          items={[
            { label: 'Mode', value: 'Offline, pen and paper' },
            { label: 'Duration', value: '3 hours (4 hours for eligible PwD candidates)' },
            { label: 'Language', value: 'English only' },
            { label: 'Result format', value: 'Pass or Fail (no marks, no rank)' },
          ]}
        />
      </Section>

      <Section
        id="syllabus"
        tone="white"
        header={{
          title: 'AAT 2026 syllabus, 5 sections',
          lede: 'The official syllabus is published at jeeadv.ac.in/documents/aat-syllabus.pdf. Below is a faithful breakdown of each area, the skills it tests, and what to practice.',
          align: 'start',
          ledeWidth: 760,
        }}
      >
        <CardGrid min={340}>
          {AAT_SYLLABUS.map((section, idx) => (
            <InfoCard key={section.title} code={String(idx + 1).padStart(2, '0')} title={section.title} body={section.summary}>
              <Box sx={{ mt: 1.25 }}>
                <GuidePills label={`Skills tested in ${section.title}`} items={section.skills} />
              </Box>
            </InfoCard>
          ))}
        </CardGrid>
      </Section>

      <Section
        id="participating-iits"
        tone="light"
        header={{
          title: 'Three IITs offer B.Arch via AAT',
          lede: 'Seats are allotted strictly on JEE (Advanced) 2026 All India Rank, with AAT Pass status as the prerequisite. JoSAA conducts the counselling.',
          align: 'start',
          ledeWidth: 760,
        }}
      >
        <CardGrid min={300}>
          {AAT_PARTICIPATING_IITS.map((iit) => (
            <InfoCard key={iit.name} icon={<AccountBalanceOutlinedIcon />} title={iit.name} meta={iit.program} body={iit.note}>
              {iit.seats}
            </InfoCard>
          ))}
        </CardGrid>
      </Section>

      <Section
        id="centres"
        tone="white"
        header={{
          title: 'AAT 2026 examination centres',
          lede: 'AAT 2026 is conducted at seven zonal IIT centres in India. The official centre list is at jeeadv.ac.in/aat_centre_list.html. You select your preferred centre during registration.',
          align: 'start',
          ledeWidth: 760,
        }}
      >
        <NameTiles items={AAT_CENTRES} label="AAT 2026 examination centres" />
      </Section>

      <Section
        id="drawing-kit"
        tone="light"
        header={{
          title: 'Drawing kit checklist',
          lede: 'Candidates must bring their own drawing and colouring aids. Pack the night before.',
          align: 'start',
        }}
      >
        <CardGrid min={320}>
          <InfoCard icon={<CheckCircleOutlineIcon />} title="Bring">
            <Box sx={{ mt: 1 }}>
              <CheckList variant="compact" items={[...AAT_DRAWING_KIT.bring]} />
            </Box>
          </InfoCard>
          <InfoCard icon={<BlockOutlinedIcon />} title="Avoid">
            <Box sx={{ mt: 1 }}>
              <CheckList variant="compact" tone="no" items={[...AAT_DRAWING_KIT.avoid]} />
            </Box>
          </InfoCard>
        </CardGrid>
      </Section>

      <Section
        id="pwd"
        tone="white"
        header={{
          title: 'Provisions for PwD candidates',
          lede: 'PwD candidates with at least 40% impairment under the RPwD Act 2016 are eligible for one hour of compensatory time, making AAT a 4-hour test. The same applies to candidates with less than 40% disability who have difficulty writing under Section 2(s) of the said Act.',
          align: 'start',
          ledeWidth: 760,
        }}
      >
        <Readable>
          <CheckList
            columnMin={700}
            items={[
              'Compensatory time: one additional hour (total 4 hours).',
              'Scribe (amanuensis) services available on request.',
              'Required certificate formats are in Annexure-II of the JEE (Advanced) 2026 brochure.',
              'Request must be made during JEE (Advanced) 2026 registration, not at the AAT centre.',
            ]}
          />
        </Readable>
      </Section>

      <Section
        id="aat-vs-nata"
        tone="light"
        header={{
          title: 'AAT vs NATA, when do you take which?',
          lede: 'Quick answer: AAT is for B.Arch at three IITs and requires JEE Advanced. NATA is for B.Arch at most other Indian colleges, with no JEE requirement. Many serious aspirants take both.',
          align: 'start',
          ledeWidth: 760,
        }}
      >
        <CardGrid min={320}>
          <InfoCard title="AAT 2026">
            <Box sx={{ mt: 1 }}>
              <CheckList
                variant="compact"
                items={[
                  '3 IITs only (Roorkee, Kharagpur, BHU)',
                  'Eligibility: JEE (Advanced) qualifier',
                  '3-hour offline pen-and-paper',
                  'Pass or Fail, no rank',
                  'Allotment by JEE (Advanced) AIR',
                ]}
              />
            </Box>
          </InfoCard>
          <InfoCard title="NATA 2026">
            <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1.5, alignItems: 'flex-start' }}>
              <CheckList
                variant="compact"
                items={[
                  'Most COA-approved B.Arch colleges',
                  'Eligibility: 12th pass with Mathematics',
                  'Drawing offline + MCQ/NCQ online, 3 hours',
                  'Marks and percentile published',
                  '2 attempts in Phase 1, 1 in Phase 2',
                ]}
              />
              <CtaButton variant="link" size="md" href="/nata-2026">
                See NATA 2026 hub
              </CtaButton>
            </Box>
          </InfoCard>
        </CardGrid>
      </Section>

      <ExamFaqSection faqs={faqs} subtitle="Common questions about AAT 2026" tone="white" />

      <Section id="related" tone="light" header={{ eyebrow: 'Related', title: 'Other exam hubs', align: 'start', size: 'article' }}>
        <CardGrid min={240}>
          <LinkTile href="/nata-2026" title="NATA 2026 hub" />
          <LinkTile href="/jee-barch-hub" title="JEE B.Arch hub" />
          <LinkTile href="/pgeta-2026" title="PGETA 2026 hub (M.Arch)" />
        </CardGrid>
      </Section>

      <CtaBand
        title="Preparing for AAT 2026?"
        lede="Neram coaches both NATA and AAT aspirants. Our drawing labs and architectural awareness modules cover the AAT pattern end-to-end."
        actions={
          <>
            <CtaButton href="/apply">Talk to a counsellor</CtaButton>
            <CtaButton variant="link" href="/courses">
              See coaching programs
            </CtaButton>
          </>
        }
      />
    </>
  );
}

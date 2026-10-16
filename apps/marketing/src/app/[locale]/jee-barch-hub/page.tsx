import { Metadata } from 'next';
import { buildAlternates } from '@/lib/seo/metadata';
import { Box, Typography } from '@neram/ui';
import { siteTokens as t } from '@neram/ui/site-tokens';
import { setRequestLocale } from 'next-intl/server';
import { getJoSAAColleges } from '@/lib/college-hub/queries';
import CollegeListingCard from '@/components/college-hub/CollegeListingCard';
import { CheckList, CtaBand, CtaButton, EmptyState, FaqList, PageHero, Section } from '@/design-system';

export const revalidate = 86400;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    alternates: buildAlternates(locale, '/jee-barch-hub'),
    title: 'JEE Paper 2 B.Arch Colleges: NITs, SPAs, IITs | JoSAA 2026',
    description:
      'Complete list of NIT, SPA, IIT architecture colleges admitting through JEE Main Paper 2 via JoSAA counseling. Compare cutoffs, fees, and placements.',
    keywords: [
      'JEE Paper 2 B.Arch',
      'JoSAA architecture',
      'NIT architecture',
      'SPA architecture',
      'IIT B.Arch',
    ],
  };
}

const FAQ_ITEMS = [
  {
    question: 'Which colleges accept JEE Main Paper 2 for B.Arch?',
    answer:
      'JEE Main Paper 2 is used for admission to NITs (National Institutes of Technology), SPAs (School of Planning and Architecture), IITs (with B.Arch programs), and other centrally funded institutions via JoSAA counseling.',
  },
  {
    question: 'What is the cutoff for NIT Trichy B.Arch?',
    answer:
      'NIT Trichy B.Arch general category cutoff typically ranges from rank 500-1500 depending on the year. Home state category (Tamil Nadu) cutoffs may be different. Check the JoSAA portal for round-wise cutoffs.',
  },
  {
    question: 'Is JEE Paper 2 harder than NATA?',
    answer:
      'JEE Paper 2 is more competitive due to limited NIT/SPA seats (around 2000 total nationally). NATA has a broader pool of colleges. Strong math is critical for JEE Paper 2. Both are valid pathways to B.Arch.',
  },
];

const PAPERS = [
  {
    id: 'paper-2a',
    code: 'Paper 2A',
    title: 'B.Arch (Architecture)',
    body: 'Five-year professional Bachelor of Architecture, COA-registered. Routes you into NITs, SPAs, IIITs, and a few centrally funded institutes through JoSAA.',
    points: [
      'Eligibility: 12th pass with Physics, Chemistry, Mathematics; aggregate norms apply.',
      'Sections: Mathematics, Aptitude (MCQ), and Drawing (offline pen-and-paper).',
      'Total marks: 400. Drawing is 100, Math is 100, Aptitude is 200.',
      'Counselling: JoSAA, six rounds in June and July.',
    ],
    cta: { label: 'Paper 2A prep guide', href: '/jee-paper-2-preparation' },
  },
  {
    id: 'paper-2b',
    code: 'Paper 2B',
    title: 'B.Planning',
    body: 'Four-year Bachelor of Planning, focused on urban and regional planning, GIS, transportation, and policy. Smaller seat pool, but a strong path into urban-design careers.',
    points: [
      'Eligibility: 12th pass with Mathematics; aggregate norms apply.',
      'Sections: Mathematics, Aptitude (MCQ), and Planning-Based Questions (MCQ).',
      'Total marks: 400. All MCQ, no drawing test.',
      'Counselling: JoSAA, alongside Paper 2A choices.',
    ],
    cta: { label: 'B.Planning colleges via JoSAA', href: '/colleges/josaa' },
  },
];

export default async function JEEBArchHubPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  const colleges = await getJoSAAColleges();

  const stats = [
    { label: 'JoSAA Architecture Colleges (NITs, SPAs, IITs)', value: `${colleges.length}+` },
    { label: 'Total Seats (across all JoSAA colleges)', value: '~2,000' },
    { label: 'JEE Paper 2 Marks (Math 100, Aptitude 200)', value: '300' },
    { label: 'JoSAA Rounds (June to July counseling)', value: '6' },
  ];

  return (
    <>
      <PageHero
        breadcrumb={[{ name: 'Home', href: '/' }, { name: 'JEE Paper 2 B.Arch' }]}
        eyebrow="JoSAA 2026"
        title="JEE Paper 2: NITs, SPAs, IITs for B.Arch"
        lede="JEE Main Paper 2 is the NTA-conducted gateway to top government architecture and planning colleges. Paper 2A admits to B.Arch, Paper 2B to B.Planning, both via JoSAA. NIT Trichy, MNNIT Allahabad, SPA Delhi, and more."
        actions={
          <>
            <CtaButton href="/colleges/josaa" size="lg">
              All JoSAA Colleges
            </CtaButton>
            <CtaButton variant="outline" href="/jee-paper-2-preparation" size="lg">
              JEE Paper 2 Guide
            </CtaButton>
          </>
        }
        stats={stats}
      />

      <Section
        id="paper-2a-vs-2b"
        tone="light"
        gap={3}
        header={{
          title: 'JEE Main Paper 2: which paper for which degree?',
          lede: 'NTA conducts JEE Main Paper 2 in two parts: Paper 2A for the 5-year B.Arch program, and Paper 2B for the 4-year B.Planning program. Both are 3 hours and run in the same session at the same centres, but the question paper differs.',
          ledeWidth: 760,
          align: 'start',
          size: 'article',
        }}
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: { xs: 2, md: 2.5 } }}>
          {PAPERS.map((p) => (
            <Box
              key={p.id}
              id={p.id}
              sx={{
                bgcolor: t.surface,
                border: `1px solid ${t.line}`,
                borderRadius: '8px',
                p: { xs: 2.5, sm: 3 },
                display: 'flex',
                flexDirection: 'column',
                gap: 1.5,
                color: t.ink,
                scrollMarginTop: '96px',
              }}
            >
              <Typography
                component="span"
                sx={{ fontFamily: t.fontMono, fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.gold800 }}
              >
                {p.code}
              </Typography>
              <Typography component="h3" sx={{ m: 0, fontSize: '1.25rem', fontWeight: 800, lineHeight: 1.3 }}>
                {p.title}
              </Typography>
              <Typography component="p" sx={{ m: 0, fontSize: '1rem', lineHeight: 1.6, color: t.inkMuted }}>
                {p.body}
              </Typography>
              <CheckList variant="compact" items={p.points} />
              <Box sx={{ mt: 'auto', pt: 0.5 }}>
                <CtaButton variant="link" href={p.cta.href}>
                  {p.cta.label}
                </CtaButton>
              </Box>
            </Box>
          ))}
        </Box>
      </Section>

      <Section
        id="josaa-colleges"
        tone="white"
        gap={3}
        header={{ title: `JoSAA B.Arch Colleges (${colleges.length} found)`, align: 'start', size: 'article' }}
      >
        {colleges.length === 0 ? (
          <EmptyState
            titleAs="h3"
            title="JoSAA college data coming soon."
            body="Check back after data entry is complete."
          />
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 2 }}>
            {colleges.map((college) => (
              <CollegeListingCard key={college.id} college={college} />
            ))}
          </Box>
        )}
      </Section>

      <Section id="faq" tone="light" width="narrow" header={{ eyebrow: 'Questions', title: 'Frequently Asked Questions' }}>
        <FaqList items={FAQ_ITEMS} />
      </Section>

      <CtaBand
        title="Aiming for an NIT or SPA seat?"
        lede="Read the JEE Paper 2 preparation guide, then compare every JoSAA architecture college before you fill your choices."
        actions={
          <>
            <CtaButton href="/jee-paper-2-preparation">JEE Paper 2 Guide</CtaButton>
            <CtaButton variant="link" href="/colleges/josaa">
              All JoSAA Colleges
            </CtaButton>
          </>
        }
      />
    </>
  );
}

import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Box, Typography } from '@neram/ui';
import { siteTokens as t } from '@neram/ui/site-tokens';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import DrawOutlinedIcon from '@mui/icons-material/DrawOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';

import { buildAlternates } from '@/lib/seo/metadata';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema, generateFAQSchema, generateArticleSchema } from '@/lib/seo/schemas';
import {
  HUB_REGISTRY,
  getJEEOnlyHubs,
  getNataOnlyHubs,
  getBothAcceptedHubs,
  TOTAL_HUBS,
  type HubSummary,
} from '@/data/counselling-2026';
import type { ExamRoute, Status, Region } from '@/data/counselling-2026/schema';
import {
  CtaBand,
  CtaButton,
  FaqList,
  HubCard,
  HubIndex,
  NavCard,
  Section,
  StatusBanner,
  iconTileSx,
  type HubGroup,
} from '@/design-system';

export const revalidate = 86400;

const baseUrl = 'https://neramclasses.com';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'B.Arch Counselling Guide 2026: All 28 State & National Counsellings',
    description:
      'Complete India B.Arch counselling guide for 2026: JoSAA, CSAB, CEPT, TNEA, KEAM, MHT-CET, KEA, JAC Delhi, ACPC, and 20 more state and national counsellings. Decision tree, eligibility, dates, free tools.',
    keywords:
      'B.Arch counselling 2026, B.Arch admission India, JoSAA 2026, TNEA B.Arch, KEAM, MHT-CET CAP, NATA counselling, JEE Paper 2 counselling, architecture admission',
    alternates: buildAlternates(locale, '/counseling'),
    openGraph: {
      title: 'B.Arch Counselling 2026: 28 State & National Hubs in One Place',
      description:
        'Decision-tree guide to every B.Arch counselling in India. JoSAA, CEPT, TNEA, KEAM, MHT-CET, KEA, JAC, ACPC and more. Free tools, FAQs, real cutoffs.',
      url: `${baseUrl}/counseling`,
      type: 'article',
    },
  };
}

interface PageProps {
  params: { locale: string };
}

const STATUS_BADGE: Record<Status, string> = {
  live: 'Live',
  tbd: 'Schedule TBD',
  'coming-soon': 'Coming soon',
};

const REGION_LABEL: Record<Region, string> = {
  national: 'National',
  south: 'South India',
  north: 'North India',
  east: 'East India',
  west: 'West India',
  central: 'Central India',
};

const REGION_ORDER: Region[] = ['national', 'south', 'west', 'north', 'east', 'central'];

const ROUTE_LABEL: Record<ExamRoute, string> = {
  NATA: 'NATA',
  JEE_P2: 'JEE P2',
  JEE_ADV_AAT: 'JEE Adv + AAT',
};

const CONCEPTS = [
  {
    slug: 'freeze-float-slide',
    title: 'Freeze vs Float vs Slide',
    summary: 'JoSAA decision matrix with worked examples. Should you freeze your seat or try for higher preference?',
  },
  {
    slug: 'josaa-vs-csab',
    title: 'JoSAA vs CSAB',
    summary: 'Three CSAB verticals (Special, NEUT, Supernumerary) and the rule that cancels your JoSAA seat.',
  },
  {
    slug: 'aat-explained',
    title: 'AAT Explained',
    summary: 'AAT is Pass or Fail. Why JEE Advanced AIR drives final IIT B.Arch allotment, not AAT score.',
  },
  {
    slug: 'nata-vs-jee-paper-2',
    title: 'NATA vs JEE Paper 2',
    summary: 'Exam comparison, state acceptance map, and dual-attempt strategy for maximum coverage.',
  },
  {
    slug: 'eligibility-45-vs-50-rule',
    title: '45% vs 50% PCM Rule',
    summary: 'COA 2024 norm clarifies 45% PCM. Some states still apply 50%. Diploma route works too.',
  },
];

const CROSS_FAQS = [
  {
    question: 'Which B.Arch counsellings should I apply to?',
    answer:
      'Apply to JoSAA if you have JEE Main Paper 2 or JEE Advanced. Apply to your home state counselling (TNEA for Tamil Nadu, KEAM for Kerala, MHT-CET for Maharashtra, KEA for Karnataka, etc.) for state quota seats. CEPT and BIT Mesra are separate, NATA-only premium options. Apply to multiple counsellings, allotment timelines vary, you only commit when you accept a seat.',
  },
  {
    question: 'Is NATA mandatory for every B.Arch counselling?',
    answer:
      'No. JoSAA, CSAB, JAC Delhi, and JAC Chandigarh accept JEE Main Paper 2 only. KEAM and HSTES accept NATA only. Most state counsellings (TNEA, MHT-CET, KEA, AP, TG, UPTAC, ACPC) accept either NATA or JEE Paper 2. Submit both for maximum coverage.',
  },
  {
    question: 'What is the minimum eligibility for B.Arch?',
    answer:
      '10+2 with Physics and Mathematics compulsory plus one more subject (Chemistry, Biology, CS, IP, Engineering Graphics, or Vocational), with 45% PCM aggregate per Council of Architecture\'s 2024 norm. Some state counsellings still apply 50%. A 10+3 Diploma with Mathematics also qualifies.',
  },
  {
    question: 'How is B.Arch merit calculated?',
    answer:
      'Most counsellings use a 50:50 formula: 50% NATA or JEE Paper 2 score plus 50% Class 12 aggregate. Tamil Nadu (TNEA) scales HSC marks to 200 and adds NATA or JEE P2 (200) for a total of 400. Kerala uses NATA plus 12th marks. Each state has its own normalisation, always read the official brochure.',
  },
  {
    question: 'Does JEE Main Paper 2 work for state B.Arch quota?',
    answer:
      'Yes for most states (TNEA, MHT-CET, KEA, AP, TG, UPTAC, ACPC, REAP, WBJEE, OJEE). No for KEAM Kerala (NATA only) and HSTES Haryana (NATA only). Always confirm in the state\'s 2026 brochure.',
  },
  {
    question: 'What if I am from a state with very few B.Arch colleges?',
    answer:
      'For most thin-pool states (Bihar, Jharkhand, Chhattisgarh, Goa, J&K, Himachal, Uttarakhand, most Northeast states), JoSAA is the better route to a high-quality NIT or SPA seat. Local state counsellings have very limited seats, often at lower-tier institutes. Plan for JoSAA and use the state counselling as a backup.',
  },
  {
    question: 'Is B.Arch a 4-year or 5-year course?',
    answer:
      'B.Arch is a 5-year course (10 semesters), mandated by the Council of Architecture. Lateral entry into the second year is rare and policies vary, do not plan around it.',
  },
  {
    question: 'Can NRI candidates apply to B.Arch counsellings?',
    answer:
      'Most state counsellings have a separate 15% All India quota or NRI quota. Application fees are higher (e.g. ₹5,000 in Maharashtra for NRI/OCI/PIO/FN). DASA (Direct Admission of Students Abroad) is a separate central scheme for some institutes, check institute-level policies.',
  },
  {
    question: 'When do 2026 B.Arch counsellings start?',
    answer:
      'JEE Advanced 2026 is on May 17, AAT on June 4. JoSAA registration is expected to open in mid-June 2026. State counsellings start staggered from June through August: TNEA in June, MHT-CET in July, KEAM, AP, TG in July to September. Bookmark the master hub for live status updates.',
  },
  {
    question: 'How do I avoid the JoSAA seat cancellation trap with CSAB?',
    answer:
      'If you accept a JoSAA seat and then register for CSAB Special, getting any seat in CSAB automatically cancels your JoSAA allotment. The cancellation cannot be reverted. If your JoSAA seat is acceptable, simply do not register for CSAB. Read the JoSAA vs CSAB explainer for full mechanics.',
  },
];

const hubHref = (h: HubSummary) => `/counseling/${h.slug}`;

/** One column of the "which counselling do I qualify for" picker. */
function RouteColumn({
  icon,
  title,
  caption,
  hubs,
  footnote,
}: {
  icon: ReactNode;
  title: string;
  caption: string;
  hubs: HubSummary[];
  footnote?: string;
}) {
  const routed = hubs.filter((h) => h.available);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box aria-hidden sx={iconTileSx}>
          {icon}
        </Box>
        <Typography component="h3" sx={{ m: 0, fontSize: '1.125rem', fontWeight: 700, lineHeight: 1.3, color: t.ink }}>
          {title}
        </Typography>
      </Box>
      <Typography component="p" sx={{ m: 0, fontSize: '1rem', lineHeight: 1.5, color: t.inkMuted }}>
        {caption}
      </Typography>
      <NavCard
        title={`${routed.length} counsellings`}
        ariaLabel={`${title} counsellings`}
        links={routed.map((h) => ({ label: h.shortName, href: hubHref(h) }))}
      />
      {footnote && (
        <Typography component="p" sx={{ m: 0, fontSize: '0.875rem', lineHeight: 1.5, color: t.inkMuted }}>
          {footnote}
        </Typography>
      )}
    </Box>
  );
}

export default function CounselingHubPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);
  const localePrefix = locale === 'en' ? '' : `/${locale}`;

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: locale === 'en' ? baseUrl : `${baseUrl}/${locale}` },
    { name: 'Counselling', url: `${baseUrl}${localePrefix}/counseling` },
  ]);
  const faqSchema = generateFAQSchema(CROSS_FAQS);
  const articleSchema = generateArticleSchema({
    title: 'B.Arch Counselling Guide 2026',
    description:
      'Decision-tree guide to all 28 B.Arch counsellings in India: JoSAA, CSAB, CEPT, TNEA, KEAM, MHT-CET, KEA, AP/TG, JAC Delhi, ACPC and more.',
    url: `${baseUrl}/counseling`,
    publishedAt: '2026-05-08',
    modifiedAt: '2026-05-08',
    author: 'Neram Classes',
    category: 'B.Arch Counselling',
  });

  const jeeOnly = getJEEOnlyHubs();
  const nataOnly = getNataOnlyHubs();
  const both = getBothAcceptedHubs();

  const liveCount = HUB_REGISTRY.filter((h) => h.status === 'live').length;
  const tbdCount = HUB_REGISTRY.filter((h) => h.status === 'tbd').length;

  // Every counselling with a route, grouped by region. Each card links to its hub.
  const groups: HubGroup[] = REGION_ORDER.map((region) => ({
    key: region,
    label: REGION_LABEL[region],
    items: HUB_REGISTRY.filter((h) => h.region === region && h.available).map((h) => {
      const routes = h.examRoutes.map((r) => ROUTE_LABEL[r]).join(', ');
      return {
        href: hubHref(h),
        title: h.shortName,
        desc: `Accepts ${routes}. ${h.blurb}`,
        icon: region === 'national' ? <AccountBalanceOutlinedIcon /> : <PlaceOutlinedIcon />,
        badge: STATUS_BADGE[h.status],
        keywords: `${h.title} ${h.authority} ${REGION_LABEL[h.region]} ${routes} tier ${h.tier}`,
      };
    }),
  })).filter((g) => g.items.length > 0);

  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={articleSchema} />
      <JsonLd data={faqSchema} />

      <HubIndex
        breadcrumb={[{ name: 'Home', href: '/' }, { name: 'Counselling' }]}
        eyebrow="B.Arch counselling"
        heading={`All ${TOTAL_HUBS} B.Arch counsellings in India`}
        title="B.Arch Counselling 2026"
        lede={`Every B.Arch admission counselling in India (${TOTAL_HUBS} in total). Eligibility, dates, cutoffs, and decision-tree guidance for picking the right one for you.`}
        intro={
          <Typography component="p" sx={{ m: 0, fontFamily: t.fontMono, fontSize: '0.8125rem', lineHeight: 1.6, color: t.paperSubtle }}>
            {liveCount} live now · {tbdCount} awaiting 2026 brochure · Updated 8 May 2026
          </Typography>
        }
        searchPlaceholder="Find a counselling, e.g. TNEA, JoSAA, KEAM"
        allLabel="All counsellings"
        countNoun="counsellings"
        cardCta="Read guide"
        groups={groups}
      >
        <Section id="cycle-status" tone="white" py={{ xs: 4, md: 5 }}>
          <StatusBanner
            status="tbd"
            tag="2026 cycle"
            label="2026 cycle is starting now."
            detail="JEE Advanced is on May 17, AAT on June 4. Most state counsellings open from June through August. Pages flagged “Schedule TBD” are based on 2025 cycle data and will be refreshed when official 2026 brochures release."
            note="Information curated from official counselling brochures and verified against state DTE portals. Always cross-check on the official portal before submitting any application."
          />
        </Section>

        <Section
          id="which-counselling"
          tone="light"
          header={{
            title: 'Which counselling do I qualify for?',
            lede: 'Pick the entrance route you have. Counsellings are grouped by what they accept.',
            align: 'start',
            size: 'article',
          }}
        >
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: { xs: 4, md: 3 }, alignItems: 'start' }}>
            <RouteColumn
              icon={<ScienceOutlinedIcon />}
              title="JEE Main Paper 2 only"
              caption="No NATA score? You can still apply to:"
              hubs={jeeOnly}
            />
            <RouteColumn
              icon={<DrawOutlinedIcon />}
              title="NATA only"
              caption="Have NATA but not JEE Paper 2:"
              hubs={nataOnly}
              footnote="Plus CEPT University (NATA-only premium private)."
            />
            <RouteColumn
              icon={<TaskAltOutlinedIcon />}
              title="NATA + JEE Paper 2"
              caption={`Both scores give you full access. ${both.length} counsellings accept either:`}
              hubs={both.slice(0, 8)}
              footnote={both.length > 8 ? `And ${both.length - 8} more state counsellings.` : undefined}
            />
          </Box>
        </Section>

        <Section
          id="concepts"
          tone="white"
          gap={3}
          header={{ title: 'Counselling concepts every aspirant should know', align: 'start', size: 'article' }}
        >
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: { xs: 2, md: 2.5 } }}>
            {CONCEPTS.map((c) => (
              <HubCard
                key={c.slug}
                href={`/counseling/concepts/${c.slug}`}
                title={c.title}
                desc={c.summary}
                icon={<LightbulbOutlinedIcon />}
                cta="Read explainer"
              />
            ))}
          </Box>
        </Section>

        <Section id="faq" tone="light" width="narrow" header={{ eyebrow: 'Questions', title: 'Cross-counselling FAQs' }}>
          <FaqList items={CROSS_FAQS} />
        </Section>

        <CtaBand
          eyebrow="Free tools"
          title="Predict your B.Arch admission chances"
          lede="Use the free Neram tools to calculate your cutoff score, predict your rank, and find colleges across all 28 counsellings you can get into."
          actions={
            <>
              <CtaButton href="https://app.neramclasses.com/tools/nata/cutoff-calculator" external>
                Cutoff Calculator
              </CtaButton>
              <CtaButton variant="link" href="https://app.neramclasses.com/tools/counseling/college-predictor" external>
                College Predictor
              </CtaButton>
            </>
          }
        />
      </HubIndex>
    </>
  );
}

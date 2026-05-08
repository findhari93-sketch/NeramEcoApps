import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import Link from 'next/link';
import {
  Box,
  Container,
  Typography,
  Paper,
  Button,
  Chip,
  Grid,
  Stack,
  Divider,
} from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import ScienceIcon from '@mui/icons-material/Science';
import DrawIcon from '@mui/icons-material/Draw';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

import { buildAlternates } from '@/lib/seo/metadata';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema, generateFAQSchema, generateArticleSchema } from '@/lib/seo/schemas';
import {
  HUB_REGISTRY,
  getJEEOnlyHubs,
  getNataOnlyHubs,
  getBothAcceptedHubs,
  getByTier,
  TOTAL_HUBS,
  type HubSummary,
} from '@/data/counselling-2026';
import type { Status, Region } from '@/data/counselling-2026/schema';

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

const STATUS_CHIP: Record<Status, { label: string; color: 'success' | 'warning' | 'default' }> = {
  live: { label: 'Live', color: 'success' },
  tbd: { label: '2026 TBD', color: 'warning' },
  'coming-soon': { label: 'Coming Soon', color: 'default' },
};

const REGION_LABEL: Record<Region, string> = {
  national: 'National',
  south: 'South India',
  north: 'North India',
  east: 'East India',
  west: 'West India',
  central: 'Central India',
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

function HubCard({ hub, locale }: { hub: HubSummary; locale: string }) {
  const localePrefix = locale === 'en' ? '' : `/${locale}`;
  const status = STATUS_CHIP[hub.status];

  const cardSx = {
    p: 2,
    height: '100%',
    borderRadius: 2,
    border: '1px solid',
    borderColor: hub.available ? 'grey.300' : 'grey.200',
    bgcolor: hub.available ? 'background.paper' : 'grey.50',
    display: 'flex',
    flexDirection: 'column' as const,
    transition: 'all 0.2s',
    textDecoration: 'none',
    color: 'inherit',
    ...(hub.available && {
      '&:hover': { borderColor: 'primary.main', boxShadow: 1 },
    }),
  };

  const inner = (
    <>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1} sx={{ mb: 1 }}>
        <Typography variant="subtitle1" fontWeight={700} sx={{ fontSize: '1rem', lineHeight: 1.25 }}>
          {hub.shortName}
        </Typography>
        <Chip label={status.label} size="small" color={status.color} />
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        {hub.authority} · {REGION_LABEL[hub.region]}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ flex: 1, fontSize: '0.85rem', lineHeight: 1.5 }}>
        {hub.blurb}
      </Typography>
      <Stack direction="row" spacing={0.5} sx={{ mt: 1.25 }} flexWrap="wrap" useFlexGap>
        {hub.examRoutes.map((r) => (
          <Chip
            key={r}
            label={r === 'NATA' ? 'NATA' : r === 'JEE_P2' ? 'JEE P2' : 'JEE Adv + AAT'}
            size="small"
            variant="outlined"
            sx={{ fontSize: '0.7rem', height: 20 }}
          />
        ))}
      </Stack>
      {!hub.available && (
        <Typography variant="caption" color="text.disabled" sx={{ mt: 1, fontStyle: 'italic' }}>
          Hub launching in this iteration
        </Typography>
      )}
    </>
  );

  if (!hub.available) {
    return <Paper elevation={0} sx={cardSx}>{inner}</Paper>;
  }

  return (
    <Paper component={Link} href={`${localePrefix}/counseling/${hub.slug}`} elevation={0} sx={cardSx}>
      {inner}
    </Paper>
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
  const tier1 = getByTier(1);
  const tier2 = getByTier(2);
  const tier3 = getByTier(3);

  const liveCount = HUB_REGISTRY.filter((h) => h.status === 'live').length;
  const tbdCount = HUB_REGISTRY.filter((h) => h.status === 'tbd').length;

  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={articleSchema} />
      <JsonLd data={faqSchema} />

      <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 }, pb: { xs: 12, md: 6 } }}>
        {/* Breadcrumb */}
        <Stack direction="row" gap={0.75} sx={{ mb: 2 }} flexWrap="wrap">
          <Link href={`/${locale === 'en' ? '' : locale}`} style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
            <HomeIcon sx={{ fontSize: 14, mr: 0.5, color: 'text.secondary' }} />
            <Typography variant="body2" color="text.secondary">Home</Typography>
          </Link>
          <Typography variant="body2" color="text.secondary">/</Typography>
          <Typography variant="body2" color="primary" fontWeight={600}>Counselling</Typography>
        </Stack>

        {/* Hero */}
        <Box sx={{ textAlign: { xs: 'left', md: 'center' }, mb: { xs: 4, md: 5 } }}>
          <Typography
            variant="h1"
            sx={{ fontWeight: 800, fontSize: { xs: '1.75rem', md: '2.5rem' }, lineHeight: 1.15, mb: 1.5 }}
          >
            B.Arch Counselling 2026
          </Typography>
          <Typography variant="h2" sx={{ fontSize: { xs: '1rem', md: '1.15rem' }, fontWeight: 500, color: 'text.secondary', mb: 2, maxWidth: 720, mx: { xs: 0, md: 'auto' } }}>
            Every B.Arch admission counselling in India ({TOTAL_HUBS} in total). Eligibility, dates, cutoffs, and decision-tree guidance for picking the right one for you.
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap justifyContent={{ xs: 'flex-start', md: 'center' }}>
            <Chip label={`${liveCount} live now`} size="small" color="success" />
            <Chip label={`${tbdCount} awaiting 2026 brochure`} size="small" color="warning" />
            <Chip label="Updated 8 May 2026" size="small" variant="outlined" />
          </Stack>
        </Box>

        {/* Status banner */}
        <Paper
          elevation={0}
          sx={{
            p: { xs: 2, md: 2.5 },
            mb: 4,
            borderRadius: 2,
            bgcolor: '#FFF8E1',
            border: '1px solid #F57C00',
          }}
        >
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
            <Typography variant="subtitle1" fontWeight={700}>2026 cycle is starting now.</Typography>
            <Typography variant="body2" color="text.secondary">
              JEE Advanced is on May 17, AAT on June 4. Most state counsellings open from June through August. Pages flagged &ldquo;2026 TBD&rdquo; are based on 2025 cycle data and will be refreshed when official 2026 brochures release.
            </Typography>
          </Stack>
        </Paper>

        {/* Decision tree */}
        <Box component="section" sx={{ mb: 5 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2.5 }}>
            <LightbulbOutlinedIcon sx={{ color: 'primary.main' }} />
            <Typography variant="h2" sx={{ fontSize: { xs: '1.25rem', md: '1.5rem' }, fontWeight: 700 }}>
              Which counselling do I qualify for?
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Pick the entrance route you have. Counsellings are grouped by what they accept.
          </Typography>

          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <Paper elevation={0} sx={{ p: 2, height: '100%', borderRadius: 2, border: '2px solid #1565C0', bgcolor: '#E3F2FD' }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <ScienceIcon sx={{ color: '#1565C0' }} />
                  <Typography variant="subtitle1" fontWeight={700}>JEE Main Paper 2 only</Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                  No NATA score? You can still apply to:
                </Typography>
                <Stack spacing={0.5}>
                  {jeeOnly.map((h) => (
                    <Typography key={h.slug} variant="body2" component={h.available ? Link : 'span'} href={h.available ? `${localePrefix}/counseling/${h.slug}` : undefined} sx={{ color: h.available ? 'primary.main' : 'text.secondary', textDecoration: h.available ? 'none' : 'none', '&:hover': h.available ? { textDecoration: 'underline' } : undefined }}>
                      {h.shortName}{!h.available && ' (soon)'}
                    </Typography>
                  ))}
                </Stack>
              </Paper>
            </Grid>

            <Grid item xs={12} md={4}>
              <Paper elevation={0} sx={{ p: 2, height: '100%', borderRadius: 2, border: '2px solid #6A1B9A', bgcolor: '#F3E5F5' }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <DrawIcon sx={{ color: '#6A1B9A' }} />
                  <Typography variant="subtitle1" fontWeight={700}>NATA only</Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                  Have NATA but not JEE Paper 2:
                </Typography>
                <Stack spacing={0.5}>
                  {nataOnly.map((h) => (
                    <Typography key={h.slug} variant="body2" component={h.available ? Link : 'span'} href={h.available ? `${localePrefix}/counseling/${h.slug}` : undefined} sx={{ color: h.available ? 'primary.main' : 'text.secondary', textDecoration: 'none', '&:hover': h.available ? { textDecoration: 'underline' } : undefined }}>
                      {h.shortName}{!h.available && ' (soon)'}
                    </Typography>
                  ))}
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                    Plus CEPT University (NATA-only premium private).
                  </Typography>
                </Stack>
              </Paper>
            </Grid>

            <Grid item xs={12} md={4}>
              <Paper elevation={0} sx={{ p: 2, height: '100%', borderRadius: 2, border: '2px solid #2E7D32', bgcolor: '#E8F5E9' }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <CheckCircleIcon sx={{ color: '#2E7D32' }} />
                  <Typography variant="subtitle1" fontWeight={700}>NATA + JEE Paper 2</Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                  Both scores give you full access. {both.length} counsellings accept either:
                </Typography>
                <Stack spacing={0.5}>
                  {both.slice(0, 8).map((h) => (
                    <Typography key={h.slug} variant="body2" component={h.available ? Link : 'span'} href={h.available ? `${localePrefix}/counseling/${h.slug}` : undefined} sx={{ color: h.available ? 'primary.main' : 'text.secondary', textDecoration: 'none', '&:hover': h.available ? { textDecoration: 'underline' } : undefined }}>
                      {h.shortName}{!h.available && ' (soon)'}
                    </Typography>
                  ))}
                  {both.length > 8 && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                      And {both.length - 8} more state counsellings.
                    </Typography>
                  )}
                </Stack>
              </Paper>
            </Grid>
          </Grid>
        </Box>

        {/* Concept cards */}
        <Box component="section" sx={{ mb: 5 }}>
          <Typography variant="h2" sx={{ fontSize: { xs: '1.25rem', md: '1.5rem' }, fontWeight: 700, mb: 2.5 }}>
            Counselling concepts every aspirant should know
          </Typography>
          <Grid container spacing={2}>
            {CONCEPTS.map((c) => (
              <Grid item xs={12} sm={6} md={4} key={c.slug}>
                <Paper
                  component={Link}
                  href={`${localePrefix}/counseling/concepts/${c.slug}`}
                  elevation={0}
                  sx={{
                    p: 2,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'grey.200',
                    textDecoration: 'none',
                    color: 'inherit',
                    transition: 'all 0.2s',
                    '&:hover': { borderColor: 'primary.main', boxShadow: 1 },
                  }}
                >
                  <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.75 }}>
                    {c.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ flex: 1, fontSize: '0.85rem', lineHeight: 1.5 }}>
                    {c.summary}
                  </Typography>
                  <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 1.25 }}>
                    <Typography variant="caption" color="primary" fontWeight={600}>Read explainer</Typography>
                    <ArrowForwardIcon sx={{ fontSize: 14, color: 'primary.main' }} />
                  </Stack>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Box>

        {/* Tier-grouped state grid */}
        <Box component="section" sx={{ mb: 5 }}>
          <Typography variant="h2" sx={{ fontSize: { xs: '1.25rem', md: '1.5rem' }, fontWeight: 700, mb: 2.5 }}>
            All {TOTAL_HUBS} B.Arch counsellings in India
          </Typography>

          <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 1.5, fontWeight: 700 }}>
            Tier 1: National + flagship state counsellings ({tier1.length})
          </Typography>
          <Grid container spacing={1.5} sx={{ mb: 3 }}>
            {tier1.map((h) => (
              <Grid item xs={12} sm={6} md={4} key={h.slug}>
                <HubCard hub={h} locale={locale} />
              </Grid>
            ))}
          </Grid>

          <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 1.5, fontWeight: 700 }}>
            Tier 2: Other state counsellings with notable B.Arch pools ({tier2.length})
          </Typography>
          <Grid container spacing={1.5} sx={{ mb: 3 }}>
            {tier2.map((h) => (
              <Grid item xs={12} sm={6} md={4} key={h.slug}>
                <HubCard hub={h} locale={locale} />
              </Grid>
            ))}
          </Grid>

          <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 1.5, fontWeight: 700 }}>
            Tier 3: Thin pools, JoSAA is usually the better route ({tier3.length})
          </Typography>
          <Grid container spacing={1.5} sx={{ mb: 2 }}>
            {tier3.map((h) => (
              <Grid item xs={12} sm={6} md={4} key={h.slug}>
                <HubCard hub={h} locale={locale} />
              </Grid>
            ))}
          </Grid>
        </Box>

        {/* FAQs */}
        <Box component="section" sx={{ mb: 5 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2.5 }}>
            <HelpOutlineIcon sx={{ color: 'text.secondary' }} />
            <Typography variant="h2" sx={{ fontSize: { xs: '1.25rem', md: '1.5rem' }, fontWeight: 700 }}>
              Cross-counselling FAQs
            </Typography>
          </Stack>
          <Stack spacing={1}>
            {CROSS_FAQS.map((f, idx) => (
              <Paper
                key={`${f.question}-${idx}`}
                elevation={0}
                component="details"
                sx={{
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: 'grey.200',
                  '& summary': {
                    listStyle: 'none',
                    cursor: 'pointer',
                    p: 1.75,
                    fontWeight: 600,
                    fontSize: '0.95rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 1,
                  },
                  '& summary::-webkit-details-marker': { display: 'none' },
                  '& summary::after': {
                    content: '"+"',
                    fontSize: '1.25rem',
                    color: 'primary.main',
                    flexShrink: 0,
                  },
                  '&[open] summary::after': { content: '"−"' },
                }}
              >
                <Box component="summary">{f.question}</Box>
                <Box sx={{ p: 1.75, pt: 0, color: 'text.secondary', fontSize: '0.9rem', lineHeight: 1.6 }}>
                  {f.answer}
                </Box>
              </Paper>
            ))}
          </Stack>
        </Box>

        {/* Tools CTA */}
        <Paper
          elevation={0}
          sx={{ p: { xs: 3, md: 4 }, borderRadius: 2, bgcolor: '#E3F2FD', border: '1px solid #1565C0', textAlign: 'center' }}
        >
          <Typography variant="h3" sx={{ fontSize: '1.25rem', fontWeight: 700, mb: 1 }}>
            Predict your B.Arch admission chances
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5, maxWidth: 600, mx: 'auto' }}>
            Use the free Neram tools to calculate your cutoff score, predict your rank, and find colleges across all 28 counsellings you can get into.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="center">
            <Button
              component="a"
              href="https://app.neramclasses.com/tools/nata/cutoff-calculator"
              target="_blank"
              rel="noopener noreferrer"
              variant="contained"
              endIcon={<OpenInNewIcon sx={{ fontSize: 16 }} />}
              sx={{ bgcolor: '#1565C0', '&:hover': { bgcolor: '#0D47A1' } }}
            >
              Cutoff Calculator
            </Button>
            <Button
              component="a"
              href="https://app.neramclasses.com/tools/counseling/college-predictor"
              target="_blank"
              rel="noopener noreferrer"
              variant="outlined"
              endIcon={<OpenInNewIcon sx={{ fontSize: 16 }} />}
            >
              College Predictor
            </Button>
          </Stack>
        </Paper>

        <Divider sx={{ my: 4 }} />
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center' }}>
          Information curated from official counselling brochures and verified against state DTE portals. Always cross-check on the official portal before submitting any application.
        </Typography>
      </Container>
    </>
  );
}

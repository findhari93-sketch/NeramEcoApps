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
  Alert,
} from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import ScheduleIcon from '@mui/icons-material/Schedule';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CalculateIcon from '@mui/icons-material/Calculate';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import GroupsIcon from '@mui/icons-material/Groups';
import GavelIcon from '@mui/icons-material/Gavel';
import RouteIcon from '@mui/icons-material/Route';
import SchoolIcon from '@mui/icons-material/School';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

import { buildAlternates } from '@/lib/seo/metadata';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  generateBreadcrumbSchema,
  generateFAQSchema,
  generateArticleSchema,
} from '@/lib/seo/schemas';
import {
  importantDates,
  reservation,
  faqs,
  colleges,
  totalSeats,
  districts,
  eligibility,
  akshaya,
  getNextUpcomingDate,
} from '@/data/keam-arch-2026';
import AintraTopicChat from '@/components/aintra/AintraTopicChat';
import CallbackDrawer from '@/components/counselling/CallbackDrawer';
import NataMeritCalculator from '@/components/keam-arch/NataMeritCalculator';

export const revalidate = 86400;

const baseUrl = 'https://neramclasses.com';
const HUB_PATH = '/counseling/keam-arch';
const PRIMARY_GREEN = '#0d7a4a';
const PRIMARY_GREEN_DARK = '#0a5a36';

const KEAM_CALLBACK_PROPS = {
  context: 'KEAM B.Arch 2026',
  queryType: 'keam_arch_counselling',
  courseInterest: 'nata',
  ctaLabel: 'Get KEAM Counselling Guidance',
  drawerTitle: 'Free KEAM Counselling Call',
  drawerIntro:
    'Talk to a KEAM B.Arch counsellor about NATA, eligibility, college choice, and CAP allotment. Free, no obligation.',
  successMessage: 'Our KEAM B.Arch counsellor will call you back within 24 hours.',
  cutoffCalculatorUrl: 'https://app.neramclasses.com/tools/nata/cutoff-calculator',
  collegePredictorUrl:
    'https://app.neramclasses.com/tools/counseling/college-predictor?system=KEAM_ARCH',
} as const;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'KEAM B.Arch 2026: Eligibility, NATA, Colleges, Allotment & Important Dates',
    description:
      'Complete KEAM B.Arch 2026 guide for Kerala: NATA-based merit (50:50 with 12th marks), 22+ colleges, eligibility, reservation matrix (SM/SC/ST/SEBC/EWS), allotment phases, fee concessions, important dates and free tools.',
    keywords:
      'KEAM B.Arch 2026, KEAM Architecture, Kerala B.Arch admission, KEAM CAP, KEAM NATA, B.Arch colleges Kerala, cee.kerala.gov.in, KEAM rank list 2026, Kerala architecture counselling',
    alternates: buildAlternates(locale, HUB_PATH),
    openGraph: {
      title: 'KEAM B.Arch 2026 Information Hub',
      description:
        'Eligibility, NATA, 22 colleges in Kerala, allotment phases, reservation, fee concession, dates, FAQs and free tools for KEAM B.Arch 2026 admission.',
      url: `${baseUrl}${HUB_PATH}`,
      type: 'article',
    },
  };
}

interface PageProps {
  params: { locale: string };
}

const HUB_FAQS_LIMIT = 12;

const SPOKES = [
  {
    href: 'eligibility-documents',
    label: 'Eligibility & Documents',
    desc: '10+2 with Phys+Math, NATA 2025/2026, age 17+, full document checklist with clause references.',
    Icon: CheckCircleIcon,
  },
  {
    href: 'important-dates',
    label: 'Important Dates 2026',
    desc: 'Application 5 Jan to 31 Jan, doc upload by 7 Feb, NATA window, rank list, CAP phases.',
    Icon: ScheduleIcon,
  },
  {
    href: 'allotment-process',
    label: 'CAP Allotment Process',
    desc: 'Trial, Phase 1, Phase 2, mop-up. Option registration, fee remittance, reporting checklist.',
    Icon: RouteIcon,
  },
  {
    href: 'reservation-fee-concession',
    label: 'Reservation & Fee Concession',
    desc: 'SM 50%, SEBC 30% (9 sub-codes), SC/ST/EWS, PD 5%, sports/NCC additive, full fee waivers.',
    Icon: GavelIcon,
  },
  {
    href: 'colleges-in-kerala',
    label: 'B.Arch Colleges in Kerala',
    desc: '22 colleges, ~1,200 seats. Search by district, university (Calicut/MG/KTU/CUSAT/Kerala).',
    Icon: LocationOnIcon,
  },
  {
    href: 'how-to-apply',
    label: 'How to Apply',
    desc: 'Step-by-step walkthrough of cee.kerala.gov.in, fee payment, certificate upload, NATA upload.',
    Icon: SchoolIcon,
  },
  {
    href: 'faq',
    label: 'FAQ',
    desc: '22+ questions answered, with prospectus clause citations. NATA, fees, allotment, colleges.',
    Icon: HelpOutlineIcon,
  },
];

function HubBreadcrumb({ locale }: { locale: string }) {
  const localePrefix = locale === 'en' ? '' : `/${locale}`;
  return (
    <Stack direction="row" gap={0.75} sx={{ mb: 2 }} flexWrap="wrap">
      <Link
        href={`/${locale}`}
        style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
      >
        <HomeIcon sx={{ fontSize: 14, mr: 0.5, color: 'text.secondary' }} />
        <Typography variant="body2" color="text.secondary">
          Home
        </Typography>
      </Link>
      <Typography variant="body2" color="text.secondary">/</Typography>
      <Link href={`${localePrefix}/counseling`} style={{ textDecoration: 'none' }}>
        <Typography variant="body2" color="text.secondary">
          Counseling
        </Typography>
      </Link>
      <Typography variant="body2" color="text.secondary">/</Typography>
      <Typography variant="body2" sx={{ color: PRIMARY_GREEN, fontWeight: 600 }}>
        KEAM B.Arch 2026
      </Typography>
    </Stack>
  );
}

export default function KeamArchHubPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);
  const localePrefix = locale === 'en' ? '' : `/${locale}`;

  const breadcrumbs = generateBreadcrumbSchema([
    { name: 'Home', url: locale === 'en' ? baseUrl : `${baseUrl}/${locale}` },
    { name: 'Counseling', url: `${baseUrl}${localePrefix}/counseling` },
    { name: 'KEAM B.Arch 2026', url: `${baseUrl}${localePrefix}${HUB_PATH}` },
  ]);
  const faqSchema = generateFAQSchema(
    faqs.slice(0, HUB_FAQS_LIMIT).map((f) => ({ question: f.question, answer: f.answer })),
  );
  const articleSchema = generateArticleSchema({
    title: 'KEAM B.Arch 2026: Complete Counselling Guide',
    description:
      'Eligibility, NATA, 22 colleges in Kerala, allotment phases, reservation, fee concession, important dates and FAQs for KEAM B.Arch 2026 admission.',
    url: `${baseUrl}${localePrefix}${HUB_PATH}`,
    publishedAt: '2026-05-08',
    modifiedAt: new Date().toISOString().slice(0, 10),
    author: 'Neram Classes',
    category: 'Architecture Admissions',
  });

  const next = getNextUpcomingDate();
  const stats = [
    { label: 'Programme', value: '5 years (10 sem)' },
    { label: 'B.Arch colleges', value: `${colleges.length}` },
    { label: 'Approx seats', value: `${totalSeats}` },
    { label: 'Merit formula', value: '50% NATA + 50% 12th' },
  ];

  return (
    <>
      <JsonLd data={breadcrumbs} />
      <JsonLd data={articleSchema} />
      <JsonLd data={faqSchema} />

      <Container maxWidth="md" sx={{ py: { xs: 3, md: 5 }, pb: { xs: 12, md: 5 } }}>
        <HubBreadcrumb locale={locale} />

        {/* Hero */}
        <Box sx={{ mb: 4 }}>
          <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mb: 1.5 }}>
            <Chip
              label="Kerala"
              size="small"
              sx={{ bgcolor: PRIMARY_GREEN, color: 'white', fontWeight: 700 }}
            />
            <Chip label="CEE Kerala" size="small" variant="outlined" />
            <Chip label="2026 Admissions" size="small" variant="outlined" />
          </Stack>
          <Typography
            variant="h1"
            sx={{
              fontWeight: 800,
              fontSize: { xs: '1.875rem', md: '2.5rem' },
              lineHeight: 1.15,
              mb: 1.25,
            }}
          >
            KEAM B.Arch 2026: Complete Counselling Guide
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 720, mb: 2 }}>
            Everything you need for B.Arch admission in Kerala through cee.kerala.gov.in. NATA + 12th merit formula, 22 colleges across Kerala, CAP allotment phases, full reservation matrix, fee concessions, and free tools to estimate your rank index.
          </Typography>
          <Grid container spacing={1.5}>
            {stats.map((s) => (
              <Grid item xs={6} md={3} key={s.label}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: 'grey.50',
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <Typography variant="caption" color="text.secondary">
                    {s.label}
                  </Typography>
                  <Typography variant="body2" fontWeight={700}>
                    {s.value}
                  </Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Box>

        {/* NATA-only banner */}
        <Alert
          severity="info"
          icon={<InfoOutlinedIcon />}
          sx={{
            mb: 4,
            borderRadius: 2,
            bgcolor: '#f0fdf4',
            color: '#064e3b',
            border: `1px solid ${PRIMARY_GREEN}`,
            '& .MuiAlert-icon': { color: PRIMARY_GREEN },
          }}
        >
          <Typography variant="body2" fontWeight={700} sx={{ mb: 0.5 }}>
            KEAM does not conduct an architecture entrance exam.
          </Typography>
          <Typography variant="body2">
            For B.Arch admission, you need a valid <strong>NATA 2025 or 2026 score</strong>. KEAM only handles centralised allotment. Your rank = NATA (out of 200) + 12th marks (out of 200), totalling 400. (Clause 9.7.4(c))
          </Typography>
        </Alert>

        {/* Next deadline banner */}
        {next && (
          <Paper
            elevation={0}
            sx={{
              p: 2,
              mb: 4,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'warning.light',
              bgcolor: '#FFFBEB',
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              flexWrap: 'wrap',
            }}
          >
            <ScheduleIcon sx={{ color: 'warning.dark' }} />
            <Box flex={1} sx={{ minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                Next milestone ({next.status === 'confirmed' ? 'confirmed' : 'tentative'})
              </Typography>
              <Typography variant="body2" fontWeight={700}>
                {next.label}, {next.display_date}
              </Typography>
            </Box>
            <Button
              size="small"
              variant="outlined"
              component={Link}
              href={`${localePrefix}${HUB_PATH}/important-dates`}
              endIcon={<ArrowForwardIcon />}
            >
              Full timeline
            </Button>
          </Paper>
        )}

        {/* Spoke cards */}
        <Typography variant="h5" component="h2" fontWeight={800} sx={{ mb: 2 }}>
          Browse by topic
        </Typography>
        <Grid container spacing={1.5} sx={{ mb: 5 }}>
          {SPOKES.map(({ href, label, desc, Icon }) => (
            <Grid item xs={12} sm={6} key={href}>
              <Paper
                component={Link}
                href={`${localePrefix}${HUB_PATH}/${href}`}
                elevation={0}
                sx={{
                  display: 'block',
                  p: 2,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                  textDecoration: 'none',
                  color: 'inherit',
                  transition: 'all 0.15s ease',
                  '&:hover': {
                    borderColor: PRIMARY_GREEN,
                    transform: 'translateY(-2px)',
                    boxShadow: '0 8px 24px rgba(13,122,74,0.10)',
                  },
                }}
              >
                <Stack direction="row" gap={1.5} alignItems="flex-start">
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: 1.5,
                      bgcolor: '#dcfce7',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Icon sx={{ color: PRIMARY_GREEN, fontSize: 22 }} />
                  </Box>
                  <Box>
                    <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.25 }}>
                      {label}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {desc}
                    </Typography>
                  </Box>
                </Stack>
              </Paper>
            </Grid>
          ))}
        </Grid>

        {/* Merit calculator preview */}
        <Typography variant="h5" component="h2" fontWeight={800} sx={{ mb: 2 }}>
          Estimate your rank index
        </Typography>
        <Box sx={{ mb: 5 }}>
          <NataMeritCalculator />
        </Box>

        {/* Tools strip */}
        <Typography variant="h5" component="h2" fontWeight={800} sx={{ mb: 2 }}>
          Free Tools for KEAM B.Arch
        </Typography>
        <Grid container spacing={1.5} sx={{ mb: 5 }}>
          {[
            {
              icon: CalculateIcon,
              title: 'Cutoff Calculator',
              desc: 'Convert your 12th marks to /200 and add NATA to see your KEAM B.Arch rank index out of 400.',
              href: 'https://app.neramclasses.com/tools/nata/cutoff-calculator?system=KEAM_ARCH',
              cta: 'Calculate Index',
            },
            {
              icon: TrendingUpIcon,
              title: 'Rank Predictor',
              desc: 'Estimate your B.Arch rank using historic KEAM data, by category and college type.',
              href: 'https://app.neramclasses.com/tools/counseling/rank-predictor?system=KEAM_ARCH',
              cta: 'Predict Rank',
            },
            {
              icon: GroupsIcon,
              title: 'College Predictor',
              desc: 'See which Kerala B.Arch colleges match your score, category, and seat preference.',
              href: 'https://app.neramclasses.com/tools/counseling/college-predictor?system=KEAM_ARCH',
              cta: 'Find My College',
            },
          ].map(({ icon: Icon, title, desc, href, cta }) => (
            <Grid item xs={12} sm={4} key={title}>
              <Paper
                elevation={0}
                sx={{
                  p: 2,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <Icon sx={{ color: PRIMARY_GREEN, mb: 1 }} />
                <Typography variant="subtitle1" fontWeight={700}>
                  {title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ flex: 1, mb: 1.5 }}>
                  {desc}
                </Typography>
                <Button
                  variant="outlined"
                  size="small"
                  href={href}
                  target="_blank"
                  rel="noopener"
                  endIcon={<ArrowForwardIcon />}
                  sx={{
                    alignSelf: 'flex-start',
                    minHeight: 40,
                    color: PRIMARY_GREEN,
                    borderColor: PRIMARY_GREEN,
                    '&:hover': { borderColor: PRIMARY_GREEN_DARK, bgcolor: '#f0fdf4' },
                  }}
                >
                  {cta}
                </Button>
              </Paper>
            </Grid>
          ))}
        </Grid>

        {/* At a glance */}
        <Typography variant="h5" component="h2" fontWeight={800} sx={{ mb: 2 }}>
          At a glance
        </Typography>
        <Grid container spacing={1.5} sx={{ mb: 5 }}>
          <Grid item xs={12} md={6}>
            <Paper
              elevation={0}
              sx={{
                p: 2,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                height: '100%',
              }}
            >
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                Who is eligible
              </Typography>
              <Stack spacing={0.5}>
                <Typography variant="body2">
                  - 10+2 with Physics + Mathematics + 1 elective subject
                </Typography>
                <Typography variant="body2">
                  - Min {eligibility.academic.minimum_aggregate_percent}% aggregate (no rounding)
                </Typography>
                <Typography variant="body2">
                  - Valid NATA 2025 or NATA 2026 score (no relaxation in cutoff)
                </Typography>
                <Typography variant="body2">
                  - Age 17+ by 31 Dec 2026, no upper limit
                </Typography>
              </Stack>
              <Button
                component={Link}
                href={`${localePrefix}${HUB_PATH}/eligibility-documents`}
                size="small"
                sx={{ mt: 1.5, color: PRIMARY_GREEN }}
                endIcon={<ArrowForwardIcon />}
              >
                Full eligibility & documents
              </Button>
            </Paper>
          </Grid>
          <Grid item xs={12} md={6}>
            <Paper
              elevation={0}
              sx={{
                p: 2,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                height: '100%',
              }}
            >
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                Reservation
              </Typography>
              <Stack direction="row" gap={0.5} flexWrap="wrap">
                {reservation.general.map((c) => (
                  <Chip
                    key={c.code}
                    label={`${c.code}: ${c.percent}%`}
                    size="small"
                    variant="outlined"
                  />
                ))}
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                SEBC 30% is split across 9 sub-categories. Plus EWS, PD 5%, and Sports/NCC additive scoring (max index 1000).
              </Typography>
              <Button
                component={Link}
                href={`${localePrefix}${HUB_PATH}/reservation-fee-concession`}
                size="small"
                sx={{ mt: 1, color: PRIMARY_GREEN }}
                endIcon={<ArrowForwardIcon />}
              >
                Reservation & fee concession
              </Button>
            </Paper>
          </Grid>
        </Grid>

        {/* Colleges teaser */}
        <Paper
          elevation={0}
          sx={{
            p: { xs: 2, md: 3 },
            mb: 4,
            borderRadius: 2,
            border: `1px solid ${PRIMARY_GREEN}`,
            bgcolor: '#f0fdf4',
          }}
        >
          <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1 }}>
            <LocationOnIcon sx={{ color: PRIMARY_GREEN }} />
            <Typography variant="h6" fontWeight={800}>
              {colleges.length} B.Arch Colleges in Kerala
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Search across {districts.length} districts and 5 affiliating universities (Calicut, Kerala, CUSAT, KTU, MG). About {totalSeats} seats in total. Each card has phone, university, district, and a Google Maps link.
          </Typography>
          <Button
            component={Link}
            href={`${localePrefix}${HUB_PATH}/colleges-in-kerala`}
            variant="contained"
            size="large"
            startIcon={<LocationOnIcon />}
            sx={{
              bgcolor: PRIMARY_GREEN,
              '&:hover': { bgcolor: PRIMARY_GREEN_DARK },
            }}
          >
            Open colleges list
          </Button>
        </Paper>

        {/* Akshaya callout */}
        <Paper
          elevation={0}
          sx={{
            p: { xs: 2, md: 3 },
            mb: 5,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'grey.50',
          }}
        >
          <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1 }}>
            <InfoOutlinedIcon sx={{ color: 'text.secondary' }} />
            <Typography variant="subtitle1" fontWeight={800}>
              Need help filling the form?
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {akshaya.description}
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button
              variant="outlined"
              size="small"
              href={akshaya.finder_url}
              target="_blank"
              rel="noopener"
              endIcon={<OpenInNewIcon />}
            >
              Find an Akshaya Centre
            </Button>
            <Button
              variant="text"
              size="small"
              component={Link}
              href={`${localePrefix}${HUB_PATH}/how-to-apply`}
              endIcon={<ArrowForwardIcon />}
            >
              See application steps
            </Button>
          </Stack>
        </Paper>

        {/* Top FAQs */}
        <Typography variant="h5" component="h2" fontWeight={800} sx={{ mb: 2 }}>
          Top questions
        </Typography>
        <Stack spacing={1.5} sx={{ mb: 4 }}>
          {faqs.slice(0, HUB_FAQS_LIMIT).map((faq) => (
            <Paper
              key={faq.id}
              elevation={0}
              sx={{
                p: 2,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
                {faq.question}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {faq.answer}
              </Typography>
              {faq.clause_ref && (
                <Typography
                  variant="caption"
                  sx={{ color: PRIMARY_GREEN, fontWeight: 600, display: 'block', mt: 0.5 }}
                >
                  Source: {faq.clause_ref}
                </Typography>
              )}
            </Paper>
          ))}
        </Stack>
        <Button
          component={Link}
          href={`${localePrefix}${HUB_PATH}/faq`}
          variant="outlined"
          endIcon={<ArrowForwardIcon />}
          sx={{ mb: 5, color: PRIMARY_GREEN, borderColor: PRIMARY_GREEN }}
        >
          See all FAQs
        </Button>

        {/* Final CTA */}
        <Paper
          elevation={0}
          sx={{
            p: { xs: 3, md: 4 },
            borderRadius: 2,
            border: `1px solid ${PRIMARY_GREEN}`,
            bgcolor: '#f0fdf4',
            textAlign: 'center',
          }}
        >
          <Typography variant="h5" fontWeight={800} sx={{ mb: 1 }}>
            Get personalised KEAM B.Arch counselling
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mb: 3, maxWidth: 520, mx: 'auto' }}
          >
            A Neram Classes counsellor can guide you on NATA strategy, college choice, document checklist, and CAP option-list strategy. Free, no obligation.
          </Typography>
          <Box sx={{ display: { xs: 'none', md: 'block' } }}>
            <CallbackDrawer variant="inline" {...KEAM_CALLBACK_PROPS} />
          </Box>
          <Box sx={{ display: { xs: 'block', md: 'none' } }}>
            <Typography variant="caption" color="text.secondary">
              Tap the button at the bottom of your screen to request a callback.
            </Typography>
          </Box>
          <Divider sx={{ my: 2 }} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="center">
            <Button component="a" href="tel:+919176137043" variant="text">
              Or call +91 91761 37043
            </Button>
          </Stack>
        </Paper>
      </Container>

      <CallbackDrawer variant="sticky" {...KEAM_CALLBACK_PROPS} />

      <AintraTopicChat
        topic="keam_arch_2026"
        endpoint="/api/aintra/keam-arch"
        title="KEAM B.Arch 2026"
        subtitle="Your KEAM B.Arch counselling guide"
        greeting="Hi! I'm Aintra. Ask me anything about KEAM B.Arch 2026, NATA, eligibility, dates, allotment, or fees."
        suggestions={[
          'Is NATA mandatory for KEAM B.Arch?',
          'When does application close?',
          'Which colleges are in Kerala?',
          'How is the rank calculated?',
        ]}
        primaryColor={PRIMARY_GREEN}
        primaryColorDark={PRIMARY_GREEN_DARK}
        disclaimerSource="cee.kerala.gov.in"
      />
    </>
  );
}

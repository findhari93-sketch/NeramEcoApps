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
import ScheduleIcon from '@mui/icons-material/Schedule';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CalculateIcon from '@mui/icons-material/Calculate';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import GroupsIcon from '@mui/icons-material/Groups';
import DescriptionIcon from '@mui/icons-material/Description';
import GavelIcon from '@mui/icons-material/Gavel';
import RouteIcon from '@mui/icons-material/Route';
import SchoolIcon from '@mui/icons-material/School';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

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
  fees,
  documents,
  faqs,
  tfcs,
  districts,
  eligibility,
  getNextUpcomingDate,
} from '@/data/tnea-barch-2026';
import AintraTopicChat from '@/components/aintra/AintraTopicChat';
import CallbackDrawer from '@/components/counselling/CallbackDrawer';

const TNEA_CALLBACK_PROPS = {
  context: 'TNEA B.Arch 2026',
  queryType: 'b_arch_counselling',
  courseInterest: 'nata',
  ctaLabel: 'Get TNEA Counselling Guidance',
  drawerTitle: 'Free TNEA Counselling Call',
  drawerIntro:
    'Talk to a TNEA B.Arch counsellor about eligibility, college choice, and counselling rounds. Free, no obligation.',
  successMessage: 'Our TNEA B.Arch counsellor will call you back within 24 hours.',
  cutoffCalculatorUrl: 'https://app.neramclasses.com/tools/nata/cutoff-calculator',
  collegePredictorUrl:
    'https://app.neramclasses.com/tools/counseling/college-predictor?system=TNEA_BARCH',
} as const;

const baseUrl = 'https://neramclasses.com';
const HUB_PATH = '/counseling/tnea-barch';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'TNEA B.Arch 2026: Eligibility, TFC List, Counselling Procedure & Important Dates',
    description:
      'Complete TNEA B.Arch 2026 guide: 110+ TFCs across Tamil Nadu, eligibility (45% + NATA/JEE Paper-2), 7 reservation categories, 3 counselling rounds, fee concessions, and free cutoff calculator.',
    keywords:
      'TNEA B.Arch 2026, TNEA counselling, TNEA TFC list, Tamil Nadu architecture admission, TNEA eligibility, TNEA reservation, NATA TNEA, B.Arch counselling Tamil Nadu, barch.tneaonline.org',
    alternates: buildAlternates(locale, HUB_PATH),
    openGraph: {
      title: 'TNEA B.Arch 2026 Information Hub',
      description:
        'Eligibility, TFC list, counselling procedure, fee concessions, dates, FAQs and free tools for TNEA B.Arch 2026 admission.',
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
    desc: '10+2 with Maths, NATA/JEE Paper-2, nativity rules, full document checklist.',
    Icon: CheckCircleIcon,
  },
  {
    href: 'important-dates',
    label: 'Important Dates 2026',
    desc: 'Notification, registration window, certificate verification, counselling rounds.',
    Icon: ScheduleIcon,
  },
  {
    href: 'counselling-procedure',
    label: 'Counselling Procedure',
    desc: '3 rounds, 4 stages, and the 6 confirmation options when a seat is allotted.',
    Icon: RouteIcon,
  },
  {
    href: 'reservation-fee-concession',
    label: 'Reservation & Fee Concession',
    desc: '7 categories, 7.5% govt-school quota, First Graduate, PMSS, PwBD.',
    Icon: GavelIcon,
  },
  {
    href: 'tfc-list',
    label: 'TFC Locator',
    desc: '110+ Facilitation Centres across all 38 districts. Search and find the nearest.',
    Icon: LocationOnIcon,
  },
  {
    href: 'how-to-apply',
    label: 'How to Apply',
    desc: 'Step-by-step walkthrough of barch.tneaonline.org registration and certificate upload.',
    Icon: SchoolIcon,
  },
  {
    href: 'faq',
    label: 'FAQ',
    desc: 'Answers to the questions students ask most about TNEA B.Arch 2026.',
    Icon: HelpOutlineIcon,
  },
];

function HubBreadcrumb({ locale }: { locale: string }) {
  const localePrefix = locale === 'en' ? '' : `/${locale}`;
  return (
    <Stack direction="row" gap={0.75} sx={{ mb: 2 }} flexWrap="wrap">
      <Link href={`/${locale}`} style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
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
      <Typography variant="body2" color="primary" fontWeight={600}>
        TNEA B.Arch 2026
      </Typography>
    </Stack>
  );
}

export default function TneaBarchHubPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);
  const localePrefix = locale === 'en' ? '' : `/${locale}`;

  const breadcrumbs = generateBreadcrumbSchema([
    { name: 'Home', url: locale === 'en' ? baseUrl : `${baseUrl}/${locale}` },
    { name: 'Counseling', url: `${baseUrl}${localePrefix}/counseling` },
    { name: 'TNEA B.Arch 2026', url: `${baseUrl}${localePrefix}${HUB_PATH}` },
  ]);
  const faqSchema = generateFAQSchema(faqs.slice(0, HUB_FAQS_LIMIT).map((f) => ({ question: f.question, answer: f.answer })));
  const articleSchema = generateArticleSchema({
    title: 'TNEA B.Arch 2026: Complete Counselling Guide',
    description:
      'Eligibility, TFC list, counselling procedure, reservation categories, fee concessions, important dates, and FAQs for TNEA B.Arch 2026 admission.',
    url: `${baseUrl}${localePrefix}${HUB_PATH}`,
    publishedAt: '2026-01-01',
    modifiedAt: new Date().toISOString().slice(0, 10),
    author: 'Neram Classes',
    category: 'Architecture Admissions',
  });

  const next = getNextUpcomingDate();
  const stats = [
    { label: 'Programme', value: '5 years (10 sem)' },
    { label: 'Facilitation Centres', value: `${tfcs.length}+` },
    { label: 'Districts covered', value: `${districts.length}` },
    { label: 'Merit formula', value: '50% Board + 50% NATA/JEE' },
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
            <Chip label="Tamil Nadu" size="small" color="primary" />
            <Chip label="Anna University" size="small" variant="outlined" />
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
            TNEA B.Arch 2026: Complete Counselling Guide
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 720, mb: 2 }}>
            Everything you need for Tamil Nadu B.Arch admission through tneaonline.org. Eligibility, document checklist, 110+ TFCs across all 38 districts, 3-round counselling procedure, and free tools to estimate your cutoff and match colleges.
          </Typography>
          <Grid container spacing={1.5}>
            {stats.map((s) => (
              <Grid item xs={6} md={3} key={s.label}>
                <Paper elevation={0} sx={{ p: 1.5, borderRadius: 2, bgcolor: 'grey.50', border: '1px solid', borderColor: 'divider' }}>
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
            }}
          >
            <ScheduleIcon sx={{ color: 'warning.dark' }} />
            <Box flex={1}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                Next milestone (tentative)
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

        {/* Spoke cards (Information Architecture) */}
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
                    borderColor: 'primary.main',
                    transform: 'translateY(-2px)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.06)',
                  },
                }}
              >
                <Stack direction="row" gap={1.5} alignItems="flex-start">
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: 1.5,
                      bgcolor: 'primary.50',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Icon sx={{ color: 'primary.main', fontSize: 22 }} />
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

        {/* Tools strip */}
        <Typography variant="h5" component="h2" fontWeight={800} sx={{ mb: 2 }}>
          Free Tools for TNEA B.Arch
        </Typography>
        <Grid container spacing={1.5} sx={{ mb: 5 }}>
          {[
            {
              icon: CalculateIcon,
              title: 'Cutoff Calculator',
              desc: 'Convert your board marks to /200 and add NATA to see your TNEA composite score.',
              href: 'https://app.neramclasses.com/tools/nata/cutoff-calculator',
              cta: 'Calculate Cutoff',
            },
            {
              icon: TrendingUpIcon,
              title: 'Rank Predictor',
              desc: 'Estimate your TNEA rank based on score and category, with historic data.',
              href: 'https://app.neramclasses.com/tools/counseling/rank-predictor',
              cta: 'Predict Rank',
            },
            {
              icon: GroupsIcon,
              title: 'College Predictor',
              desc: 'See which TNEA colleges match your score, branch and category.',
              href: 'https://app.neramclasses.com/tools/counseling/college-predictor?system=TNEA_BARCH',
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
                <Icon sx={{ color: 'primary.main', mb: 1 }} />
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
                  sx={{ alignSelf: 'flex-start', minHeight: 40 }}
                >
                  {cta}
                </Button>
              </Paper>
            </Grid>
          ))}
        </Grid>

        {/* At a glance: eligibility */}
        <Typography variant="h5" component="h2" fontWeight={800} sx={{ mb: 2 }}>
          At a glance
        </Typography>
        <Grid container spacing={1.5} sx={{ mb: 5 }}>
          <Grid item xs={12} md={6}>
            <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider', height: '100%' }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                Who is eligible
              </Typography>
              <Stack spacing={0.5}>
                <Typography variant="body2">- {eligibility.academic.qualification}</Typography>
                <Typography variant="body2">- Min {eligibility.academic.minimum_aggregate_percent}% aggregate</Typography>
                <Typography variant="body2">- Compulsory subjects: {eligibility.academic.required_subjects.join(' + ')}</Typography>
                <Typography variant="body2">- Aptitude: {eligibility.aptitude.accepted_exams.join(' OR ')}</Typography>
              </Stack>
              <Button
                component={Link}
                href={`${localePrefix}${HUB_PATH}/eligibility-documents`}
                size="small"
                sx={{ mt: 1.5 }}
                endIcon={<ArrowForwardIcon />}
              >
                Full eligibility & documents
              </Button>
            </Paper>
          </Grid>
          <Grid item xs={12} md={6}>
            <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider', height: '100%' }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                Reservation
              </Typography>
              <Stack direction="row" gap={0.5} flexWrap="wrap">
                {reservation.general.map((c) => (
                  <Chip key={c.code} label={`${c.code}: ${c.percent}%`} size="small" variant="outlined" />
                ))}
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Plus 7.5% Government School preferential quota and 5% PwBD horizontal reservation.
              </Typography>
              <Button
                component={Link}
                href={`${localePrefix}${HUB_PATH}/reservation-fee-concession`}
                size="small"
                sx={{ mt: 1 }}
                endIcon={<ArrowForwardIcon />}
              >
                Reservation & fee concession
              </Button>
            </Paper>
          </Grid>
        </Grid>

        {/* TFC teaser */}
        <Paper
          elevation={0}
          sx={{
            p: { xs: 2, md: 3 },
            mb: 5,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'primary.50',
          }}
        >
          <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1 }}>
            <LocationOnIcon sx={{ color: 'primary.main' }} />
            <Typography variant="h6" fontWeight={800}>
              Find Your Nearest TFC
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {tfcs.length}+ TNEA Facilitation Centres across {districts.length} districts. Working hours 9 AM to 5 PM. Use the locator to search by district or city, see contact phone numbers and get directions.
          </Typography>
          <Button
            component={Link}
            href={`${localePrefix}${HUB_PATH}/tfc-list`}
            variant="contained"
            size="large"
            startIcon={<LocationOnIcon />}
          >
            Open TFC Locator
          </Button>
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
            </Paper>
          ))}
        </Stack>
        <Button
          component={Link}
          href={`${localePrefix}${HUB_PATH}/faq`}
          variant="outlined"
          endIcon={<ArrowForwardIcon />}
          sx={{ mb: 5 }}
        >
          See all FAQs
        </Button>

        {/* Final CTA card */}
        <Paper
          elevation={0}
          sx={{
            p: { xs: 3, md: 4 },
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'success.light',
            bgcolor: '#E8F5E9',
            textAlign: 'center',
          }}
        >
          <Typography variant="h5" fontWeight={800} sx={{ mb: 1 }}>
            Get personalised TNEA B.Arch counselling
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 520, mx: 'auto' }}>
            A Neram Classes counsellor can guide you on cutoff scores, college choice, document checklist, and counselling round strategy. Free, no obligation.
          </Typography>
          <Box sx={{ display: { xs: 'none', md: 'block' } }}>
            <CallbackDrawer variant="inline" {...TNEA_CALLBACK_PROPS} />
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

      <CallbackDrawer variant="sticky" {...TNEA_CALLBACK_PROPS} />

      <AintraTopicChat
        topic="tnea_barch_2026"
        endpoint="/api/aintra/tnea-barch"
        title="TNEA B.Arch 2026"
        subtitle="Your TNEA B.Arch counselling guide"
        greeting="Hi! I'm Aintra. Ask me anything about TNEA B.Arch 2026, eligibility, dates, TFCs, counselling rounds, or fee concessions."
        suggestions={[
          'Eligibility for TNEA B.Arch?',
          'When does registration close?',
          'How many counselling rounds?',
          'TFC near my district?',
        ]}
        primaryColor="#1d4ed8"
        primaryColorDark="#1e3a8a"
      />
    </>
  );
}

import Link from 'next/link';
import {
  Box,
  Container,
  Typography,
  Paper,
  Button,
  Chip,
  Stack,
  Grid,
  Divider,
} from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import GavelIcon from '@mui/icons-material/Gavel';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import SchoolIcon from '@mui/icons-material/School';
import CalculateIcon from '@mui/icons-material/Calculate';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';

import { JsonLd } from '@/components/seo/JsonLd';
import {
  generateBreadcrumbSchema,
  generateFAQSchema,
  generateArticleSchema,
} from '@/lib/seo/schemas';
import CallbackDrawer from '@/components/counselling/CallbackDrawer';
import CounsellingStatusBanner from './CounsellingStatusBanner';
import CounsellingDateTracker from './CounsellingDateTracker';
import type { CounsellingHubConfig, ExamRoute } from '@/data/counselling-2026/schema';
import type { HubSummary } from '@/data/counselling-2026';

const baseUrl = 'https://neramclasses.com';

const EXAM_ROUTE_LABEL: Record<ExamRoute, string> = {
  NATA: 'NATA',
  JEE_P2: 'JEE Main Paper 2',
  JEE_ADV_AAT: 'JEE Adv + AAT',
};

export interface CounsellingHubPageProps {
  config: CounsellingHubConfig;
  locale: string;
  /** Optional: pass 3-4 related hubs to render in the "Explore other counsellings" strip. */
  related?: HubSummary[];
}

export default function CounsellingHubPage({ config, locale, related = [] }: CounsellingHubPageProps) {
  const localePrefix = locale === 'en' ? '' : `/${locale}`;
  const hubUrl = `${baseUrl}${localePrefix}/counseling/${config.slug}`;
  const showReservation = config.depth !== 'stub' && config.reservation && config.reservation.length > 0;
  const showFees = config.depth !== 'stub' && config.fees && config.fees.length > 0;
  const showColleges = config.depth !== 'stub' && config.topColleges && config.topColleges.length > 0;
  const showGotchas = config.gotchas && config.gotchas.length > 0;

  // ─── JSON-LD ────────────────────────────────────────────────────────────────
  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: locale === 'en' ? baseUrl : `${baseUrl}/${locale}` },
    { name: 'Counselling', url: `${baseUrl}${localePrefix}/counseling` },
    { name: config.shortName, url: hubUrl },
  ]);

  const faqSchema =
    config.faqs.length > 0
      ? generateFAQSchema(config.faqs.slice(0, 12).map((f) => ({ question: f.question, answer: f.answer })))
      : null;

  const articleSchema = generateArticleSchema({
    title: config.title,
    description: config.description,
    url: hubUrl,
    publishedAt: config.lastVerified,
    modifiedAt: config.lastVerified,
    author: 'Neram Classes',
    category: 'B.Arch Counselling',
  });

  const englishOnlyNotice = locale !== 'en';

  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={articleSchema} />
      {faqSchema && <JsonLd data={faqSchema} />}

      <Container maxWidth="md" sx={{ py: { xs: 3, md: 5 }, pb: { xs: 12, md: 6 } }}>
        {/* Breadcrumb */}
        <Stack direction="row" gap={0.75} sx={{ mb: 2 }} flexWrap="wrap">
          <Link href={`/${locale === 'en' ? '' : locale}`} style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
            <HomeIcon sx={{ fontSize: 14, mr: 0.5, color: 'text.secondary' }} />
            <Typography variant="body2" color="text.secondary">Home</Typography>
          </Link>
          <Typography variant="body2" color="text.secondary">/</Typography>
          <Link href={`${localePrefix}/counseling`} style={{ textDecoration: 'none' }}>
            <Typography variant="body2" color="text.secondary">Counselling</Typography>
          </Link>
          <Typography variant="body2" color="text.secondary">/</Typography>
          <Typography variant="body2" color="primary" fontWeight={600}>
            {config.shortName}
          </Typography>
        </Stack>

        {englishOnlyNotice && (
          <Paper
            elevation={0}
            sx={{
              p: 1.5,
              mb: 2,
              borderRadius: 2,
              bgcolor: '#FFF3E0',
              border: '1px solid #FB8C00',
              fontSize: '0.85rem',
            }}
          >
            <Typography variant="body2">
              This counselling guide is currently available in English only. Translations are coming soon.
            </Typography>
          </Paper>
        )}

        {/* Hero */}
        <Box sx={{ mb: 3 }}>
          <Stack direction="row" spacing={1} sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
            {config.examRoutes.map((r) => (
              <Chip key={r} label={EXAM_ROUTE_LABEL[r]} size="small" color="primary" variant="outlined" />
            ))}
            <Chip label={`Tier ${config.tier}`} size="small" variant="outlined" />
          </Stack>
          <Typography
            variant="h1"
            sx={{ fontWeight: 800, fontSize: { xs: '1.625rem', md: '2.125rem' }, lineHeight: 1.2, mb: 1.25 }}
          >
            {config.title}
          </Typography>
          <Typography variant="h2" sx={{ fontSize: { xs: '1rem', md: '1.125rem' }, fontWeight: 500, color: 'text.secondary', mb: 1.5 }}>
            {config.tagline}
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 720, mb: 2 }}>
            {config.description}
          </Typography>
          <Button
            component="a"
            href={config.primaryUrl}
            target="_blank"
            rel="noopener noreferrer"
            variant="text"
            size="small"
            endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
            sx={{ textTransform: 'none', pl: 0 }}
          >
            Official portal: {new URL(config.primaryUrl).host}
          </Button>
        </Box>

        {/* Status banner */}
        <CounsellingStatusBanner
          status={config.status}
          label={config.statusBanner.label}
          detail={config.statusBanner.detail}
          expectedDate={config.statusBanner.expectedDate}
          lastVerified={config.lastVerified}
          cycleSourceNote={config.cycleSourceNote}
        />

        {/* At-a-glance */}
        {config.atAGlance.length > 0 && (
          <Paper elevation={0} sx={{ p: { xs: 2, md: 3 }, mb: 4, borderRadius: 2, border: '1px solid', borderColor: 'grey.200' }}>
            <Typography variant="h3" sx={{ fontSize: '1.125rem', fontWeight: 700, mb: 2 }}>
              At a glance
            </Typography>
            <Grid container spacing={2}>
              {config.atAGlance.map((item) => (
                <Grid item xs={6} md={4} key={item.label}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
                    {item.label}
                  </Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {item.value}
                  </Typography>
                </Grid>
              ))}
            </Grid>
          </Paper>
        )}

        {/* Eligibility */}
        {config.eligibility.length > 0 && (
          <Box component="section" sx={{ mb: 4 }}>
            <Typography variant="h3" sx={{ fontSize: '1.25rem', fontWeight: 700, mb: 2 }}>
              Eligibility
            </Typography>
            <Stack spacing={1.5}>
              {config.eligibility.map((rule) => (
                <Box key={rule.label} sx={{ pl: 2, borderLeft: '3px solid', borderColor: 'primary.main' }}>
                  <Typography variant="subtitle2" fontWeight={700}>{rule.label}</Typography>
                  <Typography variant="body2" color="text.secondary">{rule.detail}</Typography>
                </Box>
              ))}
            </Stack>
          </Box>
        )}

        {/* Important dates */}
        {config.dates.length > 0 && (
          <Box component="section" sx={{ mb: 4 }}>
            <Typography variant="h3" sx={{ fontSize: '1.25rem', fontWeight: 700, mb: 2 }}>
              Important dates
            </Typography>
            <CounsellingDateTracker dates={config.dates} />
          </Box>
        )}

        {/* Reservation */}
        {showReservation && (
          <Box component="section" sx={{ mb: 4 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
              <GavelIcon sx={{ color: 'text.secondary' }} />
              <Typography variant="h3" sx={{ fontSize: '1.25rem', fontWeight: 700 }}>
                Reservation matrix
              </Typography>
            </Stack>
            <Box sx={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e0e0e0', textAlign: 'left' }}>
                    <th style={{ padding: '10px 8px', fontWeight: 600 }}>Category</th>
                    <th style={{ padding: '10px 8px', fontWeight: 600 }}>Quota</th>
                    <th style={{ padding: '10px 8px', fontWeight: 600 }}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {config.reservation!.map((r, idx) => (
                    <tr key={`${r.category}-${idx}`} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '8px', fontWeight: 500 }}>{r.category}</td>
                      <td style={{ padding: '8px' }}>{r.percentage}</td>
                      <td style={{ padding: '8px', color: '#666' }}>{r.note || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
          </Box>
        )}

        {/* Fee structure */}
        {showFees && (
          <Box component="section" sx={{ mb: 4 }}>
            <Typography variant="h3" sx={{ fontSize: '1.25rem', fontWeight: 700, mb: 2 }}>
              Fee structure
            </Typography>
            <Stack spacing={1}>
              {config.fees!.map((f, idx) => (
                <Stack
                  key={`${f.label}-${idx}`}
                  direction={{ xs: 'column', sm: 'row' }}
                  justifyContent="space-between"
                  spacing={0.5}
                  sx={{ p: 1.5, borderRadius: 1.5, bgcolor: 'grey.50' }}
                >
                  <Box>
                    <Typography variant="body2" fontWeight={600}>{f.label}</Typography>
                    {f.note && (
                      <Typography variant="caption" color="text.secondary">{f.note}</Typography>
                    )}
                  </Box>
                  <Typography variant="body2" fontWeight={700} sx={{ minWidth: 100 }}>
                    {f.amount}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Box>
        )}

        {/* Top participating colleges */}
        {showColleges && (
          <Box component="section" sx={{ mb: 4 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
              <SchoolIcon sx={{ color: 'text.secondary' }} />
              <Typography variant="h3" sx={{ fontSize: '1.25rem', fontWeight: 700 }}>
                Top participating colleges
              </Typography>
            </Stack>
            <Stack spacing={1.25}>
              {config.topColleges!.map((c, idx) => (
                <Paper
                  key={`${c.name}-${idx}`}
                  elevation={0}
                  sx={{ p: 1.75, borderRadius: 2, border: '1px solid', borderColor: 'grey.200' }}
                >
                  <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="subtitle2" fontWeight={700}>
                        {c.url ? (
                          <Link href={c.url} style={{ textDecoration: 'none', color: 'inherit' }}>
                            {c.name}
                          </Link>
                        ) : (
                          c.name
                        )}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {c.city}
                        {c.intake ? ` · ${c.intake} seats` : ''}
                        {c.feesPerYear ? ` · ${c.feesPerYear}/yr` : ''}
                      </Typography>
                      {c.cutoffNote && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontStyle: 'italic' }}>
                          {c.cutoffNote}
                        </Typography>
                      )}
                    </Box>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          </Box>
        )}

        {/* Gotchas */}
        {showGotchas && (
          <Box component="section" sx={{ mb: 4 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
              <WarningAmberIcon sx={{ color: '#F57C00' }} />
              <Typography variant="h3" sx={{ fontSize: '1.25rem', fontWeight: 700 }}>
                Common mistakes to avoid
              </Typography>
            </Stack>
            <Stack spacing={1.5}>
              {config.gotchas!.map((g, idx) => (
                <Paper
                  key={`${g.title}-${idx}`}
                  elevation={0}
                  sx={{ p: 1.75, borderRadius: 2, bgcolor: '#FFF8E1', border: '1px solid #FFB74D' }}
                >
                  <Typography variant="subtitle2" fontWeight={700}>{g.title}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{g.detail}</Typography>
                </Paper>
              ))}
            </Stack>
          </Box>
        )}

        {/* FAQs (native details/summary keeps this a Server Component) */}
        {config.faqs.length > 0 && (
          <Box component="section" sx={{ mb: 4 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
              <HelpOutlineIcon sx={{ color: 'text.secondary' }} />
              <Typography variant="h3" sx={{ fontSize: '1.25rem', fontWeight: 700 }}>
                Frequently asked questions
              </Typography>
            </Stack>
            <Stack spacing={1}>
              {config.faqs.slice(0, 12).map((f, idx) => (
                <Paper
                  key={`${f.question}-${idx}`}
                  elevation={0}
                  component="details"
                  sx={{
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'grey.200',
                    overflow: 'hidden',
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
        )}

        {/* Tools CTA */}
        <Paper
          elevation={0}
          sx={{
            p: { xs: 2.5, md: 3 },
            mb: 4,
            borderRadius: 2,
            bgcolor: '#E3F2FD',
            border: '1px solid #1565C0',
          }}
        >
          <Typography variant="h3" sx={{ fontSize: '1.125rem', fontWeight: 700, mb: 1 }}>
            Free tools for {config.shortName} aspirants
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Predict your rank, calculate cutoff scores, and find colleges you can get into.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <Button
              component="a"
              href="https://app.neramclasses.com/tools/nata/cutoff-calculator"
              target="_blank"
              rel="noopener noreferrer"
              variant="contained"
              startIcon={<CalculateIcon />}
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
              startIcon={<TrendingUpIcon />}
            >
              College Predictor
            </Button>
          </Stack>
        </Paper>

        {/* Related counsellings */}
        {related.length > 0 && (
          <Box component="section" sx={{ mb: 4 }}>
            <Typography variant="h3" sx={{ fontSize: '1.125rem', fontWeight: 700, mb: 2 }}>
              Explore other counsellings
            </Typography>
            <Grid container spacing={1.5}>
              {related.map((r) => (
                <Grid item xs={12} sm={6} key={r.slug}>
                  <Paper
                    component={Link}
                    href={`${localePrefix}/counseling/${r.slug}`}
                    elevation={0}
                    sx={{
                      display: 'block',
                      p: 1.75,
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'grey.200',
                      textDecoration: 'none',
                      color: 'inherit',
                      transition: 'border-color 0.2s',
                      '&:hover': { borderColor: 'primary.main' },
                    }}
                  >
                    <Typography variant="subtitle2" fontWeight={700}>{r.shortName}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                      {r.blurb}
                    </Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>
            <Box sx={{ mt: 2, textAlign: 'center' }}>
              <Button component={Link} href={`${localePrefix}/counseling`} endIcon={<ArrowForwardIcon />}>
                View all 28 counsellings
              </Button>
            </Box>
          </Box>
        )}

        <Divider sx={{ my: 3 }} />
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center' }}>
          Information curated from official sources. Always verify against {' '}
          <a href={config.primaryUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>
            {new URL(config.primaryUrl).host}
          </a>
          {' '}before applying.
        </Typography>
      </Container>

      <CallbackDrawer
        variant="sticky"
        context={`${config.shortName} B.Arch 2026`}
        queryType="b_arch_counselling"
        courseInterest="nata"
        ctaLabel={`Get ${config.shortName} Counselling Help`}
        drawerTitle={`Free ${config.shortName} Counselling Call`}
        drawerIntro={`Talk to a counsellor about ${config.shortName} eligibility, college choice, and counselling rounds. Free, no obligation.`}
        successMessage={`Our counsellor will call you back within 24 hours about ${config.shortName}.`}
        cutoffCalculatorUrl="https://app.neramclasses.com/tools/nata/cutoff-calculator"
        collegePredictorUrl="https://app.neramclasses.com/tools/counseling/college-predictor"
      />
    </>
  );
}

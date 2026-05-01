import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import {
  Box,
  Container,
  Typography,
  Grid,
  Chip,
  Button,
  Divider,
  Stack,
  Paper,
} from '@mui/material';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  generateBreadcrumbSchema,
  generateFAQSchema,
} from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import { getActivePgetaFaqs } from '@neram/database';
import ExamFaqSection from '@/components/exam-hub/sections/ExamFaqSection';
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

export const revalidate = 3600;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title:
      'PGETA 2026 (PGEAT): COA M.Arch Entrance, Dates, Syllabus, Fees & Participating Institutes',
    description:
      'Complete PGETA 2026 guide (also known as PGEAT): three CBT test dates (May 31, June 14, June 28), eligibility, 4-module exam pattern, fees, top-100 scholarship, test cities, and 132 participating M.Arch institutes. Conducted by the Council of Architecture (COA) for postgraduate architecture admissions.',
    keywords:
      'PGETA 2026, PGEAT 2026, PGETA exam, PGETA syllabus, PGETA eligibility, PGETA fees, PGETA test dates, COA M.Arch entrance, M.Arch admission 2026, COA postgraduate exam, Master of Architecture entrance India, PGETA registration',
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

  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={faqSchema} />
      {eventSchemas.map((schema, i) => (
        <JsonLd key={i} data={schema} />
      ))}
      <JsonLd data={programSchema} />

      <Box>
        {/* ───────────── HERO ───────────── */}
        <Box
          component="section"
          sx={{
            bgcolor: 'secondary.main',
            color: 'secondary.contrastText',
            pt: { xs: 6, md: 9 },
            pb: { xs: 7, md: 10 },
          }}
        >
          <Container maxWidth="lg">
            <Stack spacing={2} alignItems="flex-start">
              <Chip
                label="NEW · M.Arch Entrance"
                size="small"
                sx={{
                  bgcolor: 'rgba(255,255,255,0.18)',
                  color: '#fff',
                  fontWeight: 600,
                  letterSpacing: 0.4,
                }}
              />
              <Typography
                variant="h2"
                component="h1"
                sx={{
                  fontWeight: 800,
                  lineHeight: 1.15,
                  fontSize: { xs: '2rem', sm: '2.5rem', md: '3.25rem' },
                  maxWidth: 900,
                }}
              >
                PGETA 2026: The COA M.Arch Entrance, Decoded
              </Typography>
              <Typography
                variant="h6"
                component="p"
                sx={{
                  fontWeight: 400,
                  opacity: 0.95,
                  maxWidth: 760,
                  fontSize: { xs: '1rem', md: '1.15rem' },
                }}
              >
                PGETA, also commonly searched as PGEAT, is the unified national-level entrance test for Master of Architecture (M.Arch) programs in India. Conducted by the Council of Architecture (COA), with three test dates and best-score-retained policy. Below: dates, eligibility, exam pattern, fees, scholarships, and accepting institutes.
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ pt: 1.5 }}>
                <Button
                  component={Link}
                  href="/apply"
                  variant="contained"
                  size="large"
                  sx={{
                    bgcolor: '#fff',
                    color: 'secondary.main',
                    fontWeight: 700,
                    minHeight: 48,
                    '&:hover': { bgcolor: '#f5f5f5' },
                  }}
                >
                  Talk to a counsellor
                </Button>
                <Button
                  component="a"
                  href="https://www.pgeta.in/"
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="outlined"
                  size="large"
                  sx={{
                    color: '#fff',
                    borderColor: 'rgba(255,255,255,0.7)',
                    fontWeight: 600,
                    minHeight: 48,
                    '&:hover': {
                      borderColor: '#fff',
                      bgcolor: 'rgba(255,255,255,0.08)',
                    },
                  }}
                >
                  Official PGETA portal
                </Button>
              </Stack>
            </Stack>
          </Container>
        </Box>

        {/* ───────────── AT-A-GLANCE ───────────── */}
        <Box component="section" id="at-a-glance" sx={{ bgcolor: 'background.paper', py: { xs: 5, md: 7 } }}>
          <Container maxWidth="lg">
            <Typography variant="h4" component="h2" sx={{ fontWeight: 700, mb: 3 }}>
              PGETA 2026 at a glance
            </Typography>
            <Typography sx={{ mb: 4, color: 'text.secondary', maxWidth: 760 }}>
              The short answer first: PGETA 2026 is a 2-hour CBT with three attempt windows in May and June 2026. Eligibility is a B.Arch with at least 50% marks. The best score across attempts is retained for admission.
            </Typography>
            <Grid container spacing={2}>
              {PGETA_QUICK_FACTS.map((fact) => (
                <Grid item xs={12} sm={6} md={3} key={fact.label}>
                  <Paper
                    elevation={0}
                    sx={{
                      p: 2.5,
                      height: '100%',
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                        color: 'text.secondary',
                        fontWeight: 600,
                      }}
                    >
                      {fact.label}
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 600, mt: 0.5 }}>
                      {fact.value}
                    </Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* ───────────── ELIGIBILITY ───────────── */}
        <Box component="section" id="eligibility" sx={{ bgcolor: 'grey.50', py: { xs: 5, md: 7 } }}>
          <Container maxWidth="md">
            <Typography variant="h4" component="h2" sx={{ fontWeight: 700, mb: 2 }}>
              Eligibility for PGETA 2026
            </Typography>
            <Typography sx={{ mb: 3, color: 'text.secondary', fontSize: '1.05rem' }}>
              You need a Bachelor of Architecture (B.Arch) from a COA-approved institution with at least 50% aggregate marks.
            </Typography>
            <Box component="ul" sx={{ pl: 3, m: 0, color: 'text.primary', '& li': { mb: 1.25, lineHeight: 1.7 } }}>
              <li>B.Arch degree from a COA-approved institution.</li>
              <li>Minimum 50% aggregate marks (or equivalent CGPA).</li>
              <li>Final-year B.Arch students may apply, subject to passing their B.Arch.</li>
              <li>No upper age limit.</li>
              <li>COA registration is recommended for practising architects but not strictly required to attempt PGETA.</li>
            </Box>
          </Container>
        </Box>

        {/* ───────────── SCHEDULE ───────────── */}
        <Box component="section" id="schedule" sx={{ bgcolor: 'background.paper', py: { xs: 5, md: 7 } }}>
          <Container maxWidth="md">
            <Typography variant="h4" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
              PGETA 2026 schedule, three attempts
            </Typography>
            <Typography sx={{ mb: 4, color: 'text.secondary' }}>
              You may attempt all three tests. The best score is automatically retained for admission. Each attempt requires a separate registration fee.
            </Typography>
            <Stack spacing={1.5}>
              {PGETA_SCHEDULE.map((row) => (
                <Paper
                  key={row.label}
                  elevation={0}
                  sx={{
                    p: 2.25,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: row.highlight ? 'secondary.main' : 'divider',
                    bgcolor: row.highlight ? 'rgba(220, 0, 78, 0.04)' : 'background.paper',
                    display: 'flex',
                    flexDirection: { xs: 'column', sm: 'row' },
                    gap: { xs: 0.5, sm: 2 },
                    alignItems: { xs: 'flex-start', sm: 'center' },
                  }}
                >
                  <Typography
                    sx={{
                      fontWeight: row.highlight ? 700 : 600,
                      flex: 1,
                      color: row.highlight ? 'secondary.main' : 'text.primary',
                    }}
                  >
                    {row.label}
                  </Typography>
                  <Typography sx={{ fontWeight: 600, minWidth: { sm: 220 } }}>{row.date}</Typography>
                  <Typography sx={{ color: 'text.secondary', fontSize: '0.95rem' }}>{row.time}</Typography>
                </Paper>
              ))}
            </Stack>
          </Container>
        </Box>

        {/* ───────────── EXAM PATTERN, 4 modules ───────────── */}
        <Box component="section" id="exam-pattern" sx={{ bgcolor: 'grey.50', py: { xs: 5, md: 7 } }}>
          <Container maxWidth="lg">
            <Typography variant="h4" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
              PGETA 2026 exam pattern, 4 modules across 100 questions
            </Typography>
            <Typography sx={{ mb: 4, color: 'text.secondary', maxWidth: 760 }}>
              CBT format, 2 hours, 100 questions in English. Architecture and Design carries the largest weight; the rest cover engineering bridges, electives, and research aptitude.
            </Typography>
            <Grid container spacing={2}>
              {PGETA_MODULES.map((mod, idx) => (
                <Grid item xs={12} md={6} key={mod.title}>
                  <Paper
                    elevation={0}
                    sx={{
                      p: 3,
                      height: '100%',
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'divider',
                      borderTop: '4px solid',
                      borderTopColor: 'secondary.main',
                    }}
                  >
                    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                      <Typography variant="overline" sx={{ color: 'secondary.main', fontWeight: 700 }}>
                        Module {idx + 1}
                      </Typography>
                      <Chip label={`${mod.questions} Q`} size="small" sx={{ fontWeight: 700 }} />
                    </Stack>
                    <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
                      {mod.title}
                    </Typography>
                    <Typography sx={{ color: 'text.secondary', lineHeight: 1.7 }}>
                      {mod.summary}
                    </Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* ───────────── FEES + SCHOLARSHIP ───────────── */}
        <Box component="section" id="fees" sx={{ bgcolor: 'background.paper', py: { xs: 5, md: 7 } }}>
          <Container maxWidth="lg">
            <Typography variant="h4" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
              Fees and scholarships
            </Typography>
            <Typography sx={{ mb: 4, color: 'text.secondary' }}>
              Per attempt fees vary by category. The COA also funds a top-100 scholarship.
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Paper elevation={0} sx={{ p: 3, borderRadius: 2, border: '1px solid', borderColor: 'divider', height: '100%' }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5 }}>
                    Registration fees, per attempt
                  </Typography>
                  <Stack spacing={1.5}>
                    {PGETA_FEES.map((fee) => (
                      <Box key={fee.category} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider', pb: 1 }}>
                        <Typography sx={{ color: 'text.secondary', flex: 1, pr: 2 }}>
                          {fee.category}
                        </Typography>
                        <Typography sx={{ fontWeight: 700 }}>{fee.amount}</Typography>
                      </Box>
                    ))}
                  </Stack>
                  <Typography variant="caption" sx={{ display: 'block', mt: 2, color: 'text.secondary' }}>
                    Payment online via debit card, credit card, or net banking.
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={12} md={6}>
                <Paper elevation={0} sx={{ p: 3, borderRadius: 2, bgcolor: 'rgba(46, 125, 50, 0.06)', border: '1px solid', borderColor: 'success.light', height: '100%' }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, mb: 1, color: 'success.dark' }}>
                    {PGETA_SCHOLARSHIP.title}
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 800, color: 'success.dark', mb: 1.5 }}>
                    {PGETA_SCHOLARSHIP.amount}
                  </Typography>
                  <Box component="ul" sx={{ pl: 2.5, m: 0, '& li': { mb: 0.75, lineHeight: 1.7 } }}>
                    {PGETA_SCHOLARSHIP.conditions.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </Box>
                </Paper>
              </Grid>
            </Grid>
          </Container>
        </Box>

        {/* ───────────── TEST CITIES ───────────── */}
        <Box component="section" id="centres" sx={{ bgcolor: 'grey.50', py: { xs: 5, md: 7 } }}>
          <Container maxWidth="md">
            <Typography variant="h4" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
              Where is PGETA 2026 conducted?
            </Typography>
            <Typography sx={{ mb: 3, color: 'text.secondary', fontSize: '1.05rem' }}>
              PGETA 2026 is held at designated CBT centres across major Indian cities. PGETA is not a from-home online test. You select preferred cities during registration; the final centre is allocated by the conducting body.
            </Typography>
            <Grid container spacing={1.25}>
              {PGETA_TEST_CITIES.map((city) => (
                <Grid item xs={6} sm={4} key={city}>
                  <Paper
                    elevation={0}
                    sx={{
                      p: 1.5,
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'divider',
                      textAlign: 'center',
                      fontWeight: 600,
                      fontSize: '0.95rem',
                    }}
                  >
                    {city}
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* ───────────── PARTICIPATING INSTITUTES ───────────── */}
        <Box component="section" id="participating-institutes" sx={{ bgcolor: 'background.paper', py: { xs: 5, md: 7 } }}>
          <Container maxWidth="md">
            <Typography variant="h4" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
              Participating M.Arch institutes
            </Typography>
            <Typography sx={{ mb: 3, color: 'text.secondary', fontSize: '1.05rem' }}>
              COA lists approximately 132 approved Master of Architecture programs (as of 2022-23). The full list is on the COA approved-institutions page. Notable accepting institutions include:
            </Typography>
            <Grid container spacing={1.25}>
              {PGETA_NOTABLE_INSTITUTES.map((institute) => (
                <Grid item xs={12} sm={6} key={institute}>
                  <Paper
                    elevation={0}
                    sx={{
                      p: 2,
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'divider',
                      fontWeight: 600,
                    }}
                  >
                    {institute}
                  </Paper>
                </Grid>
              ))}
            </Grid>
            <Button
              component="a"
              href="https://www.coa.gov.in/pgInstitutionStatus.php"
              target="_blank"
              rel="noopener noreferrer"
              variant="outlined"
              sx={{ mt: 3, fontWeight: 600 }}
            >
              View full COA-approved list →
            </Button>
          </Container>
        </Box>

        {/* ───────────── PGETA vs NATA ───────────── */}
        <Box component="section" id="pgeta-vs-nata" sx={{ bgcolor: 'grey.50', py: { xs: 5, md: 7 } }}>
          <Container maxWidth="md">
            <Typography variant="h4" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
              PGETA vs NATA, what is the difference?
            </Typography>
            <Typography sx={{ mb: 3, color: 'text.secondary' }}>
              Both are COA exams but at different levels. NATA is for B.Arch (undergraduate). PGETA is for M.Arch (postgraduate).
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Paper elevation={0} sx={{ p: 3, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>PGETA 2026</Typography>
                  <Box component="ul" sx={{ pl: 2.5, m: 0, '& li': { mb: 0.75, lineHeight: 1.7 } }}>
                    <li>Postgraduate (M.Arch, 2 years)</li>
                    <li>Eligibility: B.Arch with 50% minimum</li>
                    <li>2-hour CBT, 100 questions, 4 modules</li>
                    <li>Architectural theory, building science, research aptitude</li>
                    <li>Up to 3 attempts per year, best score</li>
                  </Box>
                </Paper>
              </Grid>
              <Grid item xs={12} md={6}>
                <Paper elevation={0} sx={{ p: 3, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>NATA 2026</Typography>
                  <Box component="ul" sx={{ pl: 2.5, m: 0, '& li': { mb: 0.75, lineHeight: 1.7 } }}>
                    <li>Undergraduate (B.Arch, 5 years)</li>
                    <li>Eligibility: 12th pass with Mathematics</li>
                    <li>Drawing offline + MCQ/NCQ online, 3 hours</li>
                    <li>Drawing aptitude and design reasoning</li>
                    <li>Up to 2 attempts in Phase 1, 1 in Phase 2</li>
                  </Box>
                  <Button
                    component={Link}
                    href="/nata-2026"
                    size="small"
                    sx={{ mt: 1.5, fontWeight: 600 }}
                  >
                    See NATA 2026 hub →
                  </Button>
                </Paper>
              </Grid>
            </Grid>
          </Container>
        </Box>

        {/* ───────────── FAQ ───────────── */}
        <ExamFaqSection
          faqs={faqs}
          subtitle="Common questions about PGETA 2026 (also known as PGEAT)"
        />

        {/* ───────────── FINAL CTA ───────────── */}
        <Box
          component="section"
          sx={{
            bgcolor: 'secondary.main',
            color: 'secondary.contrastText',
            py: { xs: 6, md: 8 },
          }}
        >
          <Container maxWidth="md" sx={{ textAlign: 'center' }}>
            <Typography variant="h4" sx={{ fontWeight: 800, mb: 1.5 }}>
              Planning your M.Arch journey?
            </Typography>
            <Typography sx={{ mb: 3, opacity: 0.95, fontSize: '1.05rem' }}>
              Talk to a counsellor about preparing for PGETA, choosing a specialisation, and shortlisting M.Arch institutes.
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center">
              <Button
                component={Link}
                href="/apply"
                variant="contained"
                size="large"
                sx={{
                  bgcolor: '#fff',
                  color: 'secondary.main',
                  fontWeight: 700,
                  minHeight: 48,
                  '&:hover': { bgcolor: '#f5f5f5' },
                }}
              >
                Talk to a counsellor
              </Button>
              <Button
                component="a"
                href="https://www.pgeta.in/"
                target="_blank"
                rel="noopener noreferrer"
                variant="outlined"
                size="large"
                sx={{
                  color: '#fff',
                  borderColor: 'rgba(255,255,255,0.7)',
                  fontWeight: 600,
                  minHeight: 48,
                  '&:hover': {
                    borderColor: '#fff',
                    bgcolor: 'rgba(255,255,255,0.08)',
                  },
                }}
              >
                Register on PGETA portal
              </Button>
            </Stack>
            <Divider sx={{ my: 4, borderColor: 'rgba(255,255,255,0.2)' }} />
            <Typography variant="body2" sx={{ opacity: 0.85 }}>
              Related: <Link href="/nata-2026" style={{ color: '#fff', textDecoration: 'underline' }}>NATA 2026 hub</Link> · <Link href="/jee-barch-hub" style={{ color: '#fff', textDecoration: 'underline' }}>JEE B.Arch hub</Link> · <Link href="/aat-2026" style={{ color: '#fff', textDecoration: 'underline' }}>AAT 2026 hub</Link>
            </Typography>
          </Container>
        </Box>
      </Box>
    </>
  );
}

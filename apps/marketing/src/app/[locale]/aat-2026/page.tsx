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
import { Link } from '@/i18n/routing';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  generateBreadcrumbSchema,
  generateFAQSchema,
} from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import { getActiveAatFaqs } from '@neram/database';
import ExamFaqSection from '@/components/exam-hub/sections/ExamFaqSection';
import {
  AAT_QUICK_FACTS,
  AAT_SCHEDULE,
  AAT_SYLLABUS,
  AAT_PARTICIPATING_IITS,
  AAT_CENTRES,
  AAT_DRAWING_KIT,
  AAT_DEFAULT_FAQS,
} from '@/components/aat/data/aatContent';

// ISR: revalidate hourly so dynamic FAQs from Supabase pick up admin edits.
export const revalidate = 3600;

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

  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={faqSchema} />
      <JsonLd data={eventSchema} />
      <JsonLd data={programSchema} />

      <Box>
        {/* ───────────── HERO ───────────── */}
        <Box
          component="section"
          sx={{
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            pt: { xs: 6, md: 9 },
            pb: { xs: 7, md: 10 },
          }}
        >
          <Container maxWidth="lg">
            <Stack spacing={2} alignItems="flex-start">
              <Chip
                label="NEW · Architecture Aptitude Test"
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
                AAT 2026: The IIT Architecture Aptitude Test, Decoded
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
                AAT is the qualifying test for B.Arch at IIT Roorkee, IIT Kharagpur, and IIT (BHU) Varanasi. Pass status, plus your JEE (Advanced) 2026 rank, decides allotment. Here is everything you need: dates, syllabus, exam pattern, drawing kit, and the IIT centres.
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ pt: 1.5 }}>
                <Button
                  component={Link}
                  href="/apply"
                  variant="contained"
                  size="large"
                  sx={{
                    bgcolor: '#fff',
                    color: 'primary.main',
                    fontWeight: 700,
                    minHeight: 48,
                    '&:hover': { bgcolor: '#f5f5f5' },
                  }}
                >
                  Talk to a counsellor
                </Button>
                <Button
                  component="a"
                  href="https://jeeadv.ac.in/documents/aat-syllabus.pdf"
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
                  Official AAT syllabus PDF
                </Button>
              </Stack>
            </Stack>
          </Container>
        </Box>

        {/* ───────────── AT-A-GLANCE ───────────── */}
        <Box
          component="section"
          id="at-a-glance"
          sx={{ bgcolor: 'background.paper', py: { xs: 5, md: 7 } }}
        >
          <Container maxWidth="lg">
            <Typography
              variant="h4"
              component="h2"
              sx={{ fontWeight: 700, mb: 3 }}
            >
              AAT 2026 at a glance
            </Typography>
            <Typography sx={{ mb: 4, color: 'text.secondary', maxWidth: 760 }}>
              The short answer first: AAT 2026 is a 3-hour offline pen-and-paper test on Thursday, June 4, 2026. It is free for JEE (Advanced) qualifiers, in English only, and the result is simply Pass or Fail.
            </Typography>
            <Grid container spacing={2}>
              {AAT_QUICK_FACTS.map((fact) => (
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
                    <Typography
                      variant="body1"
                      sx={{ fontWeight: 600, mt: 0.5 }}
                    >
                      {fact.value}
                    </Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* ───────────── ELIGIBILITY ───────────── */}
        <Box
          component="section"
          id="eligibility"
          sx={{ bgcolor: 'grey.50', py: { xs: 5, md: 7 } }}
        >
          <Container maxWidth="md">
            <Typography variant="h4" component="h2" sx={{ fontWeight: 700, mb: 2 }}>
              Eligibility for AAT 2026
            </Typography>
            <Typography sx={{ mb: 3, color: 'text.secondary', fontSize: '1.05rem' }}>
              Only candidates who have qualified JEE (Advanced) 2026 are eligible for AAT 2026. There is no separate eligibility check.
            </Typography>
            <Box component="ul" sx={{ pl: 3, m: 0, color: 'text.primary', '& li': { mb: 1.25, lineHeight: 1.7 } }}>
              <li>You must appear and qualify in JEE (Advanced) 2026.</li>
              <li>The Class XII (or equivalent) performance criterion in Clause 26 of the JEE (Advanced) 2026 brochure continues to apply for B.Arch admission.</li>
              <li>You register for AAT separately on the JEE (Advanced) 2026 portal during the 48-hour window after results.</li>
              <li>There is no age limit beyond what JEE (Advanced) requires.</li>
              <li>PwD candidates, see the dedicated provisions section below.</li>
            </Box>
          </Container>
        </Box>

        {/* ───────────── SCHEDULE ───────────── */}
        <Box
          component="section"
          id="schedule"
          sx={{ bgcolor: 'background.paper', py: { xs: 5, md: 7 } }}
        >
          <Container maxWidth="md">
            <Typography variant="h4" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
              AAT 2026 schedule
            </Typography>
            <Typography sx={{ mb: 4, color: 'text.secondary' }}>
              Registration is a tight 48-hour window after JEE (Advanced) results. Plan ahead.
            </Typography>
            <Stack spacing={1.5}>
              {AAT_SCHEDULE.map((row) => (
                <Paper
                  key={row.label}
                  elevation={0}
                  sx={{
                    p: 2.25,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: row.highlight ? 'primary.main' : 'divider',
                    bgcolor: row.highlight ? 'primary.50' : 'background.paper',
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
                      color: row.highlight ? 'primary.main' : 'text.primary',
                    }}
                  >
                    {row.label}
                  </Typography>
                  <Typography sx={{ fontWeight: 600, minWidth: { sm: 220 } }}>
                    {row.date}
                  </Typography>
                  <Typography sx={{ color: 'text.secondary', fontSize: '0.95rem' }}>
                    {row.time}
                  </Typography>
                </Paper>
              ))}
            </Stack>
          </Container>
        </Box>

        {/* ───────────── EXAM PATTERN ───────────── */}
        <Box
          component="section"
          id="exam-pattern"
          sx={{ bgcolor: 'grey.50', py: { xs: 5, md: 7 } }}
        >
          <Container maxWidth="md">
            <Typography variant="h4" component="h2" sx={{ fontWeight: 700, mb: 2 }}>
              AAT 2026 exam pattern
            </Typography>
            <Typography sx={{ mb: 3, color: 'text.secondary', fontSize: '1.05rem' }}>
              One offline pen-and-paper test of 3 hours. The question paper is in English only. The result is Pass or Fail, with cut-off decided by the Joint Implementation Committee. No marks, percentile, or AAT rank is published.
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Paper elevation={0} sx={{ p: 2.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="subtitle2" sx={{ color: 'text.secondary', mb: 0.5 }}>
                    Mode
                  </Typography>
                  <Typography sx={{ fontWeight: 600 }}>Offline, pen and paper</Typography>
                </Paper>
              </Grid>
              <Grid item xs={12} md={6}>
                <Paper elevation={0} sx={{ p: 2.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="subtitle2" sx={{ color: 'text.secondary', mb: 0.5 }}>
                    Duration
                  </Typography>
                  <Typography sx={{ fontWeight: 600 }}>3 hours (4 hours for eligible PwD candidates)</Typography>
                </Paper>
              </Grid>
              <Grid item xs={12} md={6}>
                <Paper elevation={0} sx={{ p: 2.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="subtitle2" sx={{ color: 'text.secondary', mb: 0.5 }}>
                    Language
                  </Typography>
                  <Typography sx={{ fontWeight: 600 }}>English only</Typography>
                </Paper>
              </Grid>
              <Grid item xs={12} md={6}>
                <Paper elevation={0} sx={{ p: 2.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="subtitle2" sx={{ color: 'text.secondary', mb: 0.5 }}>
                    Result format
                  </Typography>
                  <Typography sx={{ fontWeight: 600 }}>Pass or Fail (no marks, no rank)</Typography>
                </Paper>
              </Grid>
            </Grid>
          </Container>
        </Box>

        {/* ───────────── SYLLABUS ───────────── */}
        <Box
          component="section"
          id="syllabus"
          sx={{ bgcolor: 'background.paper', py: { xs: 5, md: 7 } }}
        >
          <Container maxWidth="lg">
            <Typography variant="h4" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
              AAT 2026 syllabus, 5 sections
            </Typography>
            <Typography sx={{ mb: 4, color: 'text.secondary', maxWidth: 760 }}>
              The official syllabus is published at jeeadv.ac.in/documents/aat-syllabus.pdf. Below is a faithful breakdown of each area, the skills it tests, and what to practice.
            </Typography>
            <Grid container spacing={2}>
              {AAT_SYLLABUS.map((section, idx) => (
                <Grid item xs={12} md={6} key={section.title}>
                  <Paper
                    elevation={0}
                    sx={{
                      p: 3,
                      height: '100%',
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'divider',
                      borderTop: '4px solid',
                      borderTopColor: 'primary.main',
                    }}
                  >
                    <Typography variant="overline" sx={{ color: 'primary.main', fontWeight: 700 }}>
                      Section {idx + 1}
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
                      {section.title}
                    </Typography>
                    <Typography sx={{ color: 'text.secondary', mb: 2, lineHeight: 1.7 }}>
                      {section.summary}
                    </Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {section.skills.map((skill) => (
                        <Chip
                          key={skill}
                          label={skill}
                          size="small"
                          variant="outlined"
                          sx={{ mb: 0.75 }}
                        />
                      ))}
                    </Stack>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* ───────────── PARTICIPATING IITs ───────────── */}
        <Box
          component="section"
          id="participating-iits"
          sx={{ bgcolor: 'grey.50', py: { xs: 5, md: 7 } }}
        >
          <Container maxWidth="lg">
            <Typography variant="h4" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
              Three IITs offer B.Arch via AAT
            </Typography>
            <Typography sx={{ mb: 4, color: 'text.secondary', maxWidth: 760 }}>
              Seats are allotted strictly on JEE (Advanced) 2026 All India Rank, with AAT Pass status as the prerequisite. JoSAA conducts the counselling.
            </Typography>
            <Grid container spacing={2}>
              {AAT_PARTICIPATING_IITS.map((iit) => (
                <Grid item xs={12} md={4} key={iit.name}>
                  <Paper
                    elevation={0}
                    sx={{
                      p: 3,
                      height: '100%',
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
                      {iit.name}
                    </Typography>
                    <Typography variant="subtitle2" sx={{ color: 'primary.main', mb: 1 }}>
                      {iit.program}
                    </Typography>
                    <Typography sx={{ color: 'text.secondary', mb: 1.5, lineHeight: 1.7 }}>
                      {iit.note}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {iit.seats}
                    </Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* ───────────── EXAMINATION CENTRES ───────────── */}
        <Box
          component="section"
          id="centres"
          sx={{ bgcolor: 'background.paper', py: { xs: 5, md: 7 } }}
        >
          <Container maxWidth="md">
            <Typography variant="h4" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
              AAT 2026 examination centres
            </Typography>
            <Typography sx={{ mb: 3, color: 'text.secondary', fontSize: '1.05rem' }}>
              AAT 2026 is conducted at seven zonal IIT centres in India. The official centre list is at jeeadv.ac.in/aat_centre_list.html. You select your preferred centre during registration.
            </Typography>
            <Grid container spacing={1.5}>
              {AAT_CENTRES.map((centre) => (
                <Grid item xs={6} sm={4} md={3} key={centre}>
                  <Paper
                    elevation={0}
                    sx={{
                      p: 2,
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'divider',
                      textAlign: 'center',
                      fontWeight: 600,
                    }}
                  >
                    {centre}
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* ───────────── DRAWING KIT ───────────── */}
        <Box
          component="section"
          id="drawing-kit"
          sx={{ bgcolor: 'grey.50', py: { xs: 5, md: 7 } }}
        >
          <Container maxWidth="md">
            <Typography variant="h4" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
              Drawing kit checklist
            </Typography>
            <Typography sx={{ mb: 4, color: 'text.secondary' }}>
              Candidates must bring their own drawing and colouring aids. Pack the night before.
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Paper elevation={0} sx={{ p: 3, borderRadius: 2, border: '1px solid', borderColor: 'success.light' }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: 'success.dark', mb: 1.5 }}>
                    Bring
                  </Typography>
                  <Box component="ul" sx={{ pl: 2.5, m: 0, '& li': { mb: 1, lineHeight: 1.7 } }}>
                    {AAT_DRAWING_KIT.bring.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </Box>
                </Paper>
              </Grid>
              <Grid item xs={12} md={6}>
                <Paper elevation={0} sx={{ p: 3, borderRadius: 2, border: '1px solid', borderColor: 'error.light' }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: 'error.dark', mb: 1.5 }}>
                    Avoid
                  </Typography>
                  <Box component="ul" sx={{ pl: 2.5, m: 0, '& li': { mb: 1, lineHeight: 1.7 } }}>
                    {AAT_DRAWING_KIT.avoid.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </Box>
                </Paper>
              </Grid>
            </Grid>
          </Container>
        </Box>

        {/* ───────────── PwD PROVISIONS ───────────── */}
        <Box
          component="section"
          id="pwd"
          sx={{ bgcolor: 'background.paper', py: { xs: 5, md: 7 } }}
        >
          <Container maxWidth="md">
            <Typography variant="h4" component="h2" sx={{ fontWeight: 700, mb: 2 }}>
              Provisions for PwD candidates
            </Typography>
            <Typography sx={{ mb: 2.5, color: 'text.secondary', fontSize: '1.05rem' }}>
              PwD candidates with at least 40% impairment under the RPwD Act 2016 are eligible for one hour of compensatory time, making AAT a 4-hour test. The same applies to candidates with less than 40% disability who have difficulty writing under Section 2(s) of the said Act.
            </Typography>
            <Box component="ul" sx={{ pl: 3, m: 0, color: 'text.primary', '& li': { mb: 1.25, lineHeight: 1.7 } }}>
              <li>Compensatory time: one additional hour (total 4 hours).</li>
              <li>Scribe (amanuensis) services available on request.</li>
              <li>Required certificate formats are in Annexure-II of the JEE (Advanced) 2026 brochure.</li>
              <li>Request must be made during JEE (Advanced) 2026 registration, not at the AAT centre.</li>
            </Box>
          </Container>
        </Box>

        {/* ───────────── AAT vs NATA ───────────── */}
        <Box
          component="section"
          id="aat-vs-nata"
          sx={{ bgcolor: 'grey.50', py: { xs: 5, md: 7 } }}
        >
          <Container maxWidth="md">
            <Typography variant="h4" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
              AAT vs NATA, when do you take which?
            </Typography>
            <Typography sx={{ mb: 3, color: 'text.secondary' }}>
              Quick answer: AAT is for B.Arch at three IITs and requires JEE Advanced. NATA is for B.Arch at most other Indian colleges, with no JEE requirement. Many serious aspirants take both.
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Paper elevation={0} sx={{ p: 3, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>AAT 2026</Typography>
                  <Box component="ul" sx={{ pl: 2.5, m: 0, '& li': { mb: 0.75, lineHeight: 1.7 } }}>
                    <li>3 IITs only (Roorkee, Kharagpur, BHU)</li>
                    <li>Eligibility: JEE (Advanced) qualifier</li>
                    <li>3-hour offline pen-and-paper</li>
                    <li>Pass or Fail, no rank</li>
                    <li>Allotment by JEE (Advanced) AIR</li>
                  </Box>
                </Paper>
              </Grid>
              <Grid item xs={12} md={6}>
                <Paper elevation={0} sx={{ p: 3, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>NATA 2026</Typography>
                  <Box component="ul" sx={{ pl: 2.5, m: 0, '& li': { mb: 0.75, lineHeight: 1.7 } }}>
                    <li>Most COA-approved B.Arch colleges</li>
                    <li>Eligibility: 12th pass with Mathematics</li>
                    <li>Drawing offline + MCQ/NCQ online, 3 hours</li>
                    <li>Marks and percentile published</li>
                    <li>2 attempts in Phase 1, 1 in Phase 2</li>
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
          subtitle="Common questions about AAT 2026"
        />

        {/* ───────────── FINAL CTA ───────────── */}
        <Box
          component="section"
          sx={{
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            py: { xs: 6, md: 8 },
          }}
        >
          <Container maxWidth="md" sx={{ textAlign: 'center' }}>
            <Typography variant="h4" sx={{ fontWeight: 800, mb: 1.5 }}>
              Preparing for AAT 2026?
            </Typography>
            <Typography sx={{ mb: 3, opacity: 0.95, fontSize: '1.05rem' }}>
              Neram coaches both NATA and AAT aspirants. Our drawing labs and architectural awareness modules cover the AAT pattern end-to-end.
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center">
              <Button
                component={Link}
                href="/apply"
                variant="contained"
                size="large"
                sx={{
                  bgcolor: '#fff',
                  color: 'primary.main',
                  fontWeight: 700,
                  minHeight: 48,
                  '&:hover': { bgcolor: '#f5f5f5' },
                }}
              >
                Talk to a counsellor
              </Button>
              <Button
                component={Link}
                href="/courses"
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
                See coaching programs
              </Button>
            </Stack>
            <Divider sx={{ my: 4, borderColor: 'rgba(255,255,255,0.2)' }} />
            <Typography variant="body2" sx={{ opacity: 0.85 }}>
              Related: <Link href="/nata-2026" style={{ color: '#fff', textDecoration: 'underline' }}>NATA 2026 hub</Link> · <Link href="/jee-barch-hub" style={{ color: '#fff', textDecoration: 'underline' }}>JEE B.Arch hub</Link> · <Link href="/pgeta-2026" style={{ color: '#fff', textDecoration: 'underline' }}>PGETA 2026 hub (M.Arch)</Link>
            </Typography>
          </Container>
        </Box>
      </Box>
    </>
  );
}

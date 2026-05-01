import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Typography, Box, Stack, Paper } from '@neram/ui';
import ExamSpokeLayout from '@/components/exam-hub/sections/ExamSpokeLayout';
import { JsonLd } from '@/components/seo/JsonLd';
import { buildAlternates } from '@/lib/seo/metadata';
import { AAT_SCHEDULE } from '@/components/aat/data/aatContent';

export const revalidate = 3600;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'AAT 2026 Schedule: Registration June 1-2, Exam June 4, Result June 7',
    description:
      'Full AAT 2026 schedule with day-of-week and IST timings. Registration opens June 1, 2026 (10:00 IST), closes June 2 (17:00 IST). Exam Thursday June 4, 9:00 to 12:00 IST. Result Sunday June 7 at 17:00 IST.',
    keywords:
      'AAT 2026 date, AAT 2026 exam date, AAT registration dates, AAT 2026 result date, when is AAT 2026, AAT 2026 timetable',
    alternates: buildAlternates(locale, '/aat-2026/schedule'),
  };
}

export default function AatSchedulePage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);

  const eventSchema = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: 'Architecture Aptitude Test (AAT) 2026',
    startDate: '2026-06-04T09:00:00+05:30',
    endDate: '2026-06-04T12:00:00+05:30',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
    location: {
      '@type': 'Place',
      name: 'Seven zonal IIT centres in India',
      address: { '@type': 'PostalAddress', addressCountry: 'IN' },
    },
    organizer: {
      '@type': 'Organization',
      name: 'JEE (Advanced) 2026 Board',
      url: 'https://jeeadv.ac.in',
    },
  };

  return (
    <>
      <JsonLd data={eventSchema} />
      <ExamSpokeLayout
        examName="AAT 2026"
        examShortName="AAT 2026"
        examHubHref="/aat-2026"
        topicTitle="AAT 2026 schedule and important dates"
        topicSubtitle="The short answer: AAT 2026 is on Thursday, June 4, 2026 from 09:00 to 12:00 IST. Registration is a 48-hour window after JEE Advanced results."
        related={[
          { label: 'Eligibility', href: '/aat-2026/eligibility' },
          { label: 'Examination centres', href: '/aat-2026/centres' },
          { label: 'Drawing kit checklist', href: '/aat-2026/drawing-kit' },
        ]}
      >
        <Stack spacing={3}>
          <Box>
            <Typography variant="h5" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
              Date-by-date timeline
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
                  }}
                >
                  <Typography sx={{ fontWeight: row.highlight ? 700 : 600, flex: 1, color: row.highlight ? 'primary.main' : 'text.primary' }}>
                    {row.label}
                  </Typography>
                  <Typography sx={{ fontWeight: 600, minWidth: { sm: 220 } }}>{row.date}</Typography>
                  <Typography sx={{ color: 'text.secondary' }}>{row.time}</Typography>
                </Paper>
              ))}
            </Stack>
          </Box>

          <Box>
            <Typography variant="h5" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
              Why the registration window is so short
            </Typography>
            <Typography sx={{ lineHeight: 1.8, color: 'text.primary' }}>
              JEE (Advanced) 2026 results are declared on June 1, 2026, the same day AAT registration opens. The 48-hour window ensures only serious B.Arch aspirants register, while keeping the schedule tight enough to fit the AAT exam two days later. Plan ahead: keep your JEE (Advanced) credentials, photo, and signature uploads ready before results day so you do not lose minutes hunting for files.
            </Typography>
          </Box>

          <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
              Day-of-exam timing
            </Typography>
            <Box component="ul" sx={{ pl: 3, m: 0, '& li': { mb: 0.75, lineHeight: 1.7 } }}>
              <li>Reach the examination centre by 08:00 IST.</li>
              <li>Test starts at 09:00 IST sharp.</li>
              <li>Test ends at 12:00 IST. PwD candidates with eligible accommodation get one extra hour.</li>
              <li>Carry the printed JEE (Advanced) 2026 admit card and an original government photo ID.</li>
            </Box>
          </Paper>

          <Box>
            <Typography variant="h5" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
              Result format and what comes next
            </Typography>
            <Typography sx={{ lineHeight: 1.8, color: 'text.primary' }}>
              On Sunday, June 7, 2026 at 17:00 IST, results are published as a Pass or Fail status only. No marks, percentile, or AAT rank is declared. From there, JoSAA counselling considers your JEE (Advanced) 2026 All India Rank for B.Arch seat allotment at IIT Roorkee, IIT Kharagpur, and IIT (BHU) Varanasi, conditional on AAT Pass.
            </Typography>
          </Box>
        </Stack>
      </ExamSpokeLayout>
    </>
  );
}

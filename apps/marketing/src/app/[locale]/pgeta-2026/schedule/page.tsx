import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Typography, Box, Stack, Paper } from '@neram/ui';
import ExamSpokeLayout from '@/components/exam-hub/sections/ExamSpokeLayout';
import { buildAlternates } from '@/lib/seo/metadata';
import { PGETA_SCHEDULE } from '@/components/pgeta/data/pgetaContent';

export const revalidate = 3600;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'PGETA 2026 Schedule: Three Tests on May 31, June 14, June 28',
    description:
      'PGETA 2026 (also known as PGEAT) is conducted on three Sundays in 2026: May 31, June 14, and June 28, all 10:00 AM to 12:00 PM. Best score across attempts is retained. Final results July 7, 2026.',
    keywords:
      'PGETA 2026 dates, PGEAT 2026 dates, PGETA test 1, PGETA test 2, PGETA test 3, when is PGETA, PGETA result date',
    alternates: buildAlternates(locale, '/pgeta-2026/schedule'),
  };
}

export default function PgetaSchedulePage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);

  return (
    <ExamSpokeLayout
      examName="PGETA 2026"
      examShortName="PGETA 2026"
      examHubHref="/pgeta-2026"
      examColor="secondary"
      topicTitle="PGETA 2026 schedule, three test dates"
      topicSubtitle="Three Sunday tests, all 10:00 AM to 12:00 PM. You may attempt all three; the best score is automatically retained for admission."
      related={[
        { label: 'Eligibility', href: '/pgeta-2026/eligibility' },
        { label: 'Fees', href: '/pgeta-2026/fees' },
        { label: 'Score validity', href: '/pgeta-2026/score-validity' },
      ]}
    >
      <Stack spacing={3}>
        <Box>
          <Typography variant="h5" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
            Date-by-date timeline
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
                }}
              >
                <Typography sx={{ fontWeight: row.highlight ? 700 : 600, flex: 1, color: row.highlight ? 'secondary.main' : 'text.primary' }}>
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
            How the three-attempt system works
          </Typography>
          <Box component="ul" sx={{ pl: 3, m: 0, '& li': { mb: 1, lineHeight: 1.7 } }}>
            <li>Each test is independent: same syllabus, same pattern, fresh question paper.</li>
            <li>You can attempt one, two, or all three. Skipping a test does not penalise you.</li>
            <li>The system automatically retains your best score across the attempts you took.</li>
            <li>Each attempt requires a separate registration and a separate fee.</li>
            <li>Final results consolidating the best score are declared on July 7, 2026.</li>
          </Box>
        </Box>

        <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
            Should you attempt all three?
          </Typography>
          <Typography sx={{ lineHeight: 1.7 }}>
            Most strong candidates attempt at least two tests. Use Test 1 (May 31) as a real-conditions diagnostic, identify weak modules, and focus the next two weeks on those. Test 2 (June 14) and Test 3 (June 28) become opportunities to push your best score upwards. Treat each test fee as an investment in admission, not a sunk cost.
          </Typography>
        </Paper>
      </Stack>
    </ExamSpokeLayout>
  );
}

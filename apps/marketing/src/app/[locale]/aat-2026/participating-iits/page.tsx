import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Typography, Box, Stack, Paper, Grid } from '@neram/ui';
import ExamSpokeLayout from '@/components/exam-hub/sections/ExamSpokeLayout';
import { buildAlternates } from '@/lib/seo/metadata';
import { AAT_PARTICIPATING_IITS } from '@/components/aat/data/aatContent';

export const revalidate = 3600;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'IITs Offering B.Arch via AAT 2026: Roorkee, Kharagpur, BHU Varanasi',
    description:
      'Three IITs offer the 5-year B.Arch program through AAT 2026: IIT Roorkee, IIT Kharagpur, and IIT (BHU) Varanasi. Department details, NIRF rankings, and admission process via JoSAA.',
    keywords:
      'IIT B.Arch colleges, AAT participating IITs, IIT Roorkee architecture, IIT Kharagpur architecture, IIT BHU architecture, B.Arch IIT admission',
    alternates: buildAlternates(locale, '/aat-2026/participating-iits'),
  };
}

export default function AatParticipatingIitsPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);

  return (
    <ExamSpokeLayout
      examName="AAT 2026"
      examShortName="AAT 2026"
      examHubHref="/aat-2026"
      topicTitle="IITs offering B.Arch via AAT 2026"
      topicSubtitle="Three IITs offer the 5-year B.Arch program through AAT 2026. Seats are allotted by JoSAA strictly on JEE (Advanced) 2026 All India Rank, with AAT Pass as the prerequisite."
      related={[
        { label: 'Eligibility', href: '/aat-2026/eligibility' },
        { label: 'Centres', href: '/aat-2026/centres' },
        { label: 'Schedule', href: '/aat-2026/schedule' },
      ]}
    >
      <Stack spacing={3}>
        <Grid container spacing={2}>
          {AAT_PARTICIPATING_IITS.map((iit) => (
            <Grid item xs={12} key={iit.name}>
              <Paper
                elevation={0}
                sx={{
                  p: 3,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderLeft: '4px solid',
                  borderLeftColor: 'primary.main',
                }}
              >
                <Typography variant="h5" component="h2" sx={{ fontWeight: 700, mb: 0.5 }}>
                  {iit.name}
                </Typography>
                <Typography variant="subtitle2" sx={{ color: 'primary.main', fontWeight: 700, mb: 1.5 }}>
                  {iit.program}
                </Typography>
                <Typography sx={{ lineHeight: 1.8, color: 'text.primary', mb: 1 }}>
                  {iit.note}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {iit.seats}
                </Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>

        <Box>
          <Typography variant="h5" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
            How seat allotment works
          </Typography>
          <Box component="ul" sx={{ pl: 3, m: 0, '& li': { mb: 1, lineHeight: 1.7 } }}>
            <li>JoSAA conducts six rounds of counselling between June and July 2026.</li>
            <li>Only AAT-passed candidates are considered for B.Arch at the three IITs.</li>
            <li>Allotment uses category-wise JEE (Advanced) 2026 All India Rank, not AAT performance.</li>
            <li>You fill choices on the JoSAA portal; allotment is automatic per the seat matrix.</li>
            <li>Seat acceptance, document verification, and reporting deadlines are non-negotiable. Missing them forfeits the seat.</li>
          </Box>
        </Box>

        <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, bgcolor: 'rgba(33, 150, 243, 0.04)' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
            What if you do not get an IIT seat?
          </Typography>
          <Typography sx={{ lineHeight: 1.7 }}>
            JoSAA also allots B.Arch seats at NITs, SPAs, and IIITs through JEE Main Paper 2A (no AAT required). NATA-based admissions at state and private B.Arch colleges remain open. Many architecture aspirants attempt all three (NATA, JEE Main Paper 2, AAT) to maximise options.
          </Typography>
        </Paper>
      </Stack>
    </ExamSpokeLayout>
  );
}

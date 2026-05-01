import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Typography, Box, Stack, Paper, Grid } from '@neram/ui';
import ExamSpokeLayout from '@/components/exam-hub/sections/ExamSpokeLayout';
import { buildAlternates } from '@/lib/seo/metadata';
import { AAT_CENTRES } from '@/components/aat/data/aatContent';

export const revalidate = 3600;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'AAT 2026 Centres: 7 Zonal IITs (Bombay, Delhi, Guwahati, Kanpur, Kharagpur, Madras, Roorkee)',
    description:
      'AAT 2026 is conducted at seven zonal IIT centres across India. Official centre list at jeeadv.ac.in/aat_centre_list.html. Choose your preferred centre during registration; final allocation by the conducting body.',
    keywords:
      'AAT 2026 centres, AAT exam centres, AAT zonal IITs, AAT centre list, AAT IIT Bombay, AAT IIT Delhi, AAT IIT Roorkee',
    alternates: buildAlternates(locale, '/aat-2026/centres'),
  };
}

export default function AatCentresPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);

  return (
    <ExamSpokeLayout
      examName="AAT 2026"
      examShortName="AAT 2026"
      examHubHref="/aat-2026"
      topicTitle="AAT 2026 examination centres"
      topicSubtitle="AAT 2026 is conducted at seven zonal IIT centres in India. The official centre list is published at jeeadv.ac.in/aat_centre_list.html."
      related={[
        { label: 'Schedule', href: '/aat-2026/schedule' },
        { label: 'Drawing kit', href: '/aat-2026/drawing-kit' },
        { label: 'Eligibility', href: '/aat-2026/eligibility' },
      ]}
    >
      <Stack spacing={3}>
        <Box>
          <Typography variant="h5" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
            The 7 zonal IIT centres
          </Typography>
          <Grid container spacing={1.5}>
            {AAT_CENTRES.map((centre) => (
              <Grid item xs={6} sm={4} key={centre}>
                <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider', textAlign: 'center', fontWeight: 600 }}>
                  {centre}
                </Paper>
              </Grid>
            ))}
          </Grid>
          <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: 'text.secondary' }}>
            IIT Roorkee is the coordinating institute for AAT 2026.
          </Typography>
        </Box>

        <Box>
          <Typography variant="h5" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
            How centre allocation works
          </Typography>
          <Box component="ul" sx={{ pl: 3, m: 0, '& li': { mb: 1, lineHeight: 1.7 } }}>
            <li>During AAT registration on jeeadv.ac.in, you select your preferred centre from the seven options.</li>
            <li>The final centre is allotted by the conducting body, subject to capacity. Most candidates get their first preference.</li>
            <li>Once allotted, the centre is fixed; no changes are entertained.</li>
            <li>Your allotted centre appears on your JEE (Advanced) admit card, which doubles as the AAT admit card.</li>
            <li>Plan travel and accommodation early. Major IIT cities have limited budget-friendly stays during exam season.</li>
          </Box>
        </Box>

        <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
            Day-of-exam logistics
          </Typography>
          <Box component="ul" sx={{ pl: 3, m: 0, '& li': { mb: 0.75, lineHeight: 1.7 } }}>
            <li>Reach the centre by 08:00 IST. The exam starts at 09:00 IST sharp.</li>
            <li>Carry the printed JEE (Advanced) 2026 admit card and an original government photo ID (Aadhaar, Passport, Driving License, Voter ID).</li>
            <li>Mobile phones, smart watches, calculators, and electronic devices are not allowed inside the centre.</li>
            <li>Bring your own drawing kit. Centres do not provide pencils, erasers, or geometry boxes.</li>
            <li>Do a dry run of the route the previous evening. Account for local traffic, especially in Delhi, Bombay, and Madras.</li>
          </Box>
        </Paper>
      </Stack>
    </ExamSpokeLayout>
  );
}

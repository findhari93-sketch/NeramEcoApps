import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Typography, Box, Stack, Paper, Grid, Button } from '@neram/ui';
import ExamSpokeLayout from '@/components/exam-hub/sections/ExamSpokeLayout';
import { buildAlternates } from '@/lib/seo/metadata';
import { PGETA_NOTABLE_INSTITUTES } from '@/components/pgeta/data/pgetaContent';

export const revalidate = 3600;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'PGETA 2026 Participating Institutes: 132 COA-Approved M.Arch Programs',
    description:
      'COA lists approximately 132 approved Master of Architecture programs that admit through PGETA 2026 scores. Notable institutions include Chandigarh College of Architecture, KRVIA Mumbai, MSAP Manipal, Rizvi College of Architecture, and Nirma University.',
    keywords:
      'PGETA participating institutes, PGEAT colleges, M.Arch colleges India, COA approved M.Arch list, PGETA accepting colleges',
    alternates: buildAlternates(locale, '/pgeta-2026/participating-institutes'),
  };
}

export default function PgetaParticipatingInstitutesPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);

  return (
    <ExamSpokeLayout
      examName="PGETA 2026"
      examShortName="PGETA 2026"
      examHubHref="/pgeta-2026"
      examColor="secondary"
      topicTitle="PGETA 2026 participating institutes"
      topicSubtitle="COA lists approximately 132 approved Master of Architecture programs (as of 2022-23) that admit through PGETA scores. The complete list is on the COA approved-institutions page."
      related={[
        { label: 'Eligibility', href: '/pgeta-2026/eligibility' },
        { label: 'Score validity', href: '/pgeta-2026/score-validity' },
        { label: 'Fees + scholarship', href: '/pgeta-2026/fees' },
      ]}
    >
      <Stack spacing={3}>
        <Box>
          <Typography variant="h5" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
            Notable accepting institutions
          </Typography>
          <Grid container spacing={1.25}>
            {PGETA_NOTABLE_INSTITUTES.map((institute) => (
              <Grid item xs={12} sm={6} key={institute}>
                <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider', fontWeight: 600 }}>
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
            color="secondary"
            sx={{ mt: 3, fontWeight: 600 }}
          >
            View full COA-approved list →
          </Button>
        </Box>

        <Box>
          <Typography variant="h5" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
            Specialisations available
          </Typography>
          <Typography sx={{ lineHeight: 1.8, color: 'text.primary', mb: 2 }}>
            COA-approved M.Arch programs offer a range of specialisations. Confirm the specific tracks at each shortlisted institute before applying:
          </Typography>
          <Box component="ul" sx={{ pl: 3, m: 0, '& li': { mb: 0.75, lineHeight: 1.7 } }}>
            <li>Urban Design</li>
            <li>Sustainable Architecture / Green Building</li>
            <li>Landscape Architecture</li>
            <li>Construction Management</li>
            <li>Heritage Conservation</li>
            <li>Interior Design</li>
            <li>Environmental Architecture</li>
            <li>Architectural and Settlement Conservation</li>
          </Box>
        </Box>

        <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, bgcolor: 'rgba(220, 0, 78, 0.04)' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
            How to verify acceptance
          </Typography>
          <Box component="ul" sx={{ pl: 3, m: 0, '& li': { mb: 0.75, lineHeight: 1.7 } }}>
            <li>Confirm COA approval at coa.gov.in/pgInstitutionStatus.php.</li>
            <li>Check the institute's M.Arch admission notification for the year. Some institutions also accept GATE scores or institution-specific test scores alongside PGETA.</li>
            <li>State governments may run parallel CETs (Maharashtra, for instance). Check state portals if you target a specific state.</li>
            <li>Email or call the M.Arch coordinator at your shortlisted institute to confirm PGETA cut-off and admission process for the cycle.</li>
          </Box>
        </Paper>
      </Stack>
    </ExamSpokeLayout>
  );
}

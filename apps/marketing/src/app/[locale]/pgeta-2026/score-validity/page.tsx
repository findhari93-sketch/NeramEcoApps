import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Typography, Box, Stack, Paper } from '@neram/ui';
import ExamSpokeLayout from '@/components/exam-hub/sections/ExamSpokeLayout';
import { buildAlternates } from '@/lib/seo/metadata';

export const revalidate = 3600;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'PGETA 2026 Score Validity, Result Format, and How Admissions Use It',
    description:
      'PGETA 2026 results are declared as percentile scores on July 7, 2026. Score is valid for the 2026-2027 admission cycle. Validity beyond one cycle depends on the participating institute. How M.Arch programs use PGETA scores.',
    keywords:
      'PGETA score validity, PGEAT result format, PGETA percentile, M.Arch admission process, PGETA cut-off',
    alternates: buildAlternates(locale, '/pgeta-2026/score-validity'),
  };
}

export default function PgetaScoreValidityPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);

  return (
    <ExamSpokeLayout
      examName="PGETA 2026"
      examShortName="PGETA 2026"
      examHubHref="/pgeta-2026"
      examColor="secondary"
      topicTitle="PGETA 2026 score validity and result format"
      topicSubtitle="Results are declared on July 7, 2026 as percentile scores. The best score across your attempts is retained automatically. Validity is one academic year, with institute-specific extensions."
      related={[
        { label: 'Schedule', href: '/pgeta-2026/schedule' },
        { label: 'Participating institutes', href: '/pgeta-2026/participating-institutes' },
        { label: 'Eligibility', href: '/pgeta-2026/eligibility' },
      ]}
    >
      <Stack spacing={3}>
        <Box>
          <Typography variant="h5" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
            Result format
          </Typography>
          <Box component="ul" sx={{ pl: 3, m: 0, '& li': { mb: 1, lineHeight: 1.7 } }}>
            <li>Final results: July 7, 2026, on the PGETA portal.</li>
            <li>Format: percentile score, computed across all candidates who attempted any of the three tests.</li>
            <li>The system automatically retains your best score across the attempts you took.</li>
            <li>The exact percentile calculation method is detailed in the PGETA Information Brochure; verify before exam day.</li>
            <li>There is no national rank list. Each participating institute applies its own cut-off and ranking when admitting.</li>
          </Box>
        </Box>

        <Box>
          <Typography variant="h5" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
            Score validity
          </Typography>
          <Typography sx={{ lineHeight: 1.8, color: 'text.primary' }}>
            A PGETA 2026 score is valid for the 2026-2027 admission cycle by default. Some institutions accept the score for two cycles (2026-27 and 2027-28); this is at each institute's discretion and not centrally guaranteed. If you plan to defer admission by a year, confirm acceptance with the target M.Arch program before the deadline.
          </Typography>
        </Box>

        <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
            How M.Arch programs use PGETA scores
          </Typography>
          <Box component="ul" sx={{ pl: 3, m: 0, '& li': { mb: 0.75, lineHeight: 1.7 } }}>
            <li>Most COA-approved M.Arch programs use PGETA percentile as the primary admission filter.</li>
            <li>Institutes set their own minimum cut-off based on seats available and applicant pool that cycle.</li>
            <li>Many programs add an institutional component: portfolio review, written test, or interview.</li>
            <li>Scholarship eligibility (top 100 PGETA scorers, Rs 50,000 over 2 years) is institute-agnostic and disbursed via COA after M.Arch admission.</li>
            <li>State-level CETs (e.g., Maharashtra's M.Arch CET) may run in parallel; some students take both for maximum coverage.</li>
          </Box>
        </Paper>

        <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, bgcolor: 'rgba(220, 0, 78, 0.04)' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
            What if your score is borderline?
          </Typography>
          <Typography sx={{ lineHeight: 1.7 }}>
            A weak Test 1 score is not the end of the cycle. You still have two more attempts (June 14, June 28) and the system retains the best score. Use Test 1 to identify your weakest module, spend two weeks on it, then re-attempt. Many serious candidates improve by 8 to 15 percentile points across attempts.
          </Typography>
        </Paper>
      </Stack>
    </ExamSpokeLayout>
  );
}

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
    title: 'PGETA 2026 Eligibility (PGEAT): B.Arch with 50%, Final-Year Eligible, No Age Limit',
    description:
      'PGETA 2026 (also known as PGEAT) eligibility: Bachelor of Architecture from a COA-approved institute with at least 50% aggregate marks. Final-year B.Arch students can apply. No upper age limit.',
    keywords:
      'PGETA 2026 eligibility, PGEAT eligibility, M.Arch entrance eligibility, COA M.Arch eligibility, PGETA minimum marks, PGETA final year eligibility',
    alternates: buildAlternates(locale, '/pgeta-2026/eligibility'),
  };
}

export default function PgetaEligibilityPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);

  return (
    <ExamSpokeLayout
      examName="PGETA 2026"
      examShortName="PGETA 2026"
      examHubHref="/pgeta-2026"
      examColor="secondary"
      topicTitle="PGETA 2026 eligibility (also known as PGEAT)"
      topicSubtitle="The short answer: a B.Arch from a COA-approved institute with at least 50% aggregate marks. Final-year students may apply, contingent on passing their B.Arch."
      related={[
        { label: 'Schedule, 3 attempts', href: '/pgeta-2026/schedule' },
        { label: 'Exam pattern', href: '/pgeta-2026/exam-pattern' },
        { label: 'Fees + scholarship', href: '/pgeta-2026/fees' },
      ]}
    >
      <Stack spacing={3}>
        <Box>
          <Typography variant="h5" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
            Core eligibility rules
          </Typography>
          <Box component="ul" sx={{ pl: 3, m: 0, '& li': { mb: 1, lineHeight: 1.7 } }}>
            <li>Must hold a Bachelor of Architecture (B.Arch) degree from a COA-approved institution.</li>
            <li>Minimum 50% aggregate marks (or equivalent CGPA).</li>
            <li>Final-year B.Arch students are eligible to apply, with admission contingent on passing their B.Arch.</li>
            <li>No upper age limit.</li>
            <li>COA registration is recommended for practising architects but not strictly required to attempt PGETA.</li>
          </Box>
        </Box>

        <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
            How to verify your B.Arch is COA-approved
          </Typography>
          <Box component="ul" sx={{ pl: 3, m: 0, '& li': { mb: 0.75, lineHeight: 1.7 } }}>
            <li>Check the COA approved-institutions list at coa.gov.in.</li>
            <li>If your college is listed and the program ran while you were enrolled, you are covered.</li>
            <li>Programs that lost approval mid-batch are typically grandfathered for already-enrolled students; contact COA for clarification.</li>
          </Box>
        </Paper>

        <Box>
          <Typography variant="h5" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
            Final-year applicant rules
          </Typography>
          <Typography sx={{ lineHeight: 1.8, color: 'text.primary' }}>
            If you are in the final year of B.Arch (typically 5th year, 9th and 10th semesters), you may register and appear for PGETA 2026. The score is held provisionally; admission to your chosen M.Arch program activates only after you produce your B.Arch degree certificate (or final-year mark sheet meeting the 50% threshold) by the institutional deadline. Failing to graduate by the cut-off forfeits the seat.
          </Typography>
        </Box>

        <Box>
          <Typography variant="h5" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
            What if your B.Arch percentage is below 50%?
          </Typography>
          <Typography sx={{ lineHeight: 1.8, color: 'text.primary' }}>
            You are not eligible for PGETA 2026. A small number of institutions accept M.Arch candidates with lower B.Arch percentages via management quota or institution-specific tests, but the centralised PGETA route is closed below 50%. Some candidates retake one or two B.Arch papers to push their aggregate above the threshold; check your university's improvement-exam rules.
          </Typography>
        </Box>
      </Stack>
    </ExamSpokeLayout>
  );
}

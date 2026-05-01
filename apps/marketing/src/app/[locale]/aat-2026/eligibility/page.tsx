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
    title: 'AAT 2026 Eligibility: Who can appear, JEE Advanced requirement, Class XII norms',
    description:
      'AAT 2026 eligibility rules: must qualify JEE (Advanced) 2026, Class XII performance norms apply (Clause 26), no separate eligibility check, no age limit beyond JEE Advanced. PwD provisions covered.',
    keywords:
      'AAT 2026 eligibility, AAT eligibility criteria, AAT JEE Advanced requirement, who can give AAT, AAT minimum marks, AAT age limit',
    alternates: buildAlternates(locale, '/aat-2026/eligibility'),
  };
}

export default function AatEligibilityPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);

  return (
    <ExamSpokeLayout
      examName="AAT 2026"
      examShortName="AAT 2026"
      examHubHref="/aat-2026"
      topicTitle="AAT 2026 eligibility, who can appear?"
      topicSubtitle="The short answer: only candidates who have qualified JEE (Advanced) 2026 are eligible to appear in AAT 2026."
      related={[
        { label: 'AAT 2026 schedule', href: '/aat-2026/schedule' },
        { label: 'Exam pattern', href: '/aat-2026/exam-pattern' },
        { label: 'Drawing kit', href: '/aat-2026/drawing-kit' },
      ]}
    >
      <Stack spacing={3}>
        <Box>
          <Typography variant="h5" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
            Single eligibility rule
          </Typography>
          <Typography sx={{ lineHeight: 1.8, color: 'text.primary' }}>
            AAT does not have any standalone eligibility criterion. The qualifying gate is JEE (Advanced) 2026 itself. Once you have a Pass status in JEE (Advanced) 2026, you become eligible to register for AAT through the same JEE (Advanced) portal during the 48-hour registration window.
          </Typography>
        </Box>

        <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
            Detailed eligibility checklist
          </Typography>
          <Box component="ul" sx={{ pl: 3, m: 0, '& li': { mb: 1, lineHeight: 1.7 } }}>
            <li>You must appear and qualify in JEE (Advanced) 2026.</li>
            <li>Class XII (or equivalent) performance norms in Clause 26 of the JEE (Advanced) 2026 brochure continue to apply for B.Arch admission.</li>
            <li>No separate AAT cut-off marks are pre-announced. The Joint Implementation Committee fixes the AAT pass cut-off after the test.</li>
            <li>There is no age limit beyond what JEE (Advanced) requires.</li>
            <li>The candidate must be the same person who appeared in JEE (Advanced); transfer of candidature is not permitted.</li>
            <li>You register separately for AAT on jeeadv.ac.in within the registration window. There is no auto-enrolment.</li>
          </Box>
        </Paper>

        <Box>
          <Typography variant="h5" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
            Class XII performance norms (Clause 26 summary)
          </Typography>
          <Typography sx={{ lineHeight: 1.8, color: 'text.primary' }}>
            For B.Arch admission at the participating IITs, the candidate must satisfy one of these Class XII conditions: at least 75% aggregate marks in the Class XII (or equivalent) Board examination (65% for SC, ST, and PwD candidates), or rank within the category-wise top 20 percentile of successful candidates in their respective Class XII (or equivalent) Board. Mathematics, Physics, and Chemistry must be present as subjects.
          </Typography>
        </Box>

        <Box>
          <Typography variant="h5" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
            PwD eligibility
          </Typography>
          <Typography sx={{ lineHeight: 1.8, color: 'text.primary' }}>
            PwD candidates with at least 40% impairment under the RPwD Act 2016 are eligible for one hour of compensatory time (4-hour AAT). Candidates with less than 40% disability covered under Section 2(s) of the RPwD Act, but not under Section 2(r), are also eligible for compensatory time. Both groups can request scribe services. The certificate format is in Annexure-II of the JEE (Advanced) 2026 brochure and must be submitted during JEE Advanced registration, not at the AAT centre.
          </Typography>
        </Box>

        <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, bgcolor: 'rgba(33, 150, 243, 0.04)' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
            What if you do not qualify JEE Advanced?
          </Typography>
          <Typography sx={{ lineHeight: 1.7 }}>
            B.Arch at the three participating IITs is closed to you that year. You can still pursue B.Arch through NATA (most COA-approved colleges) or JEE Main Paper 2A (NITs, SPAs, IIITs). Many students plan for both NATA and JEE in parallel to keep options open.
          </Typography>
        </Paper>
      </Stack>
    </ExamSpokeLayout>
  );
}

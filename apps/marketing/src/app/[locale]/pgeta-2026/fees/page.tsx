import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Typography, Box, Stack, Paper, Grid } from '@neram/ui';
import ExamSpokeLayout from '@/components/exam-hub/sections/ExamSpokeLayout';
import { buildAlternates } from '@/lib/seo/metadata';
import { PGETA_FEES, PGETA_SCHOLARSHIP } from '@/components/pgeta/data/pgetaContent';

export const revalidate = 3600;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'PGETA 2026 Fees and Scholarships: Rs 1,750 to Rs 1,000 per Attempt',
    description:
      'PGETA 2026 registration fee: Rs 1,750 (General/OBC), Rs 1,250 (SC/ST/EWS/PwD), Rs 1,000 (Transgender). COA awards a Rs 50,000 scholarship over two years to top-100 scorers admitted to COA-approved M.Arch programs.',
    keywords:
      'PGETA fees, PGEAT fees, PGETA registration fee, PGETA scholarship, COA M.Arch scholarship, top 100 PGETA',
    alternates: buildAlternates(locale, '/pgeta-2026/fees'),
  };
}

export default function PgetaFeesPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);

  return (
    <ExamSpokeLayout
      examName="PGETA 2026"
      examShortName="PGETA 2026"
      examHubHref="/pgeta-2026"
      examColor="secondary"
      topicTitle="PGETA 2026 fees and scholarships"
      topicSubtitle="Per-attempt fees vary by category. Each of the three test dates needs a separate registration. COA also funds a top-100 scholarship for admitted candidates."
      related={[
        { label: 'Schedule', href: '/pgeta-2026/schedule' },
        { label: 'Eligibility', href: '/pgeta-2026/eligibility' },
        { label: 'Participating institutes', href: '/pgeta-2026/participating-institutes' },
      ]}
    >
      <Stack spacing={3}>
        <Box>
          <Typography variant="h5" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
            Registration fees, per attempt
          </Typography>
          <Stack spacing={1.5}>
            {PGETA_FEES.map((fee) => (
              <Paper
                key={fee.category}
                elevation={0}
                sx={{
                  p: 2.25,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                  display: 'flex',
                  flexDirection: { xs: 'column', sm: 'row' },
                  gap: { xs: 0.5, sm: 2 },
                  alignItems: { xs: 'flex-start', sm: 'center' },
                }}
              >
                <Typography sx={{ flex: 1, fontWeight: 600 }}>{fee.category}</Typography>
                <Typography sx={{ fontWeight: 700, fontSize: '1.05rem', color: 'secondary.main' }}>
                  {fee.amount}
                </Typography>
              </Paper>
            ))}
          </Stack>
          <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: 'text.secondary' }}>
            Payment online via debit card, credit card, or net banking. Each of the three test dates requires a separate fee.
          </Typography>
        </Box>

        <Paper elevation={0} sx={{ p: 3, borderRadius: 2, bgcolor: 'rgba(46, 125, 50, 0.06)', border: '1px solid', borderColor: 'success.light' }}>
          <Typography variant="overline" sx={{ color: 'success.dark', fontWeight: 700 }}>
            Scholarship
          </Typography>
          <Typography variant="h5" component="h2" sx={{ fontWeight: 700, color: 'success.dark', mb: 0.5 }}>
            {PGETA_SCHOLARSHIP.title}
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 800, color: 'success.dark', mb: 1.5 }}>
            {PGETA_SCHOLARSHIP.amount}
          </Typography>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
            Conditions
          </Typography>
          <Box component="ul" sx={{ pl: 2.5, m: 0, '& li': { mb: 0.75, lineHeight: 1.7 } }}>
            {PGETA_SCHOLARSHIP.conditions.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </Box>
        </Paper>

        <Box>
          <Typography variant="h5" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
            Total cost planning
          </Typography>
          <Box component="ul" sx={{ pl: 3, m: 0, '& li': { mb: 1, lineHeight: 1.7 } }}>
            <li>One attempt at General/OBC fee: Rs 1,750.</li>
            <li>Three attempts (recommended for serious candidates): up to Rs 5,250 in fees.</li>
            <li>Add travel and accommodation if your CBT centre is in another city.</li>
            <li>Top-100 scholarship offsets two years of M.Arch tuition for high scorers.</li>
            <li>Many M.Arch programs also offer institution-level merit waivers; check each shortlisted college.</li>
          </Box>
        </Box>
      </Stack>
    </ExamSpokeLayout>
  );
}

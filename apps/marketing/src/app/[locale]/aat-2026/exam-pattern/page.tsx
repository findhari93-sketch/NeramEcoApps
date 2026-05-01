import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Typography, Box, Stack, Paper, Grid } from '@neram/ui';
import ExamSpokeLayout from '@/components/exam-hub/sections/ExamSpokeLayout';
import { buildAlternates } from '@/lib/seo/metadata';

export const revalidate = 3600;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'AAT 2026 Exam Pattern: 3-Hour Offline, English, Pass or Fail',
    description:
      'AAT 2026 exam pattern: one offline pen-and-paper test of 3 hours, English-only question paper, no separate sectional weights, result is Pass or Fail (no marks, no rank). Cut-off decided by the Joint Implementation Committee.',
    keywords:
      'AAT 2026 exam pattern, AAT marking scheme, AAT online or offline, AAT total marks, AAT duration, AAT pass mark, AAT cut-off',
    alternates: buildAlternates(locale, '/aat-2026/exam-pattern'),
  };
}

export default function AatExamPatternPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);

  const facts = [
    { label: 'Mode', value: 'Offline, pen and paper' },
    { label: 'Duration', value: '3 hours (4 hours for eligible PwD candidates)' },
    { label: 'Language', value: 'English only' },
    { label: 'Negative marking', value: 'Not applicable, evaluation is qualitative' },
    { label: 'Result format', value: 'Pass or Fail (no marks, no rank)' },
    { label: 'Cut-off authority', value: 'Joint Implementation Committee, JEE (Advanced) 2026' },
  ];

  return (
    <ExamSpokeLayout
      examName="AAT 2026"
      examShortName="AAT 2026"
      examHubHref="/aat-2026"
      topicTitle="AAT 2026 exam pattern"
      topicSubtitle="The short answer: one offline pen-and-paper test of 3 hours, English only, Pass/Fail result. No marks, percentile, or AAT rank is published."
      related={[
        { label: 'Syllabus', href: '/aat-2026/syllabus' },
        { label: 'Drawing kit', href: '/aat-2026/drawing-kit' },
        { label: 'Schedule', href: '/aat-2026/schedule' },
      ]}
    >
      <Stack spacing={3}>
        <Box>
          <Typography variant="h5" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
            Exam at a glance
          </Typography>
          <Grid container spacing={2}>
            {facts.map((f) => (
              <Grid item xs={12} sm={6} key={f.label}>
                <Paper elevation={0} sx={{ p: 2.25, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="caption" sx={{ textTransform: 'uppercase', letterSpacing: 1, color: 'text.secondary', fontWeight: 600 }}>
                    {f.label}
                  </Typography>
                  <Typography sx={{ fontWeight: 600, mt: 0.5 }}>{f.value}</Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Box>

        <Box>
          <Typography variant="h5" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
            How AAT is evaluated
          </Typography>
          <Typography sx={{ lineHeight: 1.8, color: 'text.primary' }}>
            AAT is a qualitative test. JEE (Advanced) does not publish a numerical marking scheme or sectional weights. After the test, the Joint Implementation Committee evaluates each candidate's overall performance across the five syllabus areas and decides a Pass/Fail status. There is no AAT marksheet, no percentile, and no separate rank.
          </Typography>
        </Box>

        <Box>
          <Typography variant="h5" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
            What this means in practice
          </Typography>
          <Box component="ul" sx={{ pl: 3, m: 0, '& li': { mb: 1, lineHeight: 1.7 } }}>
            <li>You cannot trade strength in one section against weakness in another. Demonstrate competence across all five areas.</li>
            <li>Speed matters: 3 hours for a typical 16-question paper means roughly 11 minutes per question. Sketch quickly, refine selectively.</li>
            <li>Sketch quality matters less than spatial accuracy and design judgment. Photorealism is not the goal.</li>
            <li>Architectural awareness, often under-prepared, can be the deciding signal between two evenly-skilled candidates.</li>
            <li>If you Pass, your B.Arch seat at IIT Roorkee, IIT Kharagpur, or IIT (BHU) Varanasi depends on JEE (Advanced) 2026 All India Rank. If you Fail, no IIT B.Arch seat is allotted that year.</li>
          </Box>
        </Box>

        <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, bgcolor: 'rgba(33, 150, 243, 0.04)' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
            Compared to NATA
          </Typography>
          <Typography sx={{ lineHeight: 1.7 }}>
            NATA is partly online (MCQ/NCQ) and partly offline (Drawing), publishes per-section marks, and gives a percentile. AAT is fully offline, has no published marking scheme, and gives only a Pass/Fail. Both end up testing similar drawing and design fundamentals; AAT additionally weights architectural awareness, while NATA leans more on aptitude reasoning.
          </Typography>
        </Paper>
      </Stack>
    </ExamSpokeLayout>
  );
}

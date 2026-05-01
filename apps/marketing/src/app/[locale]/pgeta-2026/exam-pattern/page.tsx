import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Typography, Box, Stack, Paper, Grid, Chip } from '@neram/ui';
import ExamSpokeLayout from '@/components/exam-hub/sections/ExamSpokeLayout';
import { buildAlternates } from '@/lib/seo/metadata';
import { PGETA_MODULES } from '@/components/pgeta/data/pgetaContent';

export const revalidate = 3600;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'PGETA 2026 Exam Pattern: 2-Hour CBT, 100 Questions, 4 Modules',
    description:
      'PGETA 2026 exam pattern: Computer-Based Test (CBT) of 2 hours, 100 questions across four modules: Architecture and Design (64 Q), Building Sciences (14 Q), Professional Electives (6 Q), Skill Enhancement (16 Q). English only.',
    keywords:
      'PGETA exam pattern, PGEAT exam pattern, PGETA modules, PGETA marking scheme, PGETA CBT, PGETA total questions, PGETA duration',
    alternates: buildAlternates(locale, '/pgeta-2026/exam-pattern'),
  };
}

export default function PgetaExamPatternPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);

  return (
    <ExamSpokeLayout
      examName="PGETA 2026"
      examShortName="PGETA 2026"
      examHubHref="/pgeta-2026"
      examColor="secondary"
      topicTitle="PGETA 2026 exam pattern, 4 modules across 100 questions"
      topicSubtitle="Computer-Based Test, 2 hours, 100 questions in English. Architecture and Design carries 64 of 100 questions; the rest cover engineering, electives, and research aptitude."
      related={[
        { label: 'Syllabus', href: '/pgeta-2026/syllabus' },
        { label: 'Schedule', href: '/pgeta-2026/schedule' },
        { label: 'Preparation', href: '/pgeta-2026/preparation' },
      ]}
    >
      <Stack spacing={3}>
        <Grid container spacing={2}>
          {PGETA_MODULES.map((mod, idx) => (
            <Grid item xs={12} key={mod.title}>
              <Paper
                elevation={0}
                sx={{
                  p: 3,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderLeft: '4px solid',
                  borderLeftColor: 'secondary.main',
                }}
              >
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="overline" sx={{ color: 'secondary.main', fontWeight: 700 }}>
                    Module {idx + 1}
                  </Typography>
                  <Chip label={`${mod.questions} Q`} size="small" sx={{ fontWeight: 700 }} />
                </Stack>
                <Typography variant="h5" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
                  {mod.title}
                </Typography>
                <Typography sx={{ lineHeight: 1.8, color: 'text.primary' }}>
                  {mod.summary}
                </Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>

        <Box>
          <Typography variant="h5" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
            Format and timing
          </Typography>
          <Box component="ul" sx={{ pl: 3, m: 0, '& li': { mb: 1, lineHeight: 1.7 } }}>
            <li>Mode: Computer-Based Test at designated centres. Not a from-home online test.</li>
            <li>Duration: 2 hours (120 minutes), 10:00 AM to 12:00 PM IST.</li>
            <li>Total questions: 100. With 120 minutes, that is roughly 72 seconds per question on average.</li>
            <li>Language: English only.</li>
            <li>Marking scheme details (negative marking, marks per question) are published in the official PGETA Information Brochure on the COA portal. Verify the brochure before exam day.</li>
          </Box>
        </Box>

        <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, bgcolor: 'rgba(220, 0, 78, 0.04)' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
            Where to spend time
          </Typography>
          <Typography sx={{ lineHeight: 1.7 }}>
            Module 1, Architecture and Design, is 64% of the paper. Allocate at least 75 of the 120 minutes to it. Module 4 (Skill Enhancement) and Module 2 (Building Sciences) are next-priority. Module 3 (Professional Electives) is the smallest, plan to clear it in 8 to 10 minutes if your specialisation aligns.
          </Typography>
        </Paper>
      </Stack>
    </ExamSpokeLayout>
  );
}

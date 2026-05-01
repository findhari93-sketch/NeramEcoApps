import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Typography, Box, Stack, Paper, Chip, Grid } from '@neram/ui';
import ExamSpokeLayout from '@/components/exam-hub/sections/ExamSpokeLayout';
import { buildAlternates } from '@/lib/seo/metadata';
import { AAT_SYLLABUS } from '@/components/aat/data/aatContent';

export const revalidate = 3600;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'AAT 2026 Syllabus: 5 Sections, Freehand to Architectural Awareness',
    description:
      'Complete AAT 2026 syllabus: Freehand Drawing, Geometrical Drawing, 3D Perception, Imagination & Aesthetic Sensitivity, Architectural Awareness. Faithful breakdown with skills tested per section. Source: jeeadv.ac.in/documents/aat-syllabus.pdf.',
    keywords:
      'AAT 2026 syllabus, AAT syllabus PDF, AAT freehand drawing, AAT geometrical drawing, AAT 3D perception, architectural awareness syllabus, AAT topics',
    alternates: buildAlternates(locale, '/aat-2026/syllabus'),
  };
}

export default function AatSyllabusPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);

  return (
    <ExamSpokeLayout
      examName="AAT 2026"
      examShortName="AAT 2026"
      examHubHref="/aat-2026"
      topicTitle="AAT 2026 syllabus, the 5 sections explained"
      topicSubtitle="The official syllabus is published at jeeadv.ac.in/documents/aat-syllabus.pdf. Below is a faithful breakdown of each section with the skills it tests and what to practice."
      related={[
        { label: 'Exam pattern', href: '/aat-2026/exam-pattern' },
        { label: 'Drawing kit', href: '/aat-2026/drawing-kit' },
        { label: 'Preparation tips', href: '/aat-2026/preparation' },
      ]}
    >
      <Stack spacing={3}>
        <Typography sx={{ lineHeight: 1.8, color: 'text.primary' }}>
          AAT covers five areas drawn from the practice of architecture: drawing skill (freehand and instrumental), spatial reasoning, creative imagination, and exposure to architectural history. The exam does not publish per-section weights; the candidate is expected to demonstrate competence across all five.
        </Typography>

        <Grid container spacing={2}>
          {AAT_SYLLABUS.map((section, idx) => (
            <Grid item xs={12} key={section.title}>
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
                <Typography variant="overline" sx={{ color: 'primary.main', fontWeight: 700 }}>
                  Section {idx + 1}
                </Typography>
                <Typography variant="h5" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
                  {section.title}
                </Typography>
                <Typography sx={{ lineHeight: 1.8, color: 'text.primary', mb: 2 }}>
                  {section.summary}
                </Typography>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  Skills tested
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {section.skills.map((skill) => (
                    <Chip key={skill} label={skill} size="small" variant="outlined" sx={{ mb: 0.5 }} />
                  ))}
                </Stack>
              </Paper>
            </Grid>
          ))}
        </Grid>

        <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, bgcolor: 'rgba(33, 150, 243, 0.04)' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
            Practical preparation focus
          </Typography>
          <Box component="ul" sx={{ pl: 3, m: 0, '& li': { mb: 0.75, lineHeight: 1.7 } }}>
            <li>Sketch everyday objects from memory: cycle, water bottle, chair, kettle. 5 to 10 minutes per object.</li>
            <li>Draw plans, elevations, and isometric views of cubes, cones, and stairs using your geometry box.</li>
            <li>Practice mental rotation puzzles to strengthen 3D visualisation.</li>
            <li>Read about 30 to 50 famous buildings (Indian and global) and the architects behind them.</li>
            <li>Time yourself: 16 questions in 3 hours means roughly 11 minutes per question.</li>
          </Box>
        </Paper>
      </Stack>
    </ExamSpokeLayout>
  );
}

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
    title: 'PGETA 2026 Preparation Strategy: Books, Mock Tests, 12-Week Plan',
    description:
      'PGETA 2026 preparation: 12-week plan covering architectural theory, building science, urban design, and research aptitude. Recommended books, mock test platforms, and exam-day timing strategy for the 100-question CBT.',
    keywords:
      'PGETA preparation, PGEAT preparation, M.Arch entrance preparation, PGETA books, PGETA mock tests, PGETA study plan',
    alternates: buildAlternates(locale, '/pgeta-2026/preparation'),
  };
}

export default function PgetaPreparationPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);

  return (
    <ExamSpokeLayout
      examName="PGETA 2026"
      examShortName="PGETA 2026"
      examHubHref="/pgeta-2026"
      examColor="secondary"
      topicTitle="PGETA 2026 preparation strategy"
      topicSubtitle="A focused 12-week plan, anchored to the 4-module exam pattern. Use the three-attempt structure to your advantage: diagnose with Test 1, refine for Test 2 and Test 3."
      related={[
        { label: 'Syllabus', href: '/pgeta-2026/syllabus' },
        { label: 'Exam pattern', href: '/pgeta-2026/exam-pattern' },
        { label: 'Schedule', href: '/pgeta-2026/schedule' },
      ]}
    >
      <Stack spacing={3}>
        <Box>
          <Typography variant="h5" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
            12-week preparation plan
          </Typography>
          <Stack spacing={2}>
            {[
              {
                weeks: 'Weeks 1-4: Architecture and Design (largest module)',
                items: [
                  'Architectural history: classical to contemporary, Indian and global.',
                  'Architectural theory: form, function, ornament, postmodern critique.',
                  'Urban design fundamentals: Lynch, Gehl, Jacobs.',
                  'One book per week. Start with Frampton, A Modern Architecture: A Critical History.',
                ],
              },
              {
                weeks: 'Weeks 5-7: Building Sciences and Applied Engineering',
                items: [
                  'Structural systems and materials, climate-responsive design.',
                  'Building services: HVAC, plumbing, electrical fundamentals.',
                  'Green building rating systems: LEED, GRIHA, IGBC.',
                ],
              },
              {
                weeks: 'Weeks 8-9: Professional Electives and Skill Enhancement',
                items: [
                  'Read up on your target M.Arch specialisation.',
                  'Research methodology: qualitative vs quantitative, citation styles.',
                  'Architect Act 1972, COA code of conduct, RERA basics.',
                ],
              },
              {
                weeks: 'Weeks 10-12: Mock tests and refinement',
                items: [
                  'Take Test 1 (May 31) as a real-conditions diagnostic.',
                  'Identify weakest module by score breakdown; refine over 2 weeks.',
                  'Take Test 2 (June 14). Refine again. Take Test 3 (June 28) for the best score.',
                ],
              },
            ].map((phase) => (
              <Paper key={phase.weeks} variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'secondary.main', mb: 1 }}>
                  {phase.weeks}
                </Typography>
                <Box component="ul" sx={{ pl: 2.5, m: 0, '& li': { mb: 0.75, lineHeight: 1.7 } }}>
                  {phase.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </Box>
              </Paper>
            ))}
          </Stack>
        </Box>

        <Box>
          <Typography variant="h5" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
            Recommended reading
          </Typography>
          <Box component="ul" sx={{ pl: 3, m: 0, '& li': { mb: 1, lineHeight: 1.7 } }}>
            <li>Kenneth Frampton, A Modern Architecture: A Critical History.</li>
            <li>Francis D.K. Ching, Architecture: Form, Space, and Order.</li>
            <li>Spiro Kostof, A History of Architecture: Settings and Rituals.</li>
            <li>Edward T. White, Site Analysis.</li>
            <li>National Building Code of India (NBC), latest edition.</li>
            <li>Architectural journals: Journal of the Indian Institute of Architects, Architectural Review, Architectural Record.</li>
          </Box>
        </Box>

        <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
            Exam-day timing strategy
          </Typography>
          <Box component="ul" sx={{ pl: 3, m: 0, '& li': { mb: 0.75, lineHeight: 1.7 } }}>
            <li>Module 1 (64 Q): allocate ~75 minutes. About 70 seconds per question.</li>
            <li>Module 4 (16 Q): ~18 minutes.</li>
            <li>Module 2 (14 Q): ~16 minutes.</li>
            <li>Module 3 (6 Q): ~8 minutes if your specialisation is well-prepared, mark-and-skip otherwise.</li>
            <li>Reserve the final 5 minutes for review and flagged questions.</li>
            <li>Skip-and-return is your friend in CBT. Do not lose 4 minutes on a single tricky question early.</li>
          </Box>
        </Paper>
      </Stack>
    </ExamSpokeLayout>
  );
}

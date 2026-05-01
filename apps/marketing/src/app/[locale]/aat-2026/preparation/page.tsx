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
    title: 'AAT 2026 Preparation Strategy: 12-Week Plan, Drawing Practice, Architectural Awareness',
    description:
      'Realistic AAT 2026 preparation plan starting from JEE Advanced. Daily drawing practice, geometrical projection drills, 3D visualisation puzzles, architectural awareness reading list. The 48-hour registration window means you prepare before, not after, JEE Advanced results.',
    keywords:
      'AAT 2026 preparation, how to prepare for AAT, AAT preparation tips, AAT study plan, AAT drawing practice, architectural awareness for AAT',
    alternates: buildAlternates(locale, '/aat-2026/preparation'),
  };
}

export default function AatPreparationPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);

  return (
    <ExamSpokeLayout
      examName="AAT 2026"
      examShortName="AAT 2026"
      examHubHref="/aat-2026"
      topicTitle="AAT 2026 preparation strategy"
      topicSubtitle="The realistic preparation horizon for AAT is the weeks before JEE Advanced. The 48-hour registration window after results leaves no time for fresh skill-building. Plan early."
      related={[
        { label: 'Syllabus breakdown', href: '/aat-2026/syllabus' },
        { label: 'Drawing kit', href: '/aat-2026/drawing-kit' },
        { label: 'Exam pattern', href: '/aat-2026/exam-pattern' },
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
                weeks: 'Weeks 1-4: Foundation',
                items: [
                  'Daily 30-minute freehand sketching of common objects (cycle, water bottle, chair, tap, kettle).',
                  'Build proportion sense: practice scaling without measuring.',
                  'Geometrical drawing fundamentals: lines, circles, polygons, set-square work.',
                ],
              },
              {
                weeks: 'Weeks 5-8: Spatial reasoning',
                items: [
                  'Plan and elevation conversions: given a 3D form, draw top, front, side views.',
                  'Isometric projection drills: cubes, stairs, ramps, splayed surfaces.',
                  'Mental rotation puzzles, 15 to 20 minutes daily.',
                ],
              },
              {
                weeks: 'Weeks 9-11: Imagination + awareness',
                items: [
                  'Compose imaginary scenarios: a market stall, a park bench at sunset, a temple entrance.',
                  'Read 30 to 50 famous buildings (Indian and global) and the architects behind them. Le Corbusier, B.V. Doshi, Charles Correa, Zaha Hadid, Le Brun, Gaudi.',
                  'Practice colour application using only colour pencils, no wet media.',
                ],
              },
              {
                weeks: 'Week 12: Mock papers',
                items: [
                  'Two timed full-length mock papers per week, 3 hours each.',
                  'Self-evaluate against the 5 syllabus areas, identify weakest area.',
                  'Refine your kit: which pencil grades, which colour set, which sharpener.',
                ],
              },
            ].map((phase) => (
              <Paper key={phase.weeks} variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'primary.main', mb: 1 }}>
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
            Architectural awareness reading list
          </Typography>
          <Typography sx={{ lineHeight: 1.8, color: 'text.primary', mb: 2 }}>
            Architectural awareness is the single most under-prepared section. Build a working memory of 50 to 80 buildings and 20 to 30 architects. Recognise styles (Gothic, Brutalist, Deconstructivist, Vernacular) and movements.
          </Typography>
          <Box component="ul" sx={{ pl: 3, m: 0, '& li': { mb: 1, lineHeight: 1.7 } }}>
            <li>Indian architects: B.V. Doshi (IIM Bangalore), Charles Correa (Kanchanjunga, MIT Jaipur), Laurie Baker (Trivandrum), Raj Rewal (Permanent Exhibition Complex), Geoffrey Bawa.</li>
            <li>Global architects: Le Corbusier (Chandigarh, Villa Savoye), Frank Lloyd Wright (Fallingwater), Mies van der Rohe (Barcelona Pavilion), Zaha Hadid (Heydar Aliyev Center), Tadao Ando.</li>
            <li>Iconic buildings: Taj Mahal, Lotus Temple, Sydney Opera House, Burj Khalifa, Pompidou Centre, Sagrada Familia, Fatehpur Sikri.</li>
            <li>Movements: Modernism, Brutalism, Postmodernism, Sustainable / Vernacular architecture.</li>
            <li>One book per fortnight: ArchDaily articles, RIBA Journal, Architectural Review, or Indian Architect & Builder.</li>
          </Box>
        </Box>

        <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, bgcolor: 'rgba(33, 150, 243, 0.04)' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
            Two days after JEE Advanced results
          </Typography>
          <Typography sx={{ lineHeight: 1.7 }}>
            Once results are out and you qualify, the only useful work is logistics: register on the AAT portal within 48 hours, finalise your drawing kit, confirm travel and accommodation near your allotted IIT centre, and run a timed mock to recalibrate. Do not attempt to learn new skills; trust the months of preparation.
          </Typography>
        </Paper>
      </Stack>
    </ExamSpokeLayout>
  );
}

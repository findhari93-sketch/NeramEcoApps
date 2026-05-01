import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Typography, Box, Stack, Paper, Grid } from '@neram/ui';
import ExamSpokeLayout from '@/components/exam-hub/sections/ExamSpokeLayout';
import { buildAlternates } from '@/lib/seo/metadata';
import { AAT_DRAWING_KIT } from '@/components/aat/data/aatContent';

export const revalidate = 3600;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'AAT 2026 Drawing Kit Checklist: What to Bring, What to Avoid',
    description:
      'Pack your AAT 2026 drawing kit the night before. Pencils (HB to 2B), sharpener, soft erasers, geometry box, ruler, colour pencils. Avoid wet paints, mobile phones, calculators. Plus admit card and ID requirements.',
    keywords:
      'AAT drawing kit, AAT exam materials, AAT what to bring, AAT pencils, AAT geometry box, AAT colouring aids',
    alternates: buildAlternates(locale, '/aat-2026/drawing-kit'),
  };
}

export default function AatDrawingKitPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);

  return (
    <ExamSpokeLayout
      examName="AAT 2026"
      examShortName="AAT 2026"
      examHubHref="/aat-2026"
      topicTitle="AAT 2026 drawing kit checklist"
      topicSubtitle="Candidates must bring their own drawing and colouring aids. Pack the night before. The centre does not provide pencils, erasers, or instruments."
      related={[
        { label: 'Centres', href: '/aat-2026/centres' },
        { label: 'Schedule', href: '/aat-2026/schedule' },
        { label: 'Preparation tips', href: '/aat-2026/preparation' },
      ]}
    >
      <Stack spacing={3}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Paper elevation={0} sx={{ p: 3, borderRadius: 2, border: '1px solid', borderColor: 'success.light', height: '100%' }}>
              <Typography variant="h5" component="h2" sx={{ fontWeight: 700, color: 'success.dark', mb: 1.5 }}>
                Bring
              </Typography>
              <Box component="ul" sx={{ pl: 2.5, m: 0, '& li': { mb: 1, lineHeight: 1.7 } }}>
                {AAT_DRAWING_KIT.bring.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </Box>
            </Paper>
          </Grid>
          <Grid item xs={12} md={6}>
            <Paper elevation={0} sx={{ p: 3, borderRadius: 2, border: '1px solid', borderColor: 'error.light', height: '100%' }}>
              <Typography variant="h5" component="h2" sx={{ fontWeight: 700, color: 'error.dark', mb: 1.5 }}>
                Avoid
              </Typography>
              <Box component="ul" sx={{ pl: 2.5, m: 0, '& li': { mb: 1, lineHeight: 1.7 } }}>
                {AAT_DRAWING_KIT.avoid.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </Box>
            </Paper>
          </Grid>
        </Grid>

        <Box>
          <Typography variant="h5" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
            Why each item matters
          </Typography>
          <Stack spacing={2}>
            <Paper variant="outlined" sx={{ p: 2.25, borderRadius: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                Pencils HB to 2B
              </Typography>
              <Typography sx={{ lineHeight: 1.7, color: 'text.secondary' }}>
                HB for clean linework and structural drawing. 2B for shading and tonal range. Avoid darker grades like 4B or 6B; they smudge and reduce control. A 2H is useful for very fine guide lines you intend to erase later.
              </Typography>
            </Paper>
            <Paper variant="outlined" sx={{ p: 2.25, borderRadius: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                Geometry box
              </Typography>
              <Typography sx={{ lineHeight: 1.7, color: 'text.secondary' }}>
                Compass for circles and arcs, scales (15 cm and 30 cm), set squares (45° and 30/60), protractor. Geometrical Drawing section requires technical accuracy that is hard to achieve freehand.
              </Typography>
            </Paper>
            <Paper variant="outlined" sx={{ p: 2.25, borderRadius: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                Colouring aids
              </Typography>
              <Typography sx={{ lineHeight: 1.7, color: 'text.secondary' }}>
                Colour pencils or crayons only. Wet paints and watercolours risk smudging your answer sheet and the answer sheets near you. Stick to a small palette of 12 to 24 well-blended colours; speed of selection matters.
              </Typography>
            </Paper>
            <Paper variant="outlined" sx={{ p: 2.25, borderRadius: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                Admit card and ID
              </Typography>
              <Typography sx={{ lineHeight: 1.7, color: 'text.secondary' }}>
                The printed JEE (Advanced) 2026 admit card serves as the AAT admit card; no separate AAT admit card is issued. Carry a clean printout (not a phone screenshot) plus an original government photo ID. Without these, you will not be permitted to sit for AAT.
              </Typography>
            </Paper>
          </Stack>
        </Box>
      </Stack>
    </ExamSpokeLayout>
  );
}

import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import {
  Box,
  Paper,
  Typography,
  Stack,
  Chip,
} from '@mui/material';
import EventIcon from '@mui/icons-material/Event';
import { buildAlternates } from '@/lib/seo/metadata';
import { generateEventSchema } from '@/lib/seo/schemas';
import KeamSpokeShell from '@/components/keam-arch/KeamSpokeShell';
import { importantDates } from '@/data/keam-arch-2026';

export const revalidate = 86400;

const SPOKE = 'important-dates';
const PRIMARY_GREEN = '#0d7a4a';
const baseUrl = 'https://neramclasses.com';

const KEAM_PORTAL = { name: 'CEE Kerala Portal', url: 'https://cee.kerala.gov.in/keam2026/' };
const KEAM_ORGANIZER = {
  name: 'Office of the Commissioner for Entrance Examinations, Kerala',
  url: 'https://cee.kerala.gov.in',
};

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'KEAM B.Arch 2026 Important Dates: Application, Rank List, CAP Phases',
    description:
      'KEAM 2026 important dates: application opens 5 January, closes 31 January. Document upload 7 February. NATA score window, B.Arch rank list, and CAP allotment phase schedule, with prospectus clause references.',
    keywords:
      'KEAM 2026 dates, KEAM application close date, KEAM B.Arch rank list, CAP allotment dates, KEAM document upload deadline, cee.kerala.gov.in dates',
    alternates: buildAlternates(locale, `/counseling/keam-arch/${SPOKE}`),
  };
}

export default function ImportantDatesPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);

  const eventSchemas = importantDates
    .filter((d) => d.iso_date)
    .map((d) =>
      generateEventSchema({
        name: `KEAM B.Arch 2026: ${d.label}`,
        description: d.description,
        startDate: d.iso_date as string,
        url: `${baseUrl}/counseling/keam-arch/${SPOKE}`,
        defaultPortal: KEAM_PORTAL,
        organizer: KEAM_ORGANIZER,
        status: d.status === 'confirmed' ? 'EventScheduled' : 'EventPostponed',
      }),
    );

  return (
    <KeamSpokeShell
      locale={locale}
      spokeSlug={SPOKE}
      spokeChip="Important Dates"
      topicTitle="KEAM B.Arch 2026: Important Dates"
      topicSubtitle="Every milestone you need to track for KEAM 2026 architecture admission, with confirmation status and prospectus clause references."
      jsonLd={eventSchemas}
      related={[
        { label: 'Eligibility & Documents', href: 'eligibility-documents' },
        { label: 'How to Apply', href: 'how-to-apply' },
        { label: 'CAP Allotment Process', href: 'allotment-process' },
      ]}
      aintraSuggestions={[
        'When does application close?',
        'Last date for documents?',
        'When is the rank list?',
        'When does CAP start?',
      ]}
      prefillCallbackNotes="Need a clear KEAM B.Arch 2026 timeline"
    >
      <Stack spacing={2}>
        {importantDates.map((d) => (
          <Paper
            key={d.id}
            elevation={0}
            sx={{
              p: 2.25,
              borderRadius: 2,
              border: '1px solid',
              borderColor: d.status === 'confirmed' ? PRIMARY_GREEN : 'divider',
              bgcolor: d.status === 'confirmed' ? '#f0fdf4' : 'background.paper',
            }}
          >
            <Stack direction="row" gap={1.5} alignItems="flex-start">
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  bgcolor: d.status === 'confirmed' ? PRIMARY_GREEN : '#fef3c7',
                  color: d.status === 'confirmed' ? 'white' : '#92400e',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <EventIcon fontSize="small" />
              </Box>
              <Box flex={1} sx={{ minWidth: 0 }}>
                <Stack
                  direction="row"
                  gap={1}
                  alignItems="center"
                  flexWrap="wrap"
                  sx={{ mb: 0.5 }}
                >
                  <Typography variant="subtitle1" fontWeight={700}>
                    {d.label}
                  </Typography>
                  <Chip
                    label={d.status === 'confirmed' ? 'Confirmed' : 'Tentative'}
                    size="small"
                    sx={{
                      bgcolor: d.status === 'confirmed' ? '#dcfce7' : '#fef3c7',
                      color: d.status === 'confirmed' ? '#15803d' : '#92400e',
                      fontWeight: 600,
                    }}
                  />
                  <Chip
                    label={d.category}
                    size="small"
                    variant="outlined"
                    sx={{ textTransform: 'capitalize' }}
                  />
                </Stack>
                <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
                  {d.display_date}
                </Typography>
                {d.description && (
                  <Typography variant="body2" color="text.secondary">
                    {d.description}
                  </Typography>
                )}
                {d.clause_ref && (
                  <Typography
                    variant="caption"
                    sx={{ color: PRIMARY_GREEN, fontWeight: 600, mt: 0.5, display: 'block' }}
                  >
                    Source: {d.clause_ref}
                  </Typography>
                )}
              </Box>
            </Stack>
          </Paper>
        ))}
      </Stack>
    </KeamSpokeShell>
  );
}

import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import {
  Box,
  Paper,
  Typography,
  Stack,
  Chip,
  Alert,
} from '@mui/material';
import EventIcon from '@mui/icons-material/Event';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import { buildAlternates } from '@/lib/seo/metadata';
import { generateEventSchema } from '@/lib/seo/schemas';
import TneaSpokeShell from '@/components/tnea-barch/TneaSpokeShell';
import { importantDates } from '@/data/tnea-barch-2026';

const baseUrl = 'https://neramclasses.com';
const SPOKE = 'important-dates';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'TNEA B.Arch 2026 Important Dates: Registration, Counselling Schedule',
    description:
      'Complete TNEA B.Arch 2026 schedule: notification 03 May, registration close 20 June, certificate verification, rank list, 3 counselling rounds, and special-category rounds.',
    keywords:
      'TNEA B.Arch 2026 dates, TNEA registration deadline, TNEA counselling schedule, TNEA important dates 2026, TNEA notification date',
    alternates: buildAlternates(locale, `/counseling/tnea-barch/${SPOKE}`),
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
        name: `TNEA B.Arch 2026: ${d.label}`,
        description: d.description,
        startDate: d.iso_date as string,
        url: `${baseUrl}/counseling/tnea-barch/${SPOKE}`,
        attendanceMode: 'OnlineEventAttendanceMode',
      }),
    );

  const now = Date.now();
  const isPast = (d: typeof importantDates[number]) => {
    if (!d.iso_date) return false;
    return new Date(d.iso_date).getTime() < now;
  };

  return (
    <TneaSpokeShell
      locale={locale}
      spokeSlug={SPOKE}
      spokeChip="Schedule"
      topicTitle="TNEA B.Arch 2026 Important Dates"
      topicSubtitle="Tentative schedule for notification, registration, certificate verification, rank list, and counselling rounds. Watch this page for confirmed dates."
      jsonLd={eventSchemas}
      related={[
        { label: 'How to Apply', href: 'how-to-apply' },
        { label: 'Counselling Procedure', href: 'counselling-procedure' },
        { label: 'Eligibility & Documents', href: 'eligibility-documents' },
      ]}
      aintraSuggestions={[
        'When does TNEA registration open?',
        'Last date for certificate upload?',
        'Counselling round dates?',
        'When will the rank list come out?',
      ]}
    >
      <Alert severity="warning" sx={{ mb: 3, borderRadius: 1.5 }}>
        Most 2026 dates are tentative until the official notification is issued by the Directorate of Technical Education. Confirmed dates will be marked here.
      </Alert>

      <Box
        sx={{
          position: 'relative',
          pl: { xs: 3, md: 4 },
          '&:before': {
            content: '""',
            position: 'absolute',
            left: { xs: 9, md: 13 },
            top: 0,
            bottom: 0,
            width: 2,
            bgcolor: 'divider',
          },
        }}
      >
        <Stack spacing={2}>
          {importantDates.map((d) => {
            const past = isPast(d);
            return (
              <Box key={d.id} sx={{ position: 'relative' }}>
                <Box
                  sx={{
                    position: 'absolute',
                    left: { xs: -22, md: -28 },
                    top: 14,
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    bgcolor: past ? 'success.main' : d.status === 'confirmed' ? 'primary.main' : 'warning.light',
                    border: '3px solid',
                    borderColor: 'background.paper',
                    boxShadow: '0 0 0 2px',
                    color: past ? 'success.main' : d.status === 'confirmed' ? 'primary.main' : 'warning.light',
                  }}
                />
                <Paper
                  elevation={0}
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1} flexWrap="wrap">
                    <Box>
                      <Typography variant="subtitle1" fontWeight={700}>
                        {d.label}
                      </Typography>
                      <Stack direction="row" gap={0.75} alignItems="center" sx={{ mt: 0.5 }}>
                        <EventIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                        <Typography variant="body2" color="text.secondary">
                          {d.display_date}
                        </Typography>
                      </Stack>
                    </Box>
                    {past ? (
                      <Chip
                        size="small"
                        icon={<CheckCircleIcon sx={{ fontSize: 14 }} />}
                        label="Done"
                        color="success"
                        variant="outlined"
                      />
                    ) : d.status === 'confirmed' ? (
                      <Chip size="small" label="Confirmed" color="primary" variant="outlined" />
                    ) : (
                      <Chip
                        size="small"
                        icon={<HourglassEmptyIcon sx={{ fontSize: 14 }} />}
                        label="Tentative"
                        color="warning"
                        variant="outlined"
                      />
                    )}
                  </Stack>
                  {d.description && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      {d.description}
                    </Typography>
                  )}
                </Paper>
              </Box>
            );
          })}
        </Stack>
      </Box>
    </TneaSpokeShell>
  );
}

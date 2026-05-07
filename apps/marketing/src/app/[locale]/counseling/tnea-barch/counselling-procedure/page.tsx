import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import {
  Box,
  Paper,
  Typography,
  Stack,
  Chip,
  Alert,
  Divider,
} from '@mui/material';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { buildAlternates } from '@/lib/seo/metadata';
import { generateHowToSchema } from '@/lib/seo/schemas';
import TneaSpokeShell from '@/components/tnea-barch/TneaSpokeShell';
import { counselling } from '@/data/tnea-barch-2026';

const baseUrl = 'https://neramclasses.com';
const SPOKE = 'counselling-procedure';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'TNEA B.Arch 2026 Counselling Procedure: 3 Rounds, 6 Confirmation Options',
    description:
      'How TNEA B.Arch counselling works: 3 online rounds, 4 stages each (choice filling, allotment, confirmation, reporting), and the 6 options when a seat is allotted.',
    keywords:
      'TNEA counselling procedure 2026, TNEA 3 rounds, TNEA confirmation options, TNEA upward movement, TNEA choice filling, TNEA allotment',
    alternates: buildAlternates(locale, `/counseling/tnea-barch/${SPOKE}`),
  };
}

export default function CounsellingProcedurePage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);

  const howToSchema = generateHowToSchema({
    name: 'TNEA B.Arch 2026 Counselling Procedure',
    description: 'Step-by-step: how to participate in the 3-round online TNEA B.Arch counselling.',
    totalTime: 'P30D',
    steps: counselling.stages_per_round.map((s) => ({
      name: s.name,
      text: `${s.description} (${s.duration})`,
    })),
  });

  return (
    <TneaSpokeShell
      locale={locale}
      spokeSlug={SPOKE}
      spokeChip="Counselling"
      topicTitle="Counselling Procedure"
      topicSubtitle="3 online rounds. Each round has 4 stages. When a seat is allotted, you have 6 confirmation options to choose from."
      jsonLd={howToSchema}
      related={[
        { label: 'Important Dates 2026', href: 'important-dates' },
        { label: 'How to Apply', href: 'how-to-apply' },
        { label: 'TFC Locator', href: 'tfc-list' },
      ]}
      aintraSuggestions={[
        'How does upward movement work?',
        'Decline & quit, what happens?',
        'Do I lose seat if I do not report?',
        'How many days for confirmation?',
      ]}
    >
      <Alert severity="info" sx={{ mb: 3, borderRadius: 1.5 }}>
        Special-category counselling (Differently Abled, Ex-Servicemen wards, Eminent Sports Persons) happens first. The general academic round and 7.5% Government School round run in parallel afterward.
      </Alert>

      {/* Stages flow */}
      <Typography variant="h5" component="h2" fontWeight={800} sx={{ mb: 2 }}>
        4 stages in each round
      </Typography>
      <Stack spacing={1} sx={{ mb: 4 }}>
        {counselling.stages_per_round.map((stage, i) => (
          <Box key={stage.name}>
            <Paper
              elevation={0}
              sx={{
                p: 2,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                position: 'relative',
              }}
            >
              <Stack direction="row" gap={1.5} alignItems="flex-start">
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    bgcolor: 'primary.main',
                    color: 'primary.contrastText',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </Box>
                <Box flex={1}>
                  <Stack direction="row" gap={1} alignItems="center" sx={{ mb: 0.5 }} flexWrap="wrap">
                    <Typography variant="subtitle1" fontWeight={700}>
                      {stage.name}
                    </Typography>
                    <Chip label={stage.duration} size="small" color="primary" variant="outlined" />
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {stage.description}
                  </Typography>
                </Box>
              </Stack>
            </Paper>
            {i < counselling.stages_per_round.length - 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 0.25 }}>
                <ArrowDownwardIcon sx={{ color: 'text.disabled', fontSize: 18 }} />
              </Box>
            )}
          </Box>
        ))}
      </Stack>

      {/* 3 rounds info */}
      <Paper
        elevation={0}
        sx={{
          p: 2.5,
          mb: 4,
          borderRadius: 2,
          border: '2px solid',
          borderColor: 'primary.main',
          bgcolor: '#E3F2FD',
        }}
      >
        <Typography variant="h6" fontWeight={800} sx={{ mb: 1 }}>
          {counselling.rounds_count} rounds total
        </Typography>
        <Typography variant="body2">
          The same 4-stage cycle repeats {counselling.rounds_count} times. The residual seat matrix at the end of each round becomes the input for the next round, so vacant seats from non-reported and non-paid candidates get pooled for upward movement.
        </Typography>
      </Paper>

      {/* 6 options */}
      <Typography variant="h5" component="h2" fontWeight={800} sx={{ mb: 1 }}>
        Your 6 confirmation options
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        When a seat is allotted to you, choose one of these within 2 days. Non-confirmation cancels your allotment automatically.
      </Typography>
      <Stack spacing={1.5} sx={{ mb: 4 }}>
        {counselling.confirmation_options.map((opt, i) => (
          <Paper
            key={opt.id}
            elevation={0}
            sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
          >
            <Stack direction="row" gap={1.5} alignItems="flex-start">
              <Box
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  bgcolor: 'grey.100',
                  color: 'text.primary',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '0.875rem',
                  flexShrink: 0,
                }}
              >
                {i + 1}
              </Box>
              <Box>
                <Typography variant="subtitle2" fontWeight={700}>
                  {opt.title}
                </Typography>
                <Typography variant="caption" color="primary.main" sx={{ display: 'block', mb: 0.5 }}>
                  {opt.short}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {opt.description}
                </Typography>
              </Box>
            </Stack>
          </Paper>
        ))}
      </Stack>

      {/* Notes */}
      <Typography variant="h5" component="h2" fontWeight={800} sx={{ mb: 2 }}>
        Important notes
      </Typography>
      <Paper elevation={0} sx={{ p: 2.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
        <Stack component="ul" sx={{ pl: 2.5, m: 0 }} spacing={1}>
          {counselling.notes.map((n) => (
            <li key={n}>
              <Typography variant="body2">{n}</Typography>
            </li>
          ))}
        </Stack>
      </Paper>
    </TneaSpokeShell>
  );
}

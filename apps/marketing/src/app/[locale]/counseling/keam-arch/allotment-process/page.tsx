import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import {
  Box,
  Paper,
  Typography,
  Stack,
  Alert,
  Divider,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { buildAlternates } from '@/lib/seo/metadata';
import { generateHowToSchema } from '@/lib/seo/schemas';
import KeamSpokeShell from '@/components/keam-arch/KeamSpokeShell';
import KeamPhaseTimeline from '@/components/keam-arch/KeamPhaseTimeline';
import { allotment } from '@/data/keam-arch-2026';

export const revalidate = 86400;

const SPOKE = 'allotment-process';
const PRIMARY_GREEN = '#0d7a4a';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'KEAM B.Arch CAP 2026: Trial, Phase 1, Phase 2, Mop-up Allotment Process',
    description:
      'KEAM 2026 Centralised Allotment Process (CAP) for B.Arch: trial, phase 1, phase 2, and mop-up. Option registration, fee remittance, reporting checklist, and liquidated damages, with prospectus clause references.',
    keywords:
      'KEAM CAP 2026, KEAM allotment process, KEAM option registration, KEAM B.Arch phase 1, KEAM phase 2, KEAM mop-up allotment, KEAM reporting documents',
    alternates: buildAlternates(locale, `/counseling/keam-arch/${SPOKE}`),
  };
}

export default function AllotmentProcessPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);

  const howToSchema = generateHowToSchema({
    name: 'How KEAM B.Arch CAP allotment works',
    description:
      'A 5-step view of the KEAM Centralised Allotment Process for B.Arch: rank list, option registration, trial, phase allotments, and college reporting.',
    steps: [
      {
        name: 'Rank list publication',
        text: 'CEE publishes the separate B.Arch rank list on cee.kerala.gov.in. Your rank is computed as NATA (out of 200) + qualifying exam (out of 200) = 400.',
      },
      {
        name: 'Online option registration',
        text: 'Log in and register your preferred college and course combinations in priority order. Mandatory before each phase. You will not be allotted any combination you did not opt for.',
      },
      {
        name: 'Trial allotment',
        text: 'CEE runs a non-binding trial allotment. Use this to fine-tune your option list before Phase 1. No fee is paid in trial.',
      },
      {
        name: 'Phase 1 / Phase 2 allotment',
        text: 'Each binding phase allots seats by rank, category, and your registered options. Remit the fee shown on the Allotment Memo and report at the allotted college within the deadline, otherwise you lose the seat AND your remaining options.',
      },
      {
        name: 'Mop-up / Spot allotment',
        text: 'Remaining seats are filled in a final phase. After this, candidates who hold options without taking admission are subject to liquidated damages.',
      },
    ],
  });

  return (
    <KeamSpokeShell
      locale={locale}
      spokeSlug={SPOKE}
      spokeChip="CAP Allotment"
      topicTitle="KEAM B.Arch 2026 CAP Allotment Process"
      topicSubtitle="The Centralised Allotment Process is how Kerala fills B.Arch seats. It is online, rank-based, and runs in phases. Here is how each phase works."
      jsonLd={howToSchema}
      related={[
        { label: 'Important Dates 2026', href: 'important-dates' },
        { label: 'Reservation & Fee Concession', href: 'reservation-fee-concession' },
        { label: 'B.Arch Colleges in Kerala', href: 'colleges-in-kerala' },
      ]}
      aintraSuggestions={[
        'How many CAP rounds?',
        'Is option registration mandatory?',
        'What if I skip an allotment?',
        'What documents to bring at reporting?',
      ]}
      prefillCallbackNotes="Need help understanding the CAP allotment phases"
    >
      <Alert severity="info" sx={{ mb: 3, borderRadius: 1.5 }}>
        Allotment is run by the <strong>{allotment.authority}</strong>, in conformity with{' '}
        {allotment.governing_council} guidelines. ({allotment.clause_refs.authority})
      </Alert>

      <Typography variant="h6" component="h2" fontWeight={800} sx={{ mb: 1.5 }}>
        Phases at a glance
      </Typography>
      <Box sx={{ mb: 4 }}>
        <KeamPhaseTimeline phases={allotment.phases} />
      </Box>

      <Typography variant="h6" component="h2" fontWeight={800} sx={{ mb: 1.5 }}>
        Option registration
      </Typography>
      <Paper
        elevation={0}
        sx={{ p: 2.5, mb: 3, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
      >
        <Typography variant="body2">{allotment.option_registration_note}</Typography>
      </Paper>

      <Typography variant="h6" component="h2" fontWeight={800} sx={{ mb: 1.5 }}>
        Fee remittance after allotment
      </Typography>
      <Alert severity="warning" sx={{ mb: 3, borderRadius: 1.5 }}>
        {allotment.fee_remittance_note}
      </Alert>

      <Typography variant="h6" component="h2" fontWeight={800} sx={{ mb: 1.5 }}>
        Reporting at the college
      </Typography>
      <Paper
        elevation={0}
        sx={{ p: 2.5, mb: 3, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
      >
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Carry these originals at the time of admission ({allotment.clause_refs.reporting},{' '}
          {allotment.clause_refs.physical_fitness}):
        </Typography>
        <Stack spacing={0.75}>
          {allotment.reporting_documents.map((doc) => (
            <Stack key={doc} direction="row" gap={1} alignItems="flex-start">
              <CheckCircleOutlineIcon sx={{ color: PRIMARY_GREEN, fontSize: 18, flexShrink: 0, mt: 0.25 }} />
              <Typography variant="body2">{doc}</Typography>
            </Stack>
          ))}
        </Stack>
        <Divider sx={{ my: 2 }} />
        <Typography variant="caption" color="text.secondary">
          Note: Hepatitis-B vaccination is mandatory before joining the college, per AICTE guidelines.
        </Typography>
      </Paper>

      <Typography variant="h6" component="h2" fontWeight={800} sx={{ mb: 1.5 }}>
        Liquidated damages
      </Typography>
      <Paper
        elevation={0}
        sx={{
          p: 2.5,
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'warning.light',
          bgcolor: '#FFFBEB',
        }}
      >
        <Typography variant="body2">{allotment.liquidated_damages_note}</Typography>
      </Paper>
    </KeamSpokeShell>
  );
}

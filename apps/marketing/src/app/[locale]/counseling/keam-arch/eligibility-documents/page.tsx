import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import {
  Box,
  Paper,
  Typography,
  Stack,
  Chip,
  Divider,
  Alert,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { buildAlternates } from '@/lib/seo/metadata';
import { generateHowToSchema } from '@/lib/seo/schemas';
import KeamSpokeShell from '@/components/keam-arch/KeamSpokeShell';
import NataMeritCalculator from '@/components/keam-arch/NataMeritCalculator';
import { eligibility, documents } from '@/data/keam-arch-2026';

export const revalidate = 86400;

const SPOKE = 'eligibility-documents';
const PRIMARY_GREEN = '#0d7a4a';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'KEAM B.Arch 2026 Eligibility & Documents: NATA, 12th, Age, Nativity',
    description:
      'Full KEAM B.Arch 2026 eligibility: 10+2 with Physics + Mathematics + 45% aggregate, valid NATA 2025 or 2026 score, age 17+ by 31 December 2026, no upper limit. Document checklist with clause references.',
    keywords:
      'KEAM B.Arch eligibility 2026, KEAM Architecture eligibility, KEAM 45 percent rule, NATA validity KEAM, KEAM age limit B.Arch, KEAM nativity Kerala, KEAM document checklist',
    alternates: buildAlternates(locale, `/counseling/keam-arch/${SPOKE}`),
  };
}

export default function EligibilityDocumentsPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);

  const howToSchema = generateHowToSchema({
    name: 'Check your eligibility for KEAM B.Arch 2026',
    description:
      'A 4-step check to see if you can apply for KEAM B.Arch 2026: 10+2 subject and percentage, NATA score, age, and required documents.',
    totalTime: 'PT10M',
    steps: [
      {
        name: 'Confirm 10+2 subjects and aggregate',
        text: 'You must have passed 10+2 (or equivalent) with Physics and Mathematics as compulsory subjects, plus one elective from Chemistry, Biology, Computer Science, IT, Informatics Practices, Engineering Graphics, Business Studies, or a Technical Vocational subject. Minimum 45% aggregate, no rounding.',
      },
      {
        name: 'Check your NATA score',
        text: 'KEAM does not conduct an architecture exam. You must have a valid NATA 2025 or NATA 2026 score above the minimum eligibility marks set by the Council of Architecture. There is no relaxation in the NATA cut-off for any category.',
      },
      {
        name: 'Confirm age',
        text: 'You must be at least 17 years old on or before 31 December 2026. There is no upper age limit and no relaxation in the minimum age.',
      },
      {
        name: 'Gather your documents',
        text: 'Keep nativity proof, SSLC, 10+2 mark list, NATA scorecard, community certificate (if claiming reservation), Non-Creamy Layer certificate (SEBC/OEC), income certificate (fee concession), and disability certificate (if claiming PD) ready before you start the online application.',
      },
    ],
  });

  return (
    <KeamSpokeShell
      locale={locale}
      spokeSlug={SPOKE}
      spokeChip="Eligibility & Documents"
      topicTitle="KEAM B.Arch 2026 Eligibility & Documents"
      topicSubtitle="Who can apply, what NATA score is accepted, age rules, and the full document checklist with clause references from the official prospectus."
      jsonLd={howToSchema}
      related={[
        { label: 'Important Dates 2026', href: 'important-dates' },
        { label: 'How to Apply', href: 'how-to-apply' },
        { label: 'CAP Allotment Process', href: 'allotment-process' },
      ]}
      aintraSuggestions={[
        'Is 44.9% enough?',
        'Can I use NATA 2024?',
        'What is the age limit?',
        'Do I need a nativity certificate?',
      ]}
      prefillCallbackNotes="Need help understanding KEAM B.Arch eligibility"
    >
      <Alert severity="info" sx={{ mb: 3, borderRadius: 1.5 }}>
        KEAM does not run an architecture entrance exam. Your eligibility is decided by your <strong>10+2 marks</strong> and your <strong>NATA score</strong>. (Clauses 1.4(b), 6.2.3(b))
      </Alert>

      {/* Academic */}
      <Typography variant="h6" component="h2" fontWeight={800} sx={{ mb: 1.5 }}>
        1. Academic qualification
      </Typography>
      <Paper
        elevation={0}
        sx={{ p: 2.5, mb: 3, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
      >
        <Typography variant="body2" sx={{ mb: 1.5 }}>
          {eligibility.academic.qualification}
        </Typography>
        <Stack direction="row" gap={0.5} flexWrap="wrap" sx={{ mb: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ width: '100%', mb: 0.5 }}>
            Compulsory subjects:
          </Typography>
          {eligibility.academic.compulsory_subjects.map((s) => (
            <Chip key={s} label={s} size="small" color="primary" sx={{ bgcolor: PRIMARY_GREEN }} />
          ))}
        </Stack>
        <Stack direction="row" gap={0.5} flexWrap="wrap" sx={{ mb: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ width: '100%', mb: 0.5 }}>
            Plus one of these elective subjects:
          </Typography>
          {eligibility.academic.elective_subjects.map((s) => (
            <Chip key={s} label={s} size="small" variant="outlined" />
          ))}
        </Stack>
        <Divider sx={{ my: 1.5 }} />
        <Typography variant="body2">
          <strong>Minimum aggregate:</strong> {eligibility.academic.minimum_aggregate_percent}%.{' '}
          {eligibility.academic.rounding_note}
        </Typography>
        <Typography variant="body2" sx={{ mt: 1 }}>
          <strong>Diploma alternative:</strong> {eligibility.academic.diploma_alternative}
        </Typography>
      </Paper>

      {/* NATA */}
      <Typography variant="h6" component="h2" fontWeight={800} sx={{ mb: 1.5 }}>
        2. NATA score
      </Typography>
      <Paper
        elevation={0}
        sx={{ p: 2.5, mb: 3, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
      >
        <Stack direction="row" gap={0.5} flexWrap="wrap" sx={{ mb: 1.5 }}>
          {eligibility.aptitude.accepted_years.map((y) => (
            <Chip key={y} label={y} size="small" color="primary" sx={{ bgcolor: PRIMARY_GREEN }} />
          ))}
        </Stack>
        <Typography variant="body2" sx={{ mb: 1 }}>
          {eligibility.aptitude.required_test}
        </Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>
          {eligibility.aptitude.relaxation_note}
        </Typography>
        <Alert severity="warning" sx={{ mt: 1.5, borderRadius: 1.5 }}>
          {eligibility.aptitude.no_keam_arch_exam_note}
        </Alert>
      </Paper>

      {/* Merit calculator */}
      <Typography variant="h6" component="h2" fontWeight={800} sx={{ mb: 1.5 }}>
        3. Merit formula (50:50)
      </Typography>
      <Box sx={{ mb: 3 }}>
        <NataMeritCalculator />
      </Box>
      <Paper
        elevation={0}
        sx={{ p: 2.5, mb: 3, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
      >
        <Typography variant="body2" sx={{ mb: 1.5 }}>
          {eligibility.merit_formula.description}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
          Tie-breaking, in order:
        </Typography>
        <Stack spacing={0.5}>
          {eligibility.merit_formula.tiebreaker.map((t, i) => (
            <Stack key={i} direction="row" gap={1} alignItems="flex-start">
              <Typography variant="body2" sx={{ color: PRIMARY_GREEN, fontWeight: 700 }}>
                {i + 1}.
              </Typography>
              <Typography variant="body2">{t}</Typography>
            </Stack>
          ))}
        </Stack>
      </Paper>

      {/* Age + nativity */}
      <Typography variant="h6" component="h2" fontWeight={800} sx={{ mb: 1.5 }}>
        4. Age & other rules
      </Typography>
      <Paper
        elevation={0}
        sx={{ p: 2.5, mb: 3, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
      >
        <Stack spacing={1.25}>
          {eligibility.rules.map((r) => (
            <Stack key={r.id} direction="row" gap={1.25} alignItems="flex-start">
              <CheckCircleOutlineIcon sx={{ color: PRIMARY_GREEN, fontSize: 20, flexShrink: 0, mt: 0.25 }} />
              <Box>
                <Typography variant="body2" fontWeight={700}>
                  {r.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {r.description}
                </Typography>
                {r.clause_ref && (
                  <Typography variant="caption" sx={{ color: PRIMARY_GREEN, fontWeight: 600 }}>
                    {r.clause_ref}
                  </Typography>
                )}
              </Box>
            </Stack>
          ))}
        </Stack>
      </Paper>

      {/* Documents */}
      <Typography variant="h6" component="h2" fontWeight={800} sx={{ mb: 1.5 }}>
        5. Document checklist
      </Typography>
      <Stack spacing={1.5}>
        {documents.map((d) => (
          <Paper
            key={d.name}
            elevation={0}
            sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
          >
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
              <Typography variant="subtitle2" fontWeight={700}>
                {d.name}
              </Typography>
              <Chip
                label={d.mandatory ? 'Mandatory' : 'If applicable'}
                size="small"
                sx={{
                  bgcolor: d.mandatory ? '#dcfce7' : '#fef3c7',
                  color: d.mandatory ? '#15803d' : '#92400e',
                  fontWeight: 600,
                }}
              />
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              For: {d.required_for}
            </Typography>
            {d.format_notes && (
              <Typography variant="body2" color="text.secondary">
                {d.format_notes}
              </Typography>
            )}
            {d.clause_ref && (
              <Typography variant="caption" sx={{ color: PRIMARY_GREEN, fontWeight: 600, mt: 0.5, display: 'block' }}>
                {d.clause_ref}
              </Typography>
            )}
          </Paper>
        ))}
      </Stack>
    </KeamSpokeShell>
  );
}

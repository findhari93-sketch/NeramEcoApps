import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import {
  Box,
  Paper,
  Typography,
  Stack,
  Chip,
  Grid,
  Button,
  Divider,
  Alert,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { buildAlternates } from '@/lib/seo/metadata';
import { generateArticleSchema } from '@/lib/seo/schemas';
import TneaSpokeShell from '@/components/tnea-barch/TneaSpokeShell';
import { eligibility, documents } from '@/data/tnea-barch-2026';

const baseUrl = 'https://neramclasses.com';
const SPOKE = 'eligibility-documents';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'TNEA B.Arch 2026 Eligibility & Documents Required',
    description:
      'Full TNEA B.Arch 2026 eligibility: 10+2 with Physics + Maths, 45% aggregate, NATA or JEE Paper-2, Tamil Nadu nativity rules, and the complete document checklist.',
    keywords:
      'TNEA B.Arch eligibility 2026, TNEA documents required, NATA TNEA, TNEA nativity certificate, TNEA 45 percent rule, TNEA community certificate',
    alternates: buildAlternates(locale, `/counseling/tnea-barch/${SPOKE}`),
  };
}

export default function EligibilityDocumentsPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  const articleSchema = generateArticleSchema({
    title: 'TNEA B.Arch 2026 Eligibility & Documents',
    description:
      'Academic eligibility, nativity rules, aptitude exam requirement, and the full document checklist for TNEA B.Arch 2026.',
    url: `${baseUrl}/counseling/tnea-barch/${SPOKE}`,
    publishedAt: '2026-01-01',
    modifiedAt: new Date().toISOString().slice(0, 10),
    author: 'Neram Classes',
    category: 'Architecture Admissions',
  });

  return (
    <TneaSpokeShell
      locale={locale}
      spokeSlug={SPOKE}
      spokeChip="Eligibility"
      topicTitle="Eligibility & Documents Required"
      topicSubtitle="Who can apply to TNEA B.Arch 2026 and the exact documents you need to upload."
      jsonLd={articleSchema}
      related={[
        { label: 'Important Dates 2026', href: 'important-dates' },
        { label: 'How to Apply', href: 'how-to-apply' },
        { label: 'Reservation & Fee Concession', href: 'reservation-fee-concession' },
      ]}
      aintraSuggestions={[
        'Am I eligible if I have 44%?',
        'Do I need NATA and JEE both?',
        'Nativity certificate format?',
        'What if I studied 12th outside TN?',
      ]}
    >
      {/* Academic */}
      <Typography variant="h5" component="h2" fontWeight={800} sx={{ mb: 2 }}>
        Academic eligibility
      </Typography>
      <Paper
        elevation={0}
        sx={{ p: 2.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', mb: 3 }}
      >
        <Typography variant="body1" sx={{ mb: 2 }}>
          {eligibility.academic.qualification}
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <Typography variant="caption" color="text.secondary">
              Required subjects
            </Typography>
            <Typography variant="body2" fontWeight={700}>
              {eligibility.academic.required_subjects.join(' + ')}
            </Typography>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography variant="caption" color="text.secondary">
              Minimum aggregate
            </Typography>
            <Typography variant="body2" fontWeight={700}>
              {eligibility.academic.minimum_aggregate_percent}%
            </Typography>
          </Grid>
        </Grid>
        <Divider sx={{ my: 2 }} />
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
          One elective from
        </Typography>
        <Stack direction="row" gap={0.5} flexWrap="wrap">
          {eligibility.academic.elective_subjects.map((s) => (
            <Chip key={s} label={s} size="small" variant="outlined" />
          ))}
        </Stack>
        <Alert severity="info" sx={{ mt: 2, borderRadius: 1.5 }}>
          {eligibility.academic.diploma_alternative}
        </Alert>
      </Paper>

      {/* Aptitude */}
      <Typography variant="h5" component="h2" fontWeight={800} sx={{ mb: 2 }}>
        Aptitude test (mandatory)
      </Typography>
      <Paper elevation={0} sx={{ p: 2.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', mb: 3 }}>
        <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mb: 1.5 }}>
          {eligibility.aptitude.accepted_exams.map((e) => (
            <Chip key={e} label={e} color="primary" />
          ))}
        </Stack>
        <Typography variant="body2" sx={{ mb: 1.5 }}>
          {eligibility.aptitude.nata_minimum}
        </Typography>
        <Stack component="ul" sx={{ pl: 2.5, m: 0 }} spacing={0.5}>
          {eligibility.aptitude.notes.map((n) => (
            <li key={n}>
              <Typography variant="body2" color="text.secondary">
                {n}
              </Typography>
            </li>
          ))}
        </Stack>
      </Paper>

      {/* Nativity */}
      <Typography variant="h5" component="h2" fontWeight={800} sx={{ mb: 2 }}>
        Nativity & special category rules
      </Typography>
      <Stack spacing={1.25} sx={{ mb: 4 }}>
        {eligibility.nativity_rules.map((rule) => (
          <Paper
            key={rule.id}
            elevation={0}
            sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
          >
            <Stack direction="row" gap={1} alignItems="flex-start">
              <CheckCircleIcon sx={{ color: 'success.main', fontSize: 18, mt: 0.25, flexShrink: 0 }} />
              <Box>
                <Typography variant="subtitle2" fontWeight={700}>
                  {rule.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                  {rule.description}
                </Typography>
              </Box>
            </Stack>
          </Paper>
        ))}
      </Stack>

      {/* Merit formula */}
      <Typography variant="h5" component="h2" fontWeight={800} sx={{ mb: 2 }}>
        Merit formula
      </Typography>
      <Paper
        elevation={0}
        sx={{
          p: 3,
          borderRadius: 2,
          border: '2px solid',
          borderColor: 'primary.main',
          bgcolor: '#E3F2FD',
          mb: 1.5,
        }}
      >
        <Typography variant="h6" fontWeight={800} sx={{ textAlign: 'center', mb: 1 }}>
          Total = Board ({eligibility.merit_formula.board_component}) + NATA / JEE ({eligibility.merit_formula.aptitude_component}) = {eligibility.merit_formula.total}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
          Higher of NATA or JEE Paper-2 is used. Tiebreaker: {eligibility.merit_formula.tiebreaker.join(' → ')}
        </Typography>
      </Paper>
      <Button
        href="https://app.neramclasses.com/tools/nata/cutoff-calculator"
        target="_blank"
        rel="noopener"
        variant="contained"
        sx={{ mb: 5, minHeight: 48 }}
      >
        Calculate my TNEA cutoff (free tool)
      </Button>

      {/* Documents */}
      <Typography variant="h5" component="h2" fontWeight={800} sx={{ mb: 1 }}>
        Documents required
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Upload clear scans or PDFs at <strong>barch.tneaonline.org</strong>. Names should match across all documents. Certificates obtained after the registration close date are not considered.
      </Typography>
      <Stack spacing={1.25}>
        {documents.map((doc) => (
          <Paper
            key={doc.name}
            elevation={0}
            sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
          >
            <Typography variant="subtitle2" fontWeight={700}>
              {doc.name}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
              Required for: {doc.required_for}
            </Typography>
            {doc.format_notes && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                {doc.format_notes}
              </Typography>
            )}
            {doc.certificate_authority && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontStyle: 'italic' }}>
                Issuing authority: {doc.certificate_authority}
              </Typography>
            )}
          </Paper>
        ))}
      </Stack>
    </TneaSpokeShell>
  );
}

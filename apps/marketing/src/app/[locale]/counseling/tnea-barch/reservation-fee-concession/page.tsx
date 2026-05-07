import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import {
  Box,
  Paper,
  Typography,
  Stack,
  Chip,
  Grid,
  Divider,
  Alert,
  LinearProgress,
} from '@mui/material';
import LocalAtmIcon from '@mui/icons-material/LocalAtm';
import { buildAlternates } from '@/lib/seo/metadata';
import { generateArticleSchema } from '@/lib/seo/schemas';
import TneaSpokeShell from '@/components/tnea-barch/TneaSpokeShell';
import { reservation, fees } from '@/data/tnea-barch-2026';

const baseUrl = 'https://neramclasses.com';
const SPOKE = 'reservation-fee-concession';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'TNEA B.Arch 2026 Reservation Categories & Fee Concession',
    description:
      'TNEA B.Arch reservation: 7 communal categories (OC 31%, BC 26.5%, MBC 20%, SC 15% etc.), 7.5% government school quota, 5% PwBD, First Graduate concession, PMSS scholarship.',
    keywords:
      'TNEA reservation 2026, TNEA fee concession, 7.5 government school quota, First Graduate TNEA, PMSS scholarship, TNEA PwBD reservation, TNEA BC MBC SC ST',
    alternates: buildAlternates(locale, `/counseling/tnea-barch/${SPOKE}`),
  };
}

export default function ReservationFeeConcessionPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);

  const articleSchema = generateArticleSchema({
    title: 'TNEA B.Arch 2026 Reservation & Fee Concession',
    description:
      'Reservation categories, special category quotas, fee concessions, and scholarship eligibility for TNEA B.Arch 2026 admission.',
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
      spokeChip="Reservation"
      topicTitle="Reservation & Fee Concession"
      topicSubtitle="Communal reservation, the 7.5% Government School preferential quota, special-category seats, and tuition fee concessions for TNEA B.Arch 2026."
      jsonLd={articleSchema}
      related={[
        { label: 'Eligibility & Documents', href: 'eligibility-documents' },
        { label: 'Counselling Procedure', href: 'counselling-procedure' },
        { label: 'How to Apply', href: 'how-to-apply' },
      ]}
      aintraSuggestions={[
        '7.5% govt school quota?',
        'How to claim First Graduate concession?',
        'PwBD reservation rules?',
        'Sports quota seats?',
      ]}
      prefillCallbackNotes="I want help with TNEA reservation / fee concession"
    >
      {/* Communal */}
      <Typography variant="h5" component="h2" fontWeight={800} sx={{ mb: 2 }}>
        Communal reservation
      </Typography>
      <Stack spacing={1.5} sx={{ mb: 4 }}>
        {reservation.general.map((c) => (
          <Paper
            key={c.code}
            elevation={0}
            sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
          >
            <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 0.5 }}>
              <Chip label={c.code} size="small" color="primary" />
              <Typography variant="subtitle2" fontWeight={700}>
                {c.name}
              </Typography>
              <Box flex={1} />
              <Typography variant="subtitle2" fontWeight={800} color="primary.main">
                {c.percent}%
              </Typography>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={Math.min(100, c.percent * 3)}
              sx={{ height: 6, borderRadius: 1, bgcolor: 'grey.100', mb: 1 }}
            />
            <Typography variant="body2" color="text.secondary">
              {c.description}
            </Typography>
          </Paper>
        ))}
      </Stack>

      {/* Govt school */}
      <Paper
        elevation={0}
        sx={{
          p: 2.5,
          borderRadius: 2,
          border: '2px solid',
          borderColor: 'success.main',
          bgcolor: '#E8F5E9',
          mb: 4,
        }}
      >
        <Typography variant="h6" fontWeight={800} sx={{ mb: 1 }}>
          7.5% Government School preferential quota
        </Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>
          {reservation.govt_school_quota.eligibility}
        </Typography>
        <Stack direction="row" gap={0.5} flexWrap="wrap">
          {fees.govt_school_categories.map((c) => (
            <Chip key={c} label={c} size="small" variant="outlined" />
          ))}
        </Stack>
      </Paper>

      {/* Special categories */}
      <Typography variant="h5" component="h2" fontWeight={800} sx={{ mb: 2 }}>
        Special reservation categories
      </Typography>
      <Stack spacing={1.5} sx={{ mb: 4 }}>
        {reservation.special.map((s) => (
          <Paper
            key={s.category}
            elevation={0}
            sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
          >
            <Stack direction="row" justifyContent="space-between" gap={1} flexWrap="wrap" alignItems="center">
              <Typography variant="subtitle2" fontWeight={700}>
                {s.category}
              </Typography>
              <Chip label={s.quota} size="small" color="primary" variant="outlined" />
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {s.notes}
            </Typography>
          </Paper>
        ))}
      </Stack>

      {/* PwBD */}
      <Typography variant="h5" component="h2" fontWeight={800} sx={{ mb: 1 }}>
        PwBD: 21 covered disability categories
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        B.Arch is suitable for all categories below except 100% blindness. 5% horizontal reservation applies. District Medical Board certificate required (3+ doctors).
      </Typography>
      <Grid container spacing={1} sx={{ mb: 5 }}>
        {reservation.pwd_disability_list.map((d) => (
          <Grid item xs={12} sm={6} md={4} key={d}>
            <Chip label={d} size="small" variant="outlined" sx={{ width: '100%', justifyContent: 'flex-start' }} />
          </Grid>
        ))}
      </Grid>

      {/* Fees + concessions */}
      <Typography variant="h5" component="h2" fontWeight={800} sx={{ mb: 2 }}>
        Registration fee
      </Typography>
      <Paper elevation={0} sx={{ p: 2.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', mb: 4 }}>
        <Grid container spacing={2}>
          <Grid item xs={6}>
            <Typography variant="caption" color="text.secondary">
              OC / BC / BCM / MBC & DNC
            </Typography>
            <Typography variant="h6" fontWeight={800}>
              ₹{fees.registration_fee.oc_bc_bcm_mbc}
            </Typography>
          </Grid>
          <Grid item xs={6}>
            <Typography variant="caption" color="text.secondary">
              SC / SCA / ST
            </Typography>
            <Typography variant="h6" fontWeight={800}>
              ₹{fees.registration_fee.sc_sca_st}
            </Typography>
          </Grid>
        </Grid>
        <Divider sx={{ my: 2 }} />
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
          Payment modes
        </Typography>
        <Stack direction="row" gap={0.5} flexWrap="wrap">
          {fees.registration_fee.payment_modes.map((m) => (
            <Chip key={m} label={m} size="small" variant="outlined" />
          ))}
        </Stack>
      </Paper>

      <Typography variant="h5" component="h2" fontWeight={800} sx={{ mb: 2 }}>
        Fee concessions & scholarships
      </Typography>
      <Stack spacing={1.5} sx={{ mb: 4 }}>
        {fees.concessions.map((f) => (
          <Paper
            key={f.name}
            elevation={0}
            sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
          >
            <Stack direction="row" gap={1} alignItems="flex-start" sx={{ mb: 1 }}>
              <LocalAtmIcon sx={{ color: 'success.main', fontSize: 20 }} />
              <Box>
                <Typography variant="subtitle2" fontWeight={700}>
                  {f.name}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                  {f.description}
                </Typography>
              </Box>
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Eligibility
            </Typography>
            <Stack component="ul" sx={{ pl: 2.5, m: 0, mb: 1 }} spacing={0.25}>
              {f.eligibility.map((e) => (
                <li key={e}>
                  <Typography variant="body2" color="text.secondary">
                    {e}
                  </Typography>
                </li>
              ))}
            </Stack>
            <Chip label={f.benefit} size="small" color="success" variant="outlined" />
          </Paper>
        ))}
      </Stack>

      <Alert severity="info" sx={{ borderRadius: 1.5 }}>
        Scholarship-eligible candidates (7.5% quota, First Graduate, PMSS) must report to the college and TFC but do not pay fees during reporting.
      </Alert>
    </TneaSpokeShell>
  );
}

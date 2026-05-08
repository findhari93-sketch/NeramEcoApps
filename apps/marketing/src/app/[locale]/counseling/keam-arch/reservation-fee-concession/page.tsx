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
import { buildAlternates } from '@/lib/seo/metadata';
import KeamSpokeShell from '@/components/keam-arch/KeamSpokeShell';
import { reservation, fees } from '@/data/keam-arch-2026';

export const revalidate = 86400;

const SPOKE = 'reservation-fee-concession';
const PRIMARY_GREEN = '#0d7a4a';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'KEAM 2026 Reservation & Fee Concession: SM, SEBC, SC, ST, EWS, PD',
    description:
      'Full KEAM 2026 reservation matrix: State Merit 50%, SEBC 30% (across 9 sub-categories), SC 8%, ST 2%, EWS, PD 5%, sports/NCC additive. Fee concessions for SC/ST, OEC, SEBC (income up to Rs. 6L), Tuition Fee Waiver (income up to Rs. 8L).',
    keywords:
      'KEAM reservation 2026, KEAM SEBC sub-categories, KEAM EWS reservation, KEAM PD quota, KEAM SC ST fee waiver, Tuition Fee Waiver Kerala, KEAM B.Arch fee concession',
    alternates: buildAlternates(locale, `/counseling/keam-arch/${SPOKE}`),
  };
}

export default function ReservationFeePage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);

  return (
    <KeamSpokeShell
      locale={locale}
      spokeSlug={SPOKE}
      spokeChip="Reservation & Fees"
      topicTitle="KEAM B.Arch 2026 Reservation & Fee Concession"
      topicSubtitle="The full reservation matrix and every fee waiver scheme. Each entry cites the prospectus clause so you can verify in the official document."
      related={[
        { label: 'Eligibility & Documents', href: 'eligibility-documents' },
        { label: 'CAP Allotment Process', href: 'allotment-process' },
        { label: 'How to Apply', href: 'how-to-apply' },
      ]}
      aintraSuggestions={[
        'What is State Merit?',
        'EZ vs MU difference?',
        'Income limit for fee waiver?',
        'Sports quota for B.Arch?',
      ]}
      prefillCallbackNotes="Need help understanding KEAM reservation and fee concessions"
    >
      <Alert severity="info" sx={{ mb: 3, borderRadius: 1.5 }}>
        Tuition fees for B.Arch colleges are <strong>not specified in the 2026 prospectus</strong>. CEE will publish the fee structure separately before CAP-2026 starts. (Clause 12.1)
      </Alert>

      <Typography variant="h6" component="h2" fontWeight={800} sx={{ mb: 1.5 }}>
        General reservation
      </Typography>
      <Stack spacing={1.5} sx={{ mb: 3 }}>
        {reservation.general.map((c) => (
          <Paper
            key={c.code}
            elevation={0}
            sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
          >
            <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 0.5 }}>
              <Chip
                label={c.code}
                size="small"
                sx={{ bgcolor: PRIMARY_GREEN, color: 'white', fontWeight: 700 }}
              />
              <Typography variant="subtitle2" fontWeight={700}>
                {c.name}
              </Typography>
              <Chip label={`${c.percent}%`} size="small" variant="outlined" sx={{ ml: 'auto' }} />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {c.description}
            </Typography>
          </Paper>
        ))}
      </Stack>

      <Typography variant="h6" component="h2" fontWeight={800} sx={{ mb: 1.5 }}>
        SEBC sub-categories (within 30%)
      </Typography>
      <Paper
        elevation={0}
        sx={{ p: 2, mb: 3, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
      >
        <Box sx={{ overflowX: 'auto' }}>
          <Box
            component="table"
            sx={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}
          >
            <Box component="thead">
              <Box component="tr" sx={{ borderBottom: '2px solid', borderColor: 'divider' }}>
                <Box component="th" sx={{ textAlign: 'left', p: 1, fontWeight: 700 }}>
                  Code
                </Box>
                <Box component="th" sx={{ textAlign: 'left', p: 1, fontWeight: 700 }}>
                  Community
                </Box>
                <Box component="th" sx={{ textAlign: 'right', p: 1, fontWeight: 700 }}>
                  %
                </Box>
              </Box>
            </Box>
            <Box component="tbody">
              {reservation.sebc_sub_categories.map((s) => (
                <Box
                  key={s.code}
                  component="tr"
                  sx={{ borderBottom: '1px solid', borderColor: 'divider' }}
                >
                  <Box component="td" sx={{ p: 1, fontWeight: 700, color: PRIMARY_GREEN }}>
                    {s.code}
                  </Box>
                  <Box component="td" sx={{ p: 1 }}>
                    {s.name}
                  </Box>
                  <Box component="td" sx={{ p: 1, textAlign: 'right' }}>
                    {s.percent}%
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          All SEBC candidates need a community certificate AND a Non-Creamy Layer certificate.
        </Typography>
      </Paper>

      <Typography variant="h6" component="h2" fontWeight={800} sx={{ mb: 1.5 }}>
        EWS, PD, and special quotas
      </Typography>
      <Stack spacing={1.5} sx={{ mb: 3 }}>
        <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
            EWS reservation (General category)
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {reservation.ews.description}
          </Typography>
          <Typography variant="caption" sx={{ color: PRIMARY_GREEN, fontWeight: 600, mt: 0.5, display: 'block' }}>
            {reservation.ews.clause_ref}
          </Typography>
        </Paper>
        <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
            Persons with Disabilities (PD): {reservation.pwd.percent}%
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Minimum {reservation.pwd.minimum_disability_percent}% benchmark disability. Document required: {reservation.pwd.document}.
          </Typography>
          <Typography variant="caption" sx={{ color: PRIMARY_GREEN, fontWeight: 600, mt: 0.5, display: 'block' }}>
            {reservation.pwd.clause_ref}
          </Typography>
        </Paper>
        {reservation.special.map((s) => (
          <Paper
            key={s.category}
            elevation={0}
            sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
          >
            <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 0.5 }}>
              <Typography variant="subtitle2" fontWeight={700}>
                {s.category}
              </Typography>
              <Chip label={s.quota} size="small" variant="outlined" />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {s.notes}
            </Typography>
            {s.clause_ref && (
              <Typography variant="caption" sx={{ color: PRIMARY_GREEN, fontWeight: 600, mt: 0.5, display: 'block' }}>
                {s.clause_ref}
              </Typography>
            )}
          </Paper>
        ))}
      </Stack>

      <Alert severity="info" sx={{ mb: 4, borderRadius: 1.5 }}>
        <strong>Sports / NCC bonus is unique to B.Arch.</strong> {reservation.sports_ncc_additive.description}
      </Alert>

      {/* Application fee */}
      <Typography variant="h6" component="h2" fontWeight={800} sx={{ mb: 1.5 }}>
        Application fee
      </Typography>
      <Paper
        elevation={0}
        sx={{ p: 2, mb: 3, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
      >
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5} sx={{ mb: 1 }}>
          <Chip label={`General: Rs. ${fees.application_fee.general}`} sx={{ bgcolor: PRIMARY_GREEN, color: 'white' }} />
          <Chip label={`SC: Rs. ${fees.application_fee.sc}`} variant="outlined" />
          <Chip label="ST: Free" variant="outlined" />
        </Stack>
        <Typography variant="body2" color="text.secondary">
          UAE examination centre adds Rs. {fees.application_fee.uae_centre_extra} (relevant only if you write the KEAM Engineering exam from UAE).
          Payment modes: {fees.application_fee.payment_modes.join(', ')}.
        </Typography>
      </Paper>

      {/* Tuition fee */}
      <Typography variant="h6" component="h2" fontWeight={800} sx={{ mb: 1.5 }}>
        Tuition fee
      </Typography>
      <Paper
        elevation={0}
        sx={{ p: 2, mb: 3, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
      >
        <Typography variant="body2">{fees.tuition_fee.note}</Typography>
        <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
          Watch{' '}
          <Box component="a" href={fees.tuition_fee.notification_url} target="_blank" rel="noopener" sx={{ color: PRIMARY_GREEN, fontWeight: 600 }}>
            cee.kerala.gov.in
          </Box>{' '}
          for the official notification.
        </Typography>
      </Paper>

      {/* Concessions */}
      <Typography variant="h6" component="h2" fontWeight={800} sx={{ mb: 1.5 }}>
        Fee concessions
      </Typography>
      <Stack spacing={1.5} sx={{ mb: 3 }}>
        {fees.concessions.map((c) => (
          <Paper
            key={c.name}
            elevation={0}
            sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
          >
            <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 0.5 }}>
              <Typography variant="subtitle2" fontWeight={700}>
                {c.name}
              </Typography>
              <Chip
                label={c.benefit}
                size="small"
                sx={{ bgcolor: '#dcfce7', color: '#15803d', fontWeight: 600, ml: 'auto' }}
              />
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              {c.description}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Eligibility: {c.eligibility.join('; ')}
            </Typography>
            {c.clause_ref && (
              <Typography variant="caption" sx={{ color: PRIMARY_GREEN, fontWeight: 600, mt: 0.5, display: 'block' }}>
                {c.clause_ref}
              </Typography>
            )}
          </Paper>
        ))}
      </Stack>

      <Typography variant="h6" component="h2" fontWeight={800} sx={{ mb: 1.5 }}>
        Refund rules
      </Typography>
      <Paper
        elevation={0}
        sx={{ p: 2.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
      >
        <Stack spacing={1.5}>
          {fees.refund_rules.map((r, i) => (
            <Box key={i}>
              <Typography variant="body2" fontWeight={700}>
                {r.title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {r.description}
              </Typography>
              {r.clause_ref && (
                <Typography
                  variant="caption"
                  sx={{ color: PRIMARY_GREEN, fontWeight: 600, mt: 0.25, display: 'block' }}
                >
                  {r.clause_ref}
                </Typography>
              )}
              {i < fees.refund_rules.length - 1 && <Divider sx={{ mt: 1.5 }} />}
            </Box>
          ))}
        </Stack>
      </Paper>
    </KeamSpokeShell>
  );
}

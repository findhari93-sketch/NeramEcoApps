import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import {
  Box,
  Paper,
  Typography,
  Stack,
  Chip,
  Button,
  Alert,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { buildAlternates } from '@/lib/seo/metadata';
import { generateHowToSchema } from '@/lib/seo/schemas';
import KeamSpokeShell from '@/components/keam-arch/KeamSpokeShell';
import { fees, akshaya } from '@/data/keam-arch-2026';

export const revalidate = 86400;

const SPOKE = 'how-to-apply';
const PRIMARY_GREEN = '#0d7a4a';
const PRIMARY_GREEN_DARK = '#0a5a36';

const STEPS = [
  {
    title: 'Open the official KEAM portal',
    detail:
      'Go to https://cee.kerala.gov.in/keam2026/. This is the only authentic source for KEAM 2026. Bookmark the page; you will revisit it for document upload, option registration, and allotment results.',
    tip: 'Use a desktop or laptop browser for the best experience. The portal is mobile-friendly, but file uploads are easier on a larger screen.',
  },
  {
    title: 'Register and create your account',
    detail:
      'Click "Candidate Portal" and start a new registration. You will get a system-generated Application Number after providing basic details and OTP verification. Save your credentials securely; you will use them throughout counselling.',
    tip: 'Use a phone number you have access to right now and an email you check daily. Both are used for OTPs and notifications.',
  },
  {
    title: 'Fill the application form',
    detail:
      'Enter your personal details, communication address, parent details, school details, 10th and 12th marks, NATA score, community, nativity, and any special-category claims (PD, sports, NCC). Choose B.Arch among the courses you want to be considered for.',
    tip: 'Names must match exactly across SSLC, 10+2 mark list, and the NATA Score Card. Mismatch is the most common cause of rejection during verification.',
  },
  {
    title: `Pay the application fee (Rs. ${fees.application_fee.general} general, Rs. ${fees.application_fee.sc} SC, free for ST)`,
    detail: `Pay online via ${fees.application_fee.payment_modes.join(', ')}. If you choose UAE as your KEAM Engineering examination centre, an additional Rs. ${fees.application_fee.uae_centre_extra} is payable. UAE centre fee does not apply to B.Arch-only candidates.`,
    tip: 'Save the payment receipt PDF immediately. You will need it if a transaction is disputed later.',
  },
  {
    title: 'Upload photo, signature, and supporting documents',
    detail:
      'Upload a 150 x 100 pixel photo (1 to 100 KB JPEG/JPG), signature in the same format, and certificates: SSLC, 10+2 mark list, NATA Score Card, nativity, community certificate (if claiming reservation), Non-Creamy Layer (SEBC/OEC), income certificate, disability certificate (if PD).',
    tip: 'Use a scan or a clean PDF, not a phone photo. Each file must be under the size limit shown on the portal.',
  },
  {
    title: 'Upload NATA Score Card by 7 February 2026',
    detail:
      'NATA 2025 or NATA 2026 scores are accepted. Upload the latest scorecard available before the upload deadline. NATA score uploaded by other means or after the deadline is not considered for rank list preparation.',
    tip: 'If you take a later NATA session, you can replace your scorecard within the upload window. The best valid score on file is used for ranking.',
  },
  {
    title: 'Submit and print acknowledgement',
    detail:
      'Verify every entry, submit the application before 31 January 2026, 5:00 PM, and print the acknowledgement PDF for your records.',
    tip: 'Do not wait until the last day. The portal slows down near deadlines.',
  },
  {
    title: 'Watch for the rank list and option registration',
    detail:
      'Once the B.Arch rank list is published on cee.kerala.gov.in, log in and register your preferred college and course combinations in priority order. Option registration is mandatory before each phase of allotment.',
    tip: 'Order options honestly by preference. CAP always tries to give you the highest-priority option you are eligible for.',
  },
  {
    title: 'Pay the fee after allotment and report at the college',
    detail:
      'After every binding allotment phase, pay the prescribed fee online and report at the allotted college within the deadline. Carry all uploaded originals plus a Physical Fitness Certificate (Annexure XVII(b)) and Hepatitis-B vaccination proof.',
    tip: 'Missing the fee or reporting deadline means you lose the seat AND your remaining options in the stream.',
  },
];

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'How to Apply for KEAM B.Arch 2026: Step-by-Step Guide for cee.kerala.gov.in',
    description:
      'Step-by-step KEAM B.Arch 2026 application guide for cee.kerala.gov.in: registration, application filling, fee payment, NATA score upload, certificate upload, rank list, option registration, and reporting.',
    keywords:
      'How to apply KEAM B.Arch 2026, KEAM registration steps, cee.kerala.gov.in guide, KEAM application process, KEAM NATA upload, Akshaya Centre KEAM',
    alternates: buildAlternates(locale, `/counseling/keam-arch/${SPOKE}`),
  };
}

export default function HowToApplyPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);

  const howToSchema = generateHowToSchema({
    name: 'How to Apply for KEAM B.Arch 2026',
    description:
      'Step-by-step guide to register, fill the form, upload documents, complete fee payment, and report at the college for KEAM B.Arch 2026 admission at cee.kerala.gov.in.',
    totalTime: 'PT60M',
    steps: STEPS.map((s) => ({ name: s.title, text: s.detail })),
  });

  return (
    <KeamSpokeShell
      locale={locale}
      spokeSlug={SPOKE}
      spokeChip="Application Guide"
      topicTitle="How to Apply for KEAM B.Arch 2026"
      topicSubtitle="A clean, step-by-step walkthrough of the official KEAM portal at cee.kerala.gov.in. Avoid the common mistakes that cause verification rejections."
      jsonLd={howToSchema}
      related={[
        { label: 'Eligibility & Documents', href: 'eligibility-documents' },
        { label: 'Important Dates 2026', href: 'important-dates' },
        { label: 'CAP Allotment Process', href: 'allotment-process' },
      ]}
      aintraSuggestions={[
        'Where do I register?',
        'Photo size for KEAM?',
        'Can I edit after submitting?',
        'NATA upload deadline?',
      ]}
      prefillCallbackNotes="Need help with KEAM B.Arch application steps"
    >
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 3 }}>
        <Button
          variant="contained"
          size="large"
          href="https://cee.kerala.gov.in/keam2026/"
          target="_blank"
          rel="noopener"
          endIcon={<OpenInNewIcon />}
          sx={{
            minHeight: 48,
            bgcolor: PRIMARY_GREEN,
            '&:hover': { bgcolor: PRIMARY_GREEN_DARK },
          }}
        >
          Open cee.kerala.gov.in
        </Button>
        <Button
          variant="outlined"
          size="large"
          href={akshaya.finder_url}
          target="_blank"
          rel="noopener"
          endIcon={<OpenInNewIcon />}
          sx={{ minHeight: 48 }}
        >
          Find an Akshaya Centre
        </Button>
      </Stack>

      <Alert
        severity="warning"
        icon={<WarningAmberIcon />}
        sx={{ mb: 3, borderRadius: 1.5 }}
      >
        Common rejection reasons: name mismatch across certificates, blurry uploads, NATA score not uploaded by the cut-off, wrong income certificate format, community certificate dated after the application close.
      </Alert>

      <Stack spacing={2} sx={{ mb: 4 }}>
        {STEPS.map((step, i) => (
          <Paper
            key={step.title}
            elevation={0}
            sx={{ p: 2.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
          >
            <Stack direction="row" gap={1.5} alignItems="flex-start" sx={{ mb: 1 }}>
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  bgcolor: PRIMARY_GREEN,
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                {i + 1}
              </Box>
              <Typography variant="subtitle1" fontWeight={700} sx={{ flex: 1 }}>
                {step.title}
              </Typography>
            </Stack>
            <Typography variant="body2" sx={{ mb: 1.5, ml: { xs: 0, sm: 6 } }}>
              {step.detail}
            </Typography>
            <Box sx={{ ml: { xs: 0, sm: 6 } }}>
              <Chip
                label={`Tip: ${step.tip}`}
                size="small"
                sx={{
                  height: 'auto',
                  py: 0.75,
                  '& .MuiChip-label': {
                    whiteSpace: 'normal',
                    px: 1.5,
                    py: 0.25,
                    fontSize: '0.75rem',
                  },
                  bgcolor: '#FFFBEB',
                  color: '#92400E',
                  border: '1px solid #FDE68A',
                }}
              />
            </Box>
          </Paper>
        ))}
      </Stack>

      {/* Akshaya Centre callout */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, md: 3 },
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: '#f0fdf4',
        }}
      >
        <Typography variant="h6" fontWeight={800} sx={{ mb: 1 }}>
          Stuck somewhere? Visit an Akshaya Centre
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {akshaya.description}
        </Typography>
        <Button
          variant="outlined"
          size="medium"
          href={akshaya.finder_url}
          target="_blank"
          rel="noopener"
          endIcon={<OpenInNewIcon />}
          sx={{ borderColor: PRIMARY_GREEN, color: PRIMARY_GREEN }}
        >
          Find your nearest Akshaya Centre
        </Button>
      </Paper>
    </KeamSpokeShell>
  );
}

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
import TneaSpokeShell from '@/components/tnea-barch/TneaSpokeShell';
import { fees } from '@/data/tnea-barch-2026';

const baseUrl = 'https://neramclasses.com';
const SPOKE = 'how-to-apply';

const STEPS = [
  {
    title: 'Open the official portal',
    detail:
      'Go to https://barch.tneaonline.org (or the parent site https://www.tneaonline.org). Bookmark the page; you will revisit it for choice filling and confirmation.',
    tip: 'Use a desktop or laptop browser for the best experience. Mobile works but file uploads are easier on a larger screen.',
  },
  {
    title: 'Create your account',
    detail:
      'Click "New Registration". Enter your mobile number and email, then create a username and password. Save your credentials, you will need them for every login during counselling.',
    tip: 'Use a mobile number you have access to right now (OTP verification) and an email you check daily.',
  },
  {
    title: 'Fill the application',
    detail:
      'Enter your personal details, communication address, parent details, school details (6th to 12th, important for the 7.5% govt-school quota), 10th and 12th marks, NATA / JEE Paper-2 score, community, nativity, special-category claims, and TFC preference for verification.',
    tip: 'Names must match across all your certificates. Mismatch is the most common cause of rejection during verification.',
  },
  {
    title: 'Pay the registration fee',
    detail: `Pay ₹${fees.registration_fee.oc_bc_bcm_mbc} (OC/BC/BCM/MBC) or ₹${fees.registration_fee.sc_sca_st} (SC/SCA/ST) via ${fees.registration_fee.payment_modes.join(', ')}.`,
    tip: 'Save the payment receipt PDF immediately. You will need it if a transaction is disputed later.',
  },
  {
    title: 'Upload original certificates',
    detail:
      'Upload clear PDFs or JPGs of your 10th, HSC/Diploma, NATA/JEE Paper-2 score card, Aadhaar, community certificate (if applicable), nativity certificate (if applicable), TC, First Graduate certificate (if claiming concession), and special-category certificates (if claiming).',
    tip: 'Each file should be under the size limit shown on the portal (usually 1 to 2 MB). Use a scan, not a phone photo, for best clarity.',
  },
  {
    title: 'Submit and lock the application',
    detail:
      'Verify every entry and submit before the deadline. After submission you will receive a PDF acknowledgement. Print and keep it.',
    tip: 'Do not wait until the last day. The portal slows down near deadlines.',
  },
  {
    title: 'Online certificate verification at TFC',
    detail:
      'After registration closes, your uploaded certificates are verified online by the TFC you selected. Sports candidates attend in-person verification at Chennai. Watch your mobile for SMS updates.',
    tip: 'If a document is queried, you can re-upload it within the verification window. Check the portal daily during this phase.',
  },
  {
    title: 'Rank list & grievance',
    detail:
      'The combined merit rank list (Board /200 + NATA or JEE /200 = /400) is published on the portal. You get one week to file grievances if you spot an error.',
    tip: 'Recheck your category and special-category entries on the rank list, errors can affect your eligible seats.',
  },
  {
    title: 'Choice filling, allotment, confirmation',
    detail:
      'During each counselling round, fill college and branch choices in your priority order. Allotment runs based on rank, community, and choice. You then have 2 days to confirm with one of the 6 confirmation options.',
    tip: 'Order your choices honestly by preference, not by perceived chance. The system always tries to give you a higher choice in upward movement.',
  },
];

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'How to Apply for TNEA B.Arch 2026: Step-by-Step Guide',
    description:
      'Step-by-step TNEA B.Arch 2026 application guide for barch.tneaonline.org: account creation, application filling, fee payment, certificate upload, verification, rank list, choice filling.',
    keywords:
      'How to apply TNEA B.Arch 2026, TNEA registration steps, barch.tneaonline.org guide, TNEA application process, TNEA certificate upload',
    alternates: buildAlternates(locale, `/counseling/tnea-barch/${SPOKE}`),
  };
}

export default function HowToApplyPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);

  const howToSchema = generateHowToSchema({
    name: 'How to Apply for TNEA B.Arch 2026',
    description: 'Step-by-step guide to register, upload certificates, and complete TNEA B.Arch 2026 application at barch.tneaonline.org.',
    totalTime: 'PT60M',
    steps: STEPS.map((s) => ({ name: s.title, text: s.detail })),
  });

  return (
    <TneaSpokeShell
      locale={locale}
      spokeSlug={SPOKE}
      spokeChip="Application Guide"
      topicTitle="How to Apply for TNEA B.Arch 2026"
      topicSubtitle="A clean, step-by-step walkthrough of the official TNEA B.Arch portal at barch.tneaonline.org. Avoid the common mistakes that cause verification rejections."
      jsonLd={howToSchema}
      related={[
        { label: 'Eligibility & Documents', href: 'eligibility-documents' },
        { label: 'Important Dates 2026', href: 'important-dates' },
        { label: 'Counselling Procedure', href: 'counselling-procedure' },
      ]}
      aintraSuggestions={[
        'Where do I register?',
        'What if my name does not match?',
        'Can I edit after submitting?',
        'Payment failed, what to do?',
      ]}
      prefillCallbackNotes="Need help with TNEA B.Arch application steps"
    >
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 3 }}>
        <Button
          variant="contained"
          size="large"
          href="https://barch.tneaonline.org"
          target="_blank"
          rel="noopener"
          endIcon={<OpenInNewIcon />}
          sx={{ minHeight: 48 }}
        >
          Open barch.tneaonline.org
        </Button>
        <Button
          variant="outlined"
          size="large"
          href="https://www.dte.tn.gov.in"
          target="_blank"
          rel="noopener"
          endIcon={<OpenInNewIcon />}
          sx={{ minHeight: 48 }}
        >
          DTE official site
        </Button>
      </Stack>

      <Alert
        severity="warning"
        icon={<WarningAmberIcon />}
        sx={{ mb: 3, borderRadius: 1.5 }}
      >
        Common rejection reasons: name mismatch across certificates, wrong nativity certificate format (only e-Certificate accepted), blurry uploads, community certificate dated after registration close.
      </Alert>

      <Stack spacing={2}>
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
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
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
    </TneaSpokeShell>
  );
}

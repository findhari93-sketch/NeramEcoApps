import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import {
  Box,
  Paper,
  Typography,
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Stack,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { buildAlternates } from '@/lib/seo/metadata';
import { generateFAQSchema } from '@/lib/seo/schemas';
import TneaSpokeShell from '@/components/tnea-barch/TneaSpokeShell';
import { faqs, type FaqCategory } from '@/data/tnea-barch-2026';

const SPOKE = 'faq';

const CATEGORY_LABELS: Record<FaqCategory, string> = {
  general: 'General',
  eligibility: 'Eligibility',
  documents: 'Documents',
  reservation: 'Reservation',
  fees: 'Fees & Concession',
  counselling: 'Counselling',
  tfcs: 'TFCs',
  special: 'Special Categories',
  nata_jee: 'NATA / JEE Paper-2',
};

const CATEGORY_ORDER: FaqCategory[] = [
  'general',
  'eligibility',
  'nata_jee',
  'reservation',
  'fees',
  'counselling',
  'documents',
  'tfcs',
  'special',
];

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'TNEA B.Arch 2026 FAQ: Eligibility, Reservation, Counselling, TFCs',
    description:
      'Answers to the most common questions about TNEA B.Arch 2026: eligibility, reservation categories, counselling rounds, TFC list, fee concession, and document upload.',
    keywords:
      'TNEA B.Arch FAQ 2026, TNEA questions, TNEA B.Arch doubts, TNEA counselling FAQ, TNEA reservation FAQ, TNEA upward movement, TNEA confirmation options',
    alternates: buildAlternates(locale, `/counseling/tnea-barch/${SPOKE}`),
  };
}

export default function FaqPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);

  const faqSchema = generateFAQSchema(faqs.map((f) => ({ question: f.question, answer: f.answer })));

  const grouped: Record<FaqCategory, typeof faqs> = {
    general: [],
    eligibility: [],
    documents: [],
    reservation: [],
    fees: [],
    counselling: [],
    tfcs: [],
    special: [],
    nata_jee: [],
  };
  faqs.forEach((f) => grouped[f.category].push(f));

  return (
    <TneaSpokeShell
      locale={locale}
      spokeSlug={SPOKE}
      spokeChip="FAQ"
      topicTitle="TNEA B.Arch 2026 Frequently Asked Questions"
      topicSubtitle="Quick answers to the questions students ask most. Use the topic anchors to jump to a section."
      jsonLd={faqSchema}
      related={[
        { label: 'Eligibility & Documents', href: 'eligibility-documents' },
        { label: 'Counselling Procedure', href: 'counselling-procedure' },
        { label: 'TFC Locator', href: 'tfc-list' },
      ]}
      aintraSuggestions={[
        'Is NATA mandatory?',
        'How does upward movement work?',
        'TFC near my district?',
        'Fee concession eligibility?',
      ]}
    >
      {/* Topic anchors */}
      <Paper
        elevation={0}
        sx={{ p: 1.5, mb: 3, borderRadius: 2, bgcolor: 'grey.50', border: '1px solid', borderColor: 'divider' }}
      >
        <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ display: 'block', mb: 0.75 }}>
          On this page
        </Typography>
        <Stack direction="row" gap={0.5} flexWrap="wrap">
          {CATEGORY_ORDER.filter((c) => grouped[c].length > 0).map((c) => (
            <Box
              key={c}
              component="a"
              href={`#${c}`}
              sx={{
                px: 1.25,
                py: 0.5,
                borderRadius: 999,
                fontSize: '0.75rem',
                fontWeight: 600,
                textDecoration: 'none',
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'divider',
                color: 'text.primary',
                '&:hover': { borderColor: 'primary.main', color: 'primary.main' },
              }}
            >
              {CATEGORY_LABELS[c]} ({grouped[c].length})
            </Box>
          ))}
        </Stack>
      </Paper>

      {CATEGORY_ORDER.filter((c) => grouped[c].length > 0).map((c) => (
        <Box key={c} id={c} sx={{ mb: 4, scrollMarginTop: 80 }}>
          <Typography variant="h6" component="h2" fontWeight={800} sx={{ mb: 1.5 }}>
            {CATEGORY_LABELS[c]}
          </Typography>
          {grouped[c].map((faq) => (
            <Accordion
              key={faq.id}
              elevation={0}
              disableGutters
              sx={{
                mb: 1,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: '8px !important',
                '&:before': { display: 'none' },
                overflow: 'hidden',
              }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle2" fontWeight={700}>
                  {faq.question}
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0 }}>
                <Typography variant="body2" color="text.secondary">
                  {faq.answer}
                </Typography>
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      ))}
    </TneaSpokeShell>
  );
}

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
import KeamSpokeShell from '@/components/keam-arch/KeamSpokeShell';
import { faqs, type FaqCategory } from '@/data/keam-arch-2026';

export const revalidate = 86400;

const SPOKE = 'faq';
const PRIMARY_GREEN = '#0d7a4a';

const CATEGORY_LABELS: Record<FaqCategory, string> = {
  general: 'General',
  eligibility: 'Eligibility',
  nata: 'NATA',
  application: 'Application',
  rank_list: 'Rank List',
  reservation: 'Reservation',
  fees: 'Fees & Concession',
  allotment: 'CAP Allotment',
  colleges: 'Colleges',
  nri: 'NRI',
};

const CATEGORY_ORDER: FaqCategory[] = [
  'general',
  'eligibility',
  'nata',
  'application',
  'rank_list',
  'reservation',
  'fees',
  'allotment',
  'colleges',
  'nri',
];

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'KEAM B.Arch 2026 FAQ: NATA, Eligibility, Reservation, CAP Allotment, Fees',
    description:
      'Answers to the most common questions about KEAM B.Arch 2026: NATA validity, 10+2 eligibility, rank formula, SEBC sub-categories, fee concession, CAP option registration, and college list. Each answer cites the prospectus clause.',
    keywords:
      'KEAM B.Arch FAQ 2026, KEAM Architecture questions, KEAM NATA FAQ, KEAM rank list FAQ, KEAM SEBC FAQ, KEAM allotment FAQ',
    alternates: buildAlternates(locale, `/counseling/keam-arch/${SPOKE}`),
  };
}

export default function FaqPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);

  const faqSchema = generateFAQSchema(faqs.map((f) => ({ question: f.question, answer: f.answer })));

  const grouped: Record<FaqCategory, typeof faqs> = {
    general: [],
    eligibility: [],
    nata: [],
    application: [],
    rank_list: [],
    reservation: [],
    fees: [],
    allotment: [],
    colleges: [],
    nri: [],
  };
  faqs.forEach((f) => grouped[f.category].push(f));

  return (
    <KeamSpokeShell
      locale={locale}
      spokeSlug={SPOKE}
      spokeChip="FAQ"
      topicTitle="KEAM B.Arch 2026 Frequently Asked Questions"
      topicSubtitle="Quick answers to the questions students ask most. Each answer cites the prospectus clause so you can verify in the official document."
      jsonLd={faqSchema}
      related={[
        { label: 'Eligibility & Documents', href: 'eligibility-documents' },
        { label: 'CAP Allotment Process', href: 'allotment-process' },
        { label: 'Colleges in Kerala', href: 'colleges-in-kerala' },
      ]}
      aintraSuggestions={[
        'Is NATA mandatory?',
        'How does CAP work?',
        'Income limit for fee waiver?',
        'Can I use NATA 2024?',
      ]}
    >
      {/* Topic anchors */}
      <Paper
        elevation={0}
        sx={{
          p: 1.5,
          mb: 3,
          borderRadius: 2,
          bgcolor: 'grey.50',
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Typography
          variant="caption"
          color="text.secondary"
          fontWeight={600}
          sx={{ display: 'block', mb: 0.75 }}
        >
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
                '&:hover': { borderColor: PRIMARY_GREEN, color: PRIMARY_GREEN },
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
                {faq.clause_ref && (
                  <Typography
                    variant="caption"
                    sx={{
                      color: PRIMARY_GREEN,
                      fontWeight: 600,
                      mt: 1,
                      display: 'block',
                    }}
                  >
                    Source: {faq.clause_ref}
                  </Typography>
                )}
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      ))}
    </KeamSpokeShell>
  );
}

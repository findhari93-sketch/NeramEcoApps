import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Box, Typography } from '@mui/material';
import ConceptArticleLayout from '@/components/counselling/ConceptArticleLayout';
import { buildAlternates } from '@/lib/seo/metadata';

export const revalidate = 604800;

const SLUG = 'josaa-vs-csab';
const TITLE = 'JoSAA vs CSAB: How They Differ and Why Accepting CSAB Cancels JoSAA';
const SUBTITLE =
  'JoSAA fills the prestige seats. CSAB picks up vacancies after. The two run separately, but accepting a CSAB seat after JoSAA cancels your JoSAA allotment, automatically and irreversibly.';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'JoSAA vs CSAB 2026: Difference, Three CSAB Verticals, Cancellation Rule',
    description:
      'JoSAA and CSAB explained: timing, scope, three CSAB verticals (Special, NEUT, Supernumerary), and the rule that accepting CSAB cancels your JoSAA seat irreversibly.',
    keywords: 'JoSAA vs CSAB, CSAB Special, CSAB-NEUT, CSAB Supernumerary, JoSAA seat cancellation CSAB, NIT vacancy filling',
    alternates: buildAlternates(locale, `/counseling/concepts/${SLUG}`),
    openGraph: {
      title: TITLE,
      description: SUBTITLE,
      url: `https://neramclasses.com/counseling/concepts/${SLUG}`,
      type: 'article',
    },
  };
}

const FAQS = [
  {
    question: 'Does CSAB include IITs?',
    answer: 'No. CSAB Special covers NITs, IIEST Shibpur, IIITs, SPAs, and GFTIs. IITs are JoSAA-only and do not appear in any CSAB vertical.',
  },
  {
    question: 'Can I keep my JoSAA seat AND get a CSAB seat?',
    answer: 'No. The moment you accept any CSAB Special allotment, your JoSAA seat is automatically cancelled. The cancellation cannot be reverted.',
  },
  {
    question: 'When does CSAB Special start?',
    answer: 'After JoSAA Round 6 closes. For 2026, expected late July or early August. CSAB Special runs three rounds, typically over three to four weeks.',
  },
  {
    question: 'Are CSAB Special, CSAB-NEUT, and CSAB-Supernumerary the same thing?',
    answer: 'No. CSAB Special fills NIT-system vacancies for all India candidates. CSAB-NEUT covers Northeast and UTs candidates for cross-state seats. CSAB-Supernumerary serves UTs without their own NIT (A&N, Lakshadweep, DD, DNH).',
  },
  {
    question: 'What fees does CSAB Special charge?',
    answer: '₹40,000 Special Round Enrolment Fee for General/OBC/EWS, ₹19,000 for SC/ST/PwD. Plus ₹35,000 (or ₹16,000 reserved) IAF-II after seat allotment. Total ~₹75,000 for General candidates.',
  },
  {
    question: 'Should I register for CSAB if I am happy with my JoSAA seat?',
    answer: 'No. Registering itself is fine, but if you are happy with JoSAA, do not pay CSAB seat acceptance fees. The risk is accidentally accepting a CSAB allotment, which cancels JoSAA. If your JoSAA seat is your final answer, just skip CSAB.',
  },
];

export default function Page({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);

  return (
    <ConceptArticleLayout
      slug={SLUG}
      title={TITLE}
      subtitle={SUBTITLE}
      publishedAt="2026-05-08"
      readingMinutes={7}
      tags={['JoSAA', 'CSAB', 'B.Arch']}
      faqs={FAQS}
      locale={locale}
    >
      <Typography component="h2">Two systems, one seat at a time</Typography>
      <Typography component="p">
        JoSAA (Joint Seat Allocation Authority) is the central counselling for B.Arch and B.Tech seats at IITs, NITs, IIEST Shibpur, SPAs, IIITs, and GFTIs. It runs six rounds, typically June through July.
      </Typography>
      <Typography component="p">
        CSAB (Central Seat Allocation Board) runs after JoSAA closes. It fills the seats that became vacant during JoSAA (because candidates withdrew, did not report, or did not pay the acceptance fee). CSAB does not cover IITs.
      </Typography>

      <Typography component="h2">Three CSAB verticals (commonly confused)</Typography>

      <Typography component="h3">CSAB Special</Typography>
      <Typography component="p">
        Three rounds, after JoSAA Round 6. Fills vacancies at NITs, IIEST Shibpur, IIITs, SPAs, and GFTIs. Open to all India candidates with a valid JEE Main Paper 2 B.Arch rank. Fees: ₹40,000 Enrolment + ₹35,000 IAF-II for General (₹19,000 + ₹16,000 for SC/ST/PwD).
      </Typography>

      <Typography component="h3">CSAB-NEUT</Typography>
      <Typography component="p">
        For 8 Northeast states (Arunachal, Assam, Manipur, Meghalaya, Mizoram, Nagaland, Sikkim, Tripura) and 5 Union Territories (A&N, DNH&DD, Lakshadweep, Ladakh). Allocates AICTE-approved seats outside the home state. About 3,000 total seats annually across courses, B.Arch is a small share.
      </Typography>

      <Typography component="h3">CSAB-Supernumerary</Typography>
      <Typography component="p">
        For UTs that lack their own NIT (A&N, Lakshadweep, Daman and Diu, Dadra and Nagar Haveli). Provides supernumerary seats at NIT Calicut, NIT Durgapur, and SVNIT Surat for these UT candidates.
      </Typography>

      <Typography component="h2">The cancellation rule that catches people out</Typography>
      <Typography component="p">
        This is the single most important rule and the one most aspirants miss:
      </Typography>
      <Box
        component="blockquote"
        sx={{ p: 2, borderRadius: 2, bgcolor: '#FFF3E0', border: '1px solid #FB8C00', my: 2 }}
      >
        <Typography component="p" sx={{ mb: 0, fontWeight: 600 }}>
          If you currently hold a JoSAA seat and accept ANY CSAB Special allotment, your JoSAA seat is automatically cancelled. The cancellation cannot be reverted.
        </Typography>
      </Box>
      <Typography component="p">
        Concretely: if you locked in NIT Trichy B.Arch through JoSAA Round 5 and then registered for CSAB hoping for SPA Delhi, getting any CSAB allotment (including a worse college than NIT Trichy) automatically removes you from NIT Trichy. There is no undo.
      </Typography>

      <Typography component="h2">Decision rule for CSAB Special</Typography>
      <Box component="ol">
        <Box component="li">
          <strong>If your JoSAA seat is your final answer,</strong> do not register for CSAB Special. The risk of accidental cancellation is not worth it.
        </Box>
        <Box component="li">
          <strong>If your JoSAA seat is acceptable but you would upgrade to specific institutes,</strong> register for CSAB but only choose those upgrade institutes in your CSAB preference list. If CSAB allots one of them, you upgrade. If not, no allotment, no cancellation.
        </Box>
        <Box component="li">
          <strong>If you have no JoSAA seat,</strong> CSAB is a clean second chance. Register and choose freely from the institutes you would attend.
        </Box>
        <Box component="li">
          <strong>If you have a JoSAA seat you do not want,</strong> CSAB is the right move. You are willing to give up the JoSAA seat for any reasonable upgrade.
        </Box>
      </Box>

      <Typography component="h2">Timing for 2026</Typography>
      <Typography component="ul">
        <Box component="li">JoSAA Round 1: mid-June 2026 (TBD)</Box>
        <Box component="li">JoSAA Round 6 (final): around July 20, 2026</Box>
        <Box component="li">CSAB Special starts: late July 2026</Box>
        <Box component="li">CSAB Special closes: late August 2026</Box>
      </Typography>

      <Typography component="h2">What CSAB does NOT include</Typography>
      <Typography component="ul">
        <Box component="li"><strong>IITs:</strong> JoSAA-only, IITs never participate in CSAB</Box>
        <Box component="li"><strong>State counsellings:</strong> TNEA, MHT-CET, KEAM, etc. are separate from CSAB</Box>
        <Box component="li"><strong>NATA-only colleges:</strong> CEPT University, KEAM Kerala, HSTES Haryana use NATA, CSAB uses JEE Paper 2</Box>
      </Typography>

      <Typography component="p">
        For the full list of CSAB Special participating institutes and the live 2026 schedule, refer to csab.nic.in. The CSAB-NEUT page at csab.nic.in/csab-neut covers Northeast and UTs.
      </Typography>
    </ConceptArticleLayout>
  );
}

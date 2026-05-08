import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Box, Typography } from '@mui/material';
import ConceptArticleLayout from '@/components/counselling/ConceptArticleLayout';
import { buildAlternates } from '@/lib/seo/metadata';

export const revalidate = 604800;

const SLUG = 'nata-vs-jee-paper-2';
const TITLE = 'NATA vs JEE Paper 2: Which Exam, Which Counselling, Best Strategy';
const SUBTITLE =
  'NATA is conducted by the Council of Architecture. JEE Main Paper 2 is conducted by NTA. Different syllabus, different acceptance, different timing. Most aspirants should give both.';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'NATA vs JEE Main Paper 2 2026: Difference, State Acceptance, Strategy',
    description:
      'NATA vs JEE Main Paper 2 explained: who conducts each, syllabus difference, which counsellings accept which, dual-attempt strategy, validity rules, normalisation.',
    keywords: 'NATA vs JEE Paper 2, JEE Paper 2A B.Arch, NATA exam, NATA validity, JEE Main Paper 2 NATA, dual entrance B.Arch',
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
    question: 'Should I take both NATA and JEE Paper 2?',
    answer: 'For most aspirants, yes. Submitting both maximises the counsellings you can apply to. The exception is if you only want JoSAA (NIT/IIT/SPA) which uses JEE Paper 2 only, or only KEAM Kerala / HSTES Haryana which use NATA only.',
  },
  {
    question: 'Which counsellings accept NATA only?',
    answer: 'KEAM (Kerala), HSTES (Haryana), DTE Goa, CEPT University. JEE Paper 2 alone is not accepted at these.',
  },
  {
    question: 'Which counsellings accept JEE Paper 2 only?',
    answer: 'JoSAA (NIT/IIT/SPA), CSAB Special, JAC Delhi, JAC Chandigarh, CSAB-NEUT. NATA alone is not accepted at these.',
  },
  {
    question: 'How long is NATA score valid?',
    answer: 'Typically two academic years. NATA 2025 was valid for 2025-26 and 2026-27 admissions. Some states accept the best of multiple attempts. Confirm in each counselling brochure.',
  },
  {
    question: 'Are NATA and JEE Paper 2 syllabi the same?',
    answer: 'There is overlap (Mathematics, General Aptitude, drawing). NATA emphasises drawing more, JEE Paper 2 emphasises drawing less but tests Aptitude and Drawing alongside Mathematics in a more academic format.',
  },
  {
    question: 'Can I take JEE Paper 2 multiple times in a year?',
    answer: 'JEE Main Paper 2 is offered in two sessions per year (typically January and April). The better score is used for B.Arch admission. NATA has multiple phases per cycle (typically 2 to 3) and best-of can apply per state.',
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
      readingMinutes={6}
      tags={['NATA', 'JEE Paper 2', 'B.Arch entrance']}
      faqs={FAQS}
      locale={locale}
    >
      <Typography component="h2">Two exams, two examining bodies</Typography>
      <Typography component="p">
        NATA (National Aptitude Test in Architecture) is conducted by the Council of Architecture, the statutory regulator for architecture education in India. JEE Main Paper 2A (B.Arch) is conducted by the National Testing Agency (NTA) under the Ministry of Education. They test similar territory but for different audiences.
      </Typography>

      <Typography component="h2">Acceptance map: which exam works where</Typography>

      <Typography component="h3">NATA only</Typography>
      <Typography component="ul">
        <Box component="li"><strong>KEAM (Kerala)</strong>: NATA is the only entrance, JEE Paper 2 not accepted</Box>
        <Box component="li"><strong>HSTES (Haryana)</strong>: NATA mandatory for state quota</Box>
        <Box component="li"><strong>DTE Goa</strong>: NATA only</Box>
        <Box component="li"><strong>CEPT University Ahmedabad</strong>: NATA mandatory, JEE Paper 2 not accepted</Box>
      </Typography>

      <Typography component="h3">JEE Paper 2 only</Typography>
      <Typography component="ul">
        <Box component="li"><strong>JoSAA</strong>: JEE Main Paper 2 (NITs/SPAs) or JEE Advanced + AAT (IITs)</Box>
        <Box component="li"><strong>CSAB Special</strong>: JEE Main Paper 2 only</Box>
        <Box component="li"><strong>JAC Delhi</strong>: JEE Main Paper 2 only (NATA not accepted)</Box>
        <Box component="li"><strong>JAC Chandigarh</strong>: JEE Main Paper 2 only (NATA not accepted)</Box>
        <Box component="li"><strong>CSAB-NEUT</strong>: JEE Main Paper 2 plus NE/UT domicile</Box>
      </Typography>

      <Typography component="h3">Both NATA and JEE Paper 2 accepted</Typography>
      <Typography component="ul">
        <Box component="li"><strong>TNEA (Tamil Nadu)</strong>: best-of-both</Box>
        <Box component="li"><strong>MHT-CET CAP (Maharashtra)</strong>: separate inter-se merit lists</Box>
        <Box component="li"><strong>KEA (Karnataka)</strong>: best-of-both</Box>
        <Box component="li"><strong>ACPC (Gujarat)</strong>: best-of-both</Box>
        <Box component="li"><strong>AP B.Arch, TG B.Arch</strong>: NATA or JEE Paper 2</Box>
        <Box component="li"><strong>UPTAC (Uttar Pradesh)</strong>: NATA priority, JEE Paper 2 secondary</Box>
        <Box component="li"><strong>WBJEE, OJEE, REAP, DTE-MP, IKGPTU</strong>: NATA or JEE Paper 2</Box>
      </Typography>

      <Typography component="h2">Format and frequency</Typography>

      <Typography component="h3">NATA</Typography>
      <Typography component="p">
        Two to three phases per cycle (typically April, June, July). Each phase is a 3-hour computer-based test with a drawing component. Total marks 200, no negative marking. NATA evaluates Mathematics, General Aptitude, Logical Reasoning, and Drawing/Composition.
      </Typography>

      <Typography component="h3">JEE Main Paper 2A (B.Arch)</Typography>
      <Typography component="p">
        Two sessions per year (January and April). 3-hour test with three parts: Mathematics (computer-based, 25 questions), Aptitude Test (computer-based, 50 questions), and Drawing Test (pen and paper, 2 questions). Total marks 400. Negative marking on Mathematics and Aptitude (-1 for wrong, +4 for correct).
      </Typography>

      <Typography component="h2">Strategy for 2026 aspirants</Typography>

      <Typography component="h3">If your goal is JoSAA (NIT/IIT/SPA)</Typography>
      <Typography component="p">
        JEE Main Paper 1 + Paper 2 is mandatory. Add JEE Advanced + AAT if IIT B.Arch is on the table. NATA is not strictly needed but useful as a backup if your JEE Paper 2 result disappoints.
      </Typography>

      <Typography component="h3">If your goal is a state hub like TNEA, MHT-CET, KEA, ACPC, AP, TG, UPTAC</Typography>
      <Typography component="p">
        Take both NATA and JEE Main Paper 2. Most state counsellings use best-of-both. Maharashtra has separate merit lists, so both scores compete in their respective lists independently. Submitting both raises your floor.
      </Typography>

      <Typography component="h3">If your goal is KEAM Kerala or CEPT University</Typography>
      <Typography component="p">
        NATA is mandatory. JEE Paper 2 alone will not work. Focus on NATA and Class 12 marks. CEPT specifically uses 50:50 NATA + Class 12.
      </Typography>

      <Typography component="h3">If you do not know yet</Typography>
      <Typography component="p">
        Take both. The cost (registration fees plus prep time) is offset by the optionality. Lock in your top NATA phase for the result, then take JEE Paper 2 in either January or April (or both) sessions.
      </Typography>

      <Typography component="h2">Validity rules</Typography>
      <Typography component="ul">
        <Box component="li"><strong>NATA validity:</strong> Two academic years (NATA 2025 valid for 2025-26 and 2026-27)</Box>
        <Box component="li"><strong>JEE Main Paper 2 validity:</strong> Same admission cycle only (JEE Main 2026 for 2026-27)</Box>
        <Box component="li"><strong>Multi-attempt:</strong> NATA allows multiple phase attempts in a cycle, best score is used. JEE Main allows two sessions per year, better score is used.</Box>
      </Typography>

      <Typography component="h2">Normalisation in merit calculation</Typography>
      <Typography component="p">
        Different counsellings normalise NATA and JEE Paper 2 differently. Maharashtra runs separate merit lists (no normalisation needed because they do not compete). Tamil Nadu, Karnataka, Gujarat, AP, TG normalise both to a common scale and use best-of-both. Always read the specific counselling brochure to understand how your scores will be converted.
      </Typography>

      <Typography component="p">
        For 2026 cycles, NATA and JEE Main schedules are confirmed. JEE Advanced is on May 17, AAT on June 4. Most NATA phases run April through July. Plan exam attempts and counselling registrations across both windows.
      </Typography>
    </ConceptArticleLayout>
  );
}

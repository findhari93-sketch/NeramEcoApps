import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Box, Typography } from '@mui/material';
import ConceptArticleLayout from '@/components/counselling/ConceptArticleLayout';
import { buildAlternates } from '@/lib/seo/metadata';

export const revalidate = 604800;

const SLUG = 'freeze-float-slide';
const TITLE = 'Freeze vs Float vs Slide: JoSAA B.Arch Choice Decoded';
const SUBTITLE =
  'In every JoSAA round you must choose Freeze, Float, or Slide. The wrong choice can cost you your dream institute or lose the seat entirely. Here is how to think about it.';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'Freeze vs Float vs Slide JoSAA 2026: B.Arch Decision Matrix',
    description:
      'JoSAA Freeze vs Float vs Slide explained for B.Arch: when to lock, when to upgrade institute, when to upgrade branch in same institute. Worked examples and Round 6 rule.',
    keywords: 'freeze float slide JoSAA, JoSAA float vs freeze, JoSAA B.Arch decision, slide same institute, JoSAA Round 6 freeze only',
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
    question: 'What is the safest choice if I am happy with my current allotment?',
    answer:
      'Freeze. It locks your seat and you stop participating in further rounds. You will not lose this seat. Use Freeze only when you are confident you will accept this institute and branch.',
  },
  {
    question: 'Will Float ever leave me without a seat?',
    answer:
      'No. Float keeps your current seat as a minimum. If a higher preference is allotted, you upgrade. If nothing higher comes up, you keep what you have. The only way to lose a seat is to skip reporting or fail to pay the acceptance fee.',
  },
  {
    question: 'Should I always Float in early rounds?',
    answer:
      'Float makes sense if your current allotment is acceptable and you have higher preferences you would actually attend. If you are happy with the current institute but want a better branch in the same institute, choose Slide instead. If your preference list above the current allotment includes choices you would not actually attend, Freeze is safer.',
  },
  {
    question: 'What changes in Round 6?',
    answer:
      'Round 6 only allows Freeze. You cannot Float or Slide. This is the final round, so JoSAA needs each candidate to lock the seat. Plan your Float and Slide strategy in Rounds 1 to 5 with this constraint in mind.',
  },
  {
    question: 'Difference between Float and Slide in one line?',
    answer:
      'Float: try for any higher-preference institute or branch. Slide: try for a higher-preference branch only within your current institute.',
  },
  {
    question: 'Can I change Float to Freeze in the next round?',
    answer:
      'Yes. Each round lets you re-choose. You can switch from Float to Freeze if you change your mind, as long as you do so within the response window of that round.',
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
      tags={['JoSAA', 'B.Arch', 'Decision matrix']}
      faqs={FAQS}
      locale={locale}
    >
      <Typography component="h2">The three choices, in one minute</Typography>
      <Typography component="p">
        After every JoSAA round, the system asks each allotted candidate one question: do you Freeze, Float, or Slide your seat? The answer changes what happens in the next round. Here is what each option does.
      </Typography>

      <Typography component="h3">Freeze</Typography>
      <Typography component="p">
        Freeze locks your current allotment. You stop participating in further rounds. The seat is yours subject to acceptance fee payment and reporting. Use Freeze only when you are sure this institute and this branch are the final answer.
      </Typography>

      <Typography component="h3">Float</Typography>
      <Typography component="p">
        Float keeps your current seat as a minimum and tries for any higher preference (different institute or different branch) from your locked choice list. The next round will either upgrade you or leave you with the current allotment. You never lose the current seat by floating.
      </Typography>

      <Typography component="h3">Slide</Typography>
      <Typography component="p">
        Slide is more conservative than Float. It tries for higher preference branches only within your current institute. If you love SPA Delhi but got Architecture and would prefer Planning at SPA Delhi, Slide. You will not be moved to a different institute through Slide.
      </Typography>

      <Typography component="h2">Worked example: a real candidate</Typography>
      <Typography component="p">
        Imagine a candidate ranked CRL 350 with this preference order:
      </Typography>
      <Box component="ol">
        <Box component="li">SPA Delhi B.Arch</Box>
        <Box component="li">NIT Calicut B.Arch</Box>
        <Box component="li">NIT Trichy B.Arch</Box>
        <Box component="li">VNIT Nagpur B.Arch</Box>
      </Box>

      <Typography component="p">
        After Round 1, the candidate is allotted NIT Calicut B.Arch (preference 2). What now?
      </Typography>

      <Typography component="h3">If they Freeze</Typography>
      <Typography component="p">
        They keep NIT Calicut. They cannot get SPA Delhi even if a vacancy opens up later. Safe but caps the upside.
      </Typography>

      <Typography component="h3">If they Float</Typography>
      <Typography component="p">
        They try for SPA Delhi (preference 1) in subsequent rounds. NIT Calicut is the floor. If SPA Delhi opens up due to other candidates withdrawing, they upgrade. If not, they keep NIT Calicut.
      </Typography>

      <Typography component="h3">If they Slide</Typography>
      <Typography component="p">
        Slide does not help here because there is no higher-preference NIT Calicut option in their list. Slide would matter if their list had multiple branches at the same institute and the current allotment was a lower-preference branch there.
      </Typography>

      <Typography component="p">
        Float is usually the right answer when you have a strict preference order and you would attend any of the preferred options above your current allotment. Freeze when current is acceptable and you would not actually attend the higher options. Slide when you want a different branch at the same institute.
      </Typography>

      <Typography component="h2">The Round 6 trap</Typography>
      <Typography component="p">
        Round 6 only allows Freeze. You cannot Float or Slide in the final round. This means: any upgrade you wanted has to happen in Rounds 1 through 5. If you Float into Round 6 still hoping for an upgrade, you will be locked into whatever you currently hold. Plan your strategy with this constraint, especially for borderline candidates targeting top SPAs and NITs.
      </Typography>

      <Typography component="h2">Common mistakes</Typography>
      <Box component="ul">
        <Box component="li">
          <strong>Freezing too early.</strong> Locking in Round 1 forfeits any chance to upgrade in later rounds. Unless you are absolutely certain, Float gives you the option to upgrade without losing what you hold.
        </Box>
        <Box component="li">
          <strong>Floating without a clean preference list.</strong> If your locked choice list includes institutes you would never actually attend, Float can move you into one of them and trap you.
        </Box>
        <Box component="li">
          <strong>Confusing Slide with Float.</strong> Slide is institute-internal only. Use it for branch upgrades within the same institute.
        </Box>
        <Box component="li">
          <strong>Not changing strategy across rounds.</strong> You can re-decide each round. A Float in Round 1 can become a Freeze in Round 3 if you change your mind.
        </Box>
      </Box>

      <Typography component="h2">Decision flow</Typography>
      <Box
        component="blockquote"
        sx={{ p: 2, borderRadius: 2, bgcolor: 'grey.50', border: '1px solid', borderColor: 'grey.200' }}
      >
        <Typography component="p" sx={{ mb: 1 }}><strong>Are you happy with this institute AND this branch?</strong></Typography>
        <Typography component="p" sx={{ mb: 1, pl: 2 }}>Yes, completely → Freeze</Typography>
        <Typography component="p" sx={{ mb: 1, pl: 2 }}>Same institute, want a better branch → Slide</Typography>
        <Typography component="p" sx={{ mb: 0, pl: 2 }}>Want a higher-preference institute or branch → Float</Typography>
      </Box>
    </ConceptArticleLayout>
  );
}

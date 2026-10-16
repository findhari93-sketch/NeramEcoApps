import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import SwapVertOutlinedIcon from '@mui/icons-material/SwapVertOutlined';
import ConceptArticleLayout from '@/components/counselling/ConceptArticleLayout';
import { GuideList, GuideP, GuideStack } from '@/components/exam-hub/sections/GuideBlocks';
import { buildAlternates } from '@/lib/seo/metadata';
import { ArticleSection, DataTable, InfoCard } from '@/design-system';

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
      <ArticleSection
        id="three-choices"
        title="The three choices, in one minute"
        intro="After every JoSAA round, the system asks each allotted candidate one question: do you Freeze, Float, or Slide your seat? The answer changes what happens in the next round. Here is what each option does."
      >
        <GuideStack>
          <InfoCard
            icon={<LockOutlinedIcon />}
            title="Freeze"
            body="Freeze locks your current allotment. You stop participating in further rounds. The seat is yours subject to acceptance fee payment and reporting. Use Freeze only when you are sure this institute and this branch are the final answer."
          />
          <InfoCard
            icon={<TrendingUpOutlinedIcon />}
            title="Float"
            body="Float keeps your current seat as a minimum and tries for any higher preference (different institute or different branch) from your locked choice list. The next round will either upgrade you or leave you with the current allotment. You never lose the current seat by floating."
          />
          <InfoCard
            icon={<SwapVertOutlinedIcon />}
            title="Slide"
            body="Slide is more conservative than Float. It tries for higher preference branches only within your current institute. If you love SPA Delhi but got Architecture and would prefer Planning at SPA Delhi, Slide. You will not be moved to a different institute through Slide."
          />
        </GuideStack>
      </ArticleSection>

      <ArticleSection
        id="worked-example"
        title="Worked example: a real candidate"
        intro="Imagine a candidate ranked CRL 350 with this preference order:"
      >
        <GuideList ordered items={['SPA Delhi B.Arch', 'NIT Calicut B.Arch', 'NIT Trichy B.Arch', 'VNIT Nagpur B.Arch']} />
        <GuideP>After Round 1, the candidate is allotted NIT Calicut B.Arch (preference 2). What now?</GuideP>
        <GuideStack>
          <InfoCard
            icon={<LockOutlinedIcon />}
            title="If they Freeze"
            body="They keep NIT Calicut. They cannot get SPA Delhi even if a vacancy opens up later. Safe but caps the upside."
          />
          <InfoCard
            icon={<TrendingUpOutlinedIcon />}
            title="If they Float"
            body="They try for SPA Delhi (preference 1) in subsequent rounds. NIT Calicut is the floor. If SPA Delhi opens up due to other candidates withdrawing, they upgrade. If not, they keep NIT Calicut."
          />
          <InfoCard
            icon={<SwapVertOutlinedIcon />}
            title="If they Slide"
            body="Slide does not help here because there is no higher-preference NIT Calicut option in their list. Slide would matter if their list had multiple branches at the same institute and the current allotment was a lower-preference branch there."
          />
        </GuideStack>
        <GuideP>
          Float is usually the right answer when you have a strict preference order and you would attend any of the preferred options above your current allotment. Freeze when current is acceptable and you would not actually attend the higher options. Slide when you want a different branch at the same institute.
        </GuideP>
      </ArticleSection>

      <ArticleSection
        id="round-6-trap"
        title="The Round 6 trap"
        intro="Round 6 only allows Freeze. You cannot Float or Slide in the final round. This means: any upgrade you wanted has to happen in Rounds 1 through 5. If you Float into Round 6 still hoping for an upgrade, you will be locked into whatever you currently hold. Plan your strategy with this constraint, especially for borderline candidates targeting top SPAs and NITs."
      />

      <ArticleSection id="common-mistakes" title="Common mistakes">
        <GuideList
          items={[
            <>
              <strong>Freezing too early.</strong> Locking in Round 1 forfeits any chance to upgrade in later rounds. Unless you are absolutely certain, Float gives you the option to upgrade without losing what you hold.
            </>,
            <>
              <strong>Floating without a clean preference list.</strong> If your locked choice list includes institutes you would never actually attend, Float can move you into one of them and trap you.
            </>,
            <>
              <strong>Confusing Slide with Float.</strong> Slide is institute-internal only. Use it for branch upgrades within the same institute.
            </>,
            <>
              <strong>Not changing strategy across rounds.</strong> You can re-decide each round. A Float in Round 1 can become a Freeze in Round 3 if you change your mind.
            </>,
          ]}
        />
      </ArticleSection>

      <ArticleSection id="decision-flow" title="Decision flow">
        <DataTable
          caption="Are you happy with this institute AND this branch?"
          columns={['Your answer', 'Choose']}
          rows={[
            ['Yes, completely', 'Freeze'],
            ['Same institute, want a better branch', 'Slide'],
            ['Want a higher-preference institute or branch', 'Float'],
          ]}
        />
      </ArticleSection>
    </ConceptArticleLayout>
  );
}

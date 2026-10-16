import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import ConceptArticleLayout from '@/components/counselling/ConceptArticleLayout';
import { GuideNote, GuideP } from '@/components/exam-hub/sections/GuideBlocks';
import { buildAlternates } from '@/lib/seo/metadata';
import { ArticleSection, CheckList, DataTable, StepList } from '@/design-system';

export const revalidate = 604800;

const SLUG = 'aat-explained';
const TITLE = 'AAT Explained: Pass-Fail, JEE Advanced AIR Drives IIT B.Arch Allotment';
const SUBTITLE =
  'AAT is the Architecture Aptitude Test. It is mandatory for any IIT B.Arch seat. But the score is Pass or Fail only, the actual allotment uses your JEE Advanced All India Rank.';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'AAT 2026 Explained: IIT B.Arch Pass-Fail Test, June 4 Date',
    description:
      'AAT 2026 (Architecture Aptitude Test) explained for IIT B.Arch: Pass-Fail mechanics, June 4 date, why JEE Advanced AIR drives final allotment (not AAT score), eligibility, format.',
    keywords: 'AAT 2026, AAT IIT B.Arch, AAT pass fail, JEE Advanced AAT, IIT Roorkee B.Arch, AAT June 4 2026, AAT eligibility',
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
    question: 'When is AAT 2026?',
    answer: 'AAT 2026 is on June 4, 2026. Results are released on June 7, 2026.',
  },
  {
    question: 'Is AAT a competitive exam or just a qualifying test?',
    answer: 'Just a qualifying test. AAT is Pass or Fail. Your AAT score does not influence your JoSAA rank or allotment. The allotment uses your JEE Advanced All India Rank.',
  },
  {
    question: 'Do I need AAT for NIT B.Arch?',
    answer: 'No. NITs and SPAs admit B.Arch via JEE Main Paper 2 score (no AAT needed). AAT is required only for IIT B.Arch (Roorkee, Kharagpur, BHU).',
  },
  {
    question: 'What if I clear JEE Advanced but skip AAT registration?',
    answer: 'You forfeit any IIT B.Arch chance. Even with a top JEE Advanced rank, without AAT registration AND a Pass result, IIT B.Arch is closed off. You can still get NIT/SPA B.Arch via JEE Main Paper 2.',
  },
  {
    question: 'How much does AAT cost?',
    answer: 'There is no separate AAT registration fee. JEE Advanced fee covers it for those who want to attempt AAT. You declare your AAT intention during JEE Advanced registration or just before.',
  },
  {
    question: 'Where is AAT conducted?',
    answer: 'At IIT Roorkee, IIT Kharagpur, IIT BHU, and IIT Guwahati centres. You choose your centre during AAT registration.',
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
      readingMinutes={5}
      tags={['AAT', 'JEE Advanced', 'IIT B.Arch']}
      faqs={FAQS}
      locale={locale}
    >
      <ArticleSection
        id="three-stage-pipeline"
        title="The three-stage pipeline for IIT B.Arch"
        intro="Getting into IIT B.Arch is a three-stage process. Skipping any stage closes off the IIT B.Arch route, even if you cleared the others."
      >
        <StepList
          columnMin={220}
          items={[
            {
              title: 'Stage 1: JEE Main Paper 1.',
              body: 'You need to qualify JEE Main Paper 1 to be eligible for JEE Advanced. The cutoff varies year to year, typically requires being in the top 2.5 lakh candidates.',
            },
            {
              title: 'Stage 2: JEE Advanced.',
              body: 'You need to clear JEE Advanced subject and aggregate cutoffs. For 2025, this was 35% aggregate for Open category, 31.5% for OBC and EWS, 17.5% for SC, ST, and PwD.',
            },
            {
              title: 'Stage 3: AAT.',
              body: 'Register for AAT, appear, get a Pass result. The actual allotment in JoSAA uses your JEE Advanced AIR.',
            },
          ]}
        />
      </ArticleSection>

      <ArticleSection
        id="what-aat-tests"
        title="What AAT actually tests"
        intro="AAT is a 3-hour pen-and-paper test. It assesses architectural aptitude across:"
      >
        <CheckList
          items={[
            { title: 'Freehand drawing:', body: 'Quick observational sketches from imagination or memory' },
            { title: 'Geometrical drawing:', body: 'Precise drafting of 2D and 3D forms' },
            { title: 'Three-dimensional perception:', body: 'Visualisation of forms from given views' },
            { title: 'Imagination and aesthetic sensitivity:', body: 'Composition, harmony, contrast tests' },
            { title: 'Architectural awareness:', body: 'Recognition of significant structures across history' },
          ]}
        />
        <GuideP>
          The exam is conducted physically at IIT Roorkee, Kharagpur, BHU, and Guwahati centres. Bring your own drawing instruments. The format has not changed materially in recent years.
        </GuideP>
      </ArticleSection>

      <ArticleSection
        id="pass-or-fail"
        title="Pass or Fail, that is it"
        intro="This is what trips up most aspirants. AAT is a qualifying test. There is no AAT score that helps your JoSAA rank. Either you clear AAT (and become eligible for IIT B.Arch through your JEE Advanced AIR) or you do not (and you cannot get any IIT B.Arch seat regardless of your Advanced rank)."
      >
        <GuideNote>
          <GuideP>
            <strong>
              Two candidates with the same JEE Advanced AIR who both Pass AAT have identical chances at IIT B.Arch. The AAT score itself does not differentiate them.
            </strong>
          </GuideP>
        </GuideNote>
      </ArticleSection>

      <ArticleSection
        id="why-it-matters"
        title="Why this matters strategically"
        intro="Because AAT is Pass or Fail, every candidate cleared for JEE Advanced who has any interest in IIT B.Arch should attempt AAT. The downside is a few hours and one trip to a centre. The upside is keeping the IIT B.Arch route open. Skipping AAT to focus only on B.Tech is a one-way door, you cannot come back to IIT B.Arch later."
      />

      <ArticleSection id="aat-2026-timeline" title="2026 AAT timeline">
        <DataTable
          caption="2026 AAT timeline"
          hideCaption
          columns={['Milestone', 'Date']}
          rows={[
            ['JEE Advanced 2026', 'May 17, 2026'],
            ['JEE Advanced result', 'June 2, 2026 (expected)'],
            ['AAT registration', 'June 2 to 3, 2026 (window of 24 to 48 hours)'],
            ['AAT 2026 exam', 'June 4, 2026'],
            ['AAT result', 'June 7, 2026'],
            ['JoSAA Round 1 starts', 'Mid June 2026'],
          ]}
        />
        <GuideP>
          The AAT registration window is short. If you cleared JEE Advanced, decide quickly whether to register. The default for any architecture-curious candidate should be: register, take the exam, do not foreclose the option.
        </GuideP>
      </ArticleSection>

      <ArticleSection id="iits-offering-barch" title="IITs that offer B.Arch through AAT">
        <DataTable
          caption="JEE Advanced closing ranks for IIT B.Arch"
          hideCaption
          columns={['IIT', 'JEE Advanced AIR (Open, Gender-Neutral, 2023 to 2025)']}
          rows={[
            ['IIT Roorkee', 'Roughly 17,600 to 20,800'],
            ['IIT Kharagpur', 'Roughly 19,000 to 23,400'],
            ['IIT (BHU) Varanasi', 'Roughly 20,700 to 24,700'],
          ]}
        />
        <GuideP muted>
          These are JEE Advanced ranks (not JEE Main Paper 2A ranks). Reserved-category closing ranks are lower. Check the live JoSAA B.Arch predictor for current cutoffs.
        </GuideP>
        <GuideP>
          Other IITs (Delhi, Bombay, Madras, Kanpur, Guwahati, Hyderabad, Mandi, Indore, etc.) do not offer B.Arch. The only path to B.Arch at any IIT is the JEE Advanced plus AAT route at one of the three IITs above.
        </GuideP>
      </ArticleSection>
    </ConceptArticleLayout>
  );
}

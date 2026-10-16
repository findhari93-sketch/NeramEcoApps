import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import ConceptArticleLayout from '@/components/counselling/ConceptArticleLayout';
import { GuideList, GuideNote, GuideP } from '@/components/exam-hub/sections/GuideBlocks';
import { buildAlternates } from '@/lib/seo/metadata';
import { ArticleSection, CheckList, DataTable } from '@/design-system';

export const revalidate = 604800;

const SLUG = 'eligibility-45-vs-50-rule';
const TITLE = 'B.Arch Eligibility: 45% vs 50% PCM Rule, Diploma Route, Single Board';
const SUBTITLE =
  'Council of Architecture\'s 2024 norm sets B.Arch eligibility at 45% PCM. Some state counsellings still apply 50%. Here is how the rules differ and what to confirm before applying.';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'B.Arch Eligibility 2026: 45% vs 50% PCM, Diploma Route, COA Norm',
    description:
      'B.Arch eligibility 2026: COA 2024 norm allows 45% PCM aggregate. Some states still apply 50%. Diploma with Maths qualifies. Single board issuance required. State-by-state notes.',
    keywords: 'B.Arch eligibility 2026, 45% PCM B.Arch, COA eligibility, B.Arch diploma route, single board issuance, 50% PCM B.Arch',
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
    question: 'What is the COA 2024 norm for B.Arch eligibility?',
    answer: '10+2 with Physics and Mathematics compulsory plus one more subject (Chemistry, CS, IP, Engineering Graphics, Biology, Business Studies, or Vocational), with 45% PCM aggregate. OR 10+3 Diploma with Mathematics, 45% to 50% aggregate.',
  },
  {
    question: 'Why do some counsellings still ask for 50%?',
    answer: 'State counsellings update their brochures separately from COA notifications. TNEA 2025, for example, was aligned with the 45% rule, but other states may still publish 50% in their 2026 brochure if they have not updated. Always read the live brochure for the counselling you are applying to.',
  },
  {
    question: 'Does the Diploma route work?',
    answer: 'Yes. A 10+3 recognised Diploma with Mathematics counts. Most counsellings ask for 45% to 50% aggregate on the diploma. Some institutes (like a few private deemed universities) prefer 10+2 candidates, verify per institute.',
  },
  {
    question: 'What does single board issuance mean?',
    answer: 'All your 10+2 marks must be from one recognised board. Mixing CBSE Class 11 with State Board Class 12 (or similar) typically does not count as a single qualifying examination, though some states have nuanced rules. Confirm in the specific counselling brochure.',
  },
  {
    question: 'Is Mathematics absolutely mandatory in 10+2?',
    answer: 'Yes. The Council of Architecture mandates Mathematics as a compulsory subject in 10+2 for B.Arch admission. There is no waiver. If you took Class 12 without Mathematics, you cannot pursue B.Arch through standard counsellings.',
  },
  {
    question: 'Can I take improvement exam to meet the 45% requirement?',
    answer: 'Yes, in most cases. A board-conducted improvement exam to raise your aggregate is generally accepted. Confirm timing: the result must be issued before the counselling registration deadline.',
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
      tags={['B.Arch eligibility', 'COA', 'PCM']}
      faqs={FAQS}
      locale={locale}
    >
      <ArticleSection
        id="coa-sets-the-floor"
        title="The Council of Architecture sets the floor"
        intro="The Council of Architecture (CoA) is the statutory regulator for architecture education in India. It sets the minimum eligibility for B.Arch admission across all CoA-recognised institutes. State counsellings cannot admit candidates below the CoA floor."
      >
        <GuideP>The current CoA 2024 norm, applicable for 2025 and 2026 admissions, is:</GuideP>
        <GuideNote>
          <GuideP>
            <strong>10+2 route:</strong> Physics and Mathematics compulsory plus one more (Chemistry, Biology, Computer Science, IP, Engineering Graphics, Business Studies, or Vocational), with <strong>45% PCM aggregate</strong>.
          </GuideP>
          <GuideP>
            <strong>Diploma route:</strong> 10+3 recognised Diploma with Mathematics, <strong>45% to 50% aggregate</strong> per the brochure.
          </GuideP>
        </GuideNote>
      </ArticleSection>

      <ArticleSection
        id="why-some-states-use-50"
        title="Why some states still use 50%"
        intro="State counsellings publish their brochures yearly. Some have already aligned with the 45% norm (TNEA 2025 brochure aligned with the COA 2024 norm of 45%). Others may continue to print 50% if their notification has not been updated. There is no central enforcement mechanism that pushes state brochures to update on a clock."
      >
        <GuideP>
          Practically: if you are at 45 to 49% PCM aggregate, you should apply to multiple counsellings rather than assume one rule. Verify the live 2026 brochure of each counselling before assuming eligibility.
        </GuideP>
      </ArticleSection>

      <ArticleSection
        id="diploma-route"
        title="The diploma route is real but underused"
        intro="Many aspirants assume B.Arch requires 10+2 with Physics, Chemistry, Mathematics. The CoA norm explicitly allows a 10+3 Diploma with Mathematics as an alternative. The Diploma must be recognised by an appropriate state authority (typically Polytechnic). The aggregate requirement is 45% to 50% depending on the counselling."
      >
        <GuideP>Practical use cases:</GuideP>
        <CheckList
          columnMin={600}
          items={[
            'Polytechnic students who completed a recognised 3-year diploma after Class 10',
            'Diploma holders considering a switch to architecture instead of lateral entry to engineering',
            'Students whose Class 12 PCM aggregate fell below 45% but whose subsequent Diploma cleared the threshold',
          ]}
        />
      </ArticleSection>

      <ArticleSection
        id="single-board-issuance"
        title="Single board issuance: a hidden gotcha"
        intro="Most counselling brochures ask that the qualifying examination certificate be issued by a single recognised board. Concretely:"
      >
        <DataTable
          caption="Which board combinations count as a single board"
          hideCaption
          columns={['Qualifying examination', 'Single board?']}
          rows={[
            ['CBSE Class 11 + CBSE Class 12', 'Single board'],
            ['CBSE Class 11 + State Board Class 12', 'Often disqualifies, even if both boards are recognised'],
            ['NIOS Class 12', 'Generally accepted as a single board'],
            ['Open Schooling Class 12', 'Acceptance varies by counselling, verify each brochure'],
          ]}
        />
        <GuideP>
          If you switched boards mid-school, contact the counselling helpline before applying. Some states allow transcript verification to establish equivalence, others are strict about a single board issuance.
        </GuideP>
      </ArticleSection>

      <ArticleSection id="state-by-state" title="State-by-state quick notes">
        <DataTable
          caption="B.Arch PCM requirement by counselling"
          hideCaption
          columns={['Counselling', 'PCM requirement']}
          rows={[
            ['TNEA Tamil Nadu', '45% PCM (per 2025 brochure aligned with COA 2024)'],
            ['KEAM Kerala', 'Typically 50%, verify 2026 brochure'],
            ['MHT-CET Maharashtra', '50% PCM (45% reserved Maharashtra-domiciled)'],
            ['JoSAA', '50% PCM aggregate plus Class 12 board pass certificate'],
            ['JAC Delhi, JAC Chandigarh', '50% PCM'],
            ['UPTAC', '50% PCM (45% reserved UP-domiciled)'],
          ]}
        />
        <GuideP>
          These percentages can shift by 2026. Treat them as 2025-cycle indicators, not 2026 commitments. Always verify the live 2026 brochure for the counselling you are targeting.
        </GuideP>
      </ArticleSection>

      <ArticleSection
        id="borderline"
        title="If you are at the borderline"
        intro="If your PCM aggregate is 45 to 50%, here is the practical play:"
      >
        <GuideList
          ordered
          items={[
            <>
              <strong>Apply to all counsellings that allow 45%</strong> (TNEA, JoSAA reserved categories, your home-state reserved category if applicable).
            </>,
            <>
              <strong>Take a board improvement exam</strong> if there is time before the counselling registration deadline. Aim to push your aggregate above 50%.
            </>,
            <>
              <strong>Consider the Diploma route</strong> if you have a recognised polytechnic diploma with Mathematics.
            </>,
            <>
              <strong>Plan for private institute admissions</strong> outside centralised counselling, some accept 45% even where state counselling demands 50%.
            </>,
          ]}
        />
        <GuideP>
          Bottom line: the COA 2024 norm is 45% PCM. State counsellings may apply 50%, but the floor is 45%. Build your application strategy with this asymmetry in mind.
        </GuideP>
      </ArticleSection>
    </ConceptArticleLayout>
  );
}

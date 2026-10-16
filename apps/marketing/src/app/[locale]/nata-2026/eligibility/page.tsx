import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema, generateFAQSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import { APP_URL } from '@/lib/seo/constants';
import { nataGuideNav, nataRelated } from '@/components/nata/guideNav';
import { ArticleSection, CheckList, CtaBand, CtaButton, FaqList, GuideArticle, InlineCta } from '@/design-system';


export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'NATA 2026 Eligibility Criteria: Who Can Apply?',
    description:
      'Complete NATA 2026 eligibility criteria for appearing in the exam and for B.Arch admission. Age limit, academic requirements, subject combinations, and category-wise details.',
    keywords:
      'NATA 2026 eligibility, NATA eligibility criteria, who can apply NATA, NATA age limit, NATA qualification, B.Arch eligibility',
    alternates: buildAlternates(locale, '/nata-2026/eligibility'),
  };
}

interface PageProps {
  params: { locale: string };
}

const appearCriteria = [
  'Passed or appearing in 10+2 examination with subjects specified by CoA.',
  'Passed or appearing in 10+3 Diploma examination with Mathematics as a subject.',
  'No minimum percentage required to appear for the NATA exam.',
  'No upper age limit to appear for NATA.',
  'Indian nationals, OCI, PIO holders, and foreign nationals are eligible.',
  'Qualifying in NATA does not guarantee admission. All eligibility criteria by respective authorities must be met.',
];

const admissionCriteria = [
  'Must have passed 10+2 with Physics and Mathematics as compulsory subjects.',
  'Along with Physics & Maths, must have one of: Chemistry, Biology, Technical Vocational subject, Computer Science, IT, Informatics Practices, Engineering Graphics, or Business Studies.',
  'Minimum 45% marks in aggregate in 10+2 (for all categories).',
  'OR passed 10+3 Diploma with Mathematics as compulsory subject with at least 45% aggregate.',
  'Must have a valid NATA score (no minimum raw score prescribed for 2026).',
  'Must qualify through NATA (conducted by CoA) or JEE (conducted by NTA).',
];

const faqs = [
  {
    question: 'Can I appear for NATA 2026 if I am in Class 12?',
    answer:
      'Yes, students appearing (currently studying) in Class 12 with the specified subjects are eligible to appear for NATA 2026. The final admission will be subject to passing 12th with the required marks and subjects.',
  },
  {
    question: 'Is there an age limit for NATA 2026?',
    answer:
      'There is no upper age limit to appear for NATA 2026.',
  },
  {
    question: 'Can Commerce or Arts students apply for NATA?',
    answer:
      'For B.Arch admission, you need Physics and Mathematics as compulsory subjects plus one from: Chemistry, Biology, Technical Vocational, CS, IT, Informatics Practices, Engineering Graphics, or Business Studies. Commerce students with Maths and Business Studies may be eligible.',
  },
  {
    question: 'What is the minimum percentage required in 12th for B.Arch admission?',
    answer:
      'To appear for NATA, there is no minimum percentage. For B.Arch admission, you need at least 45% marks in aggregate in 10+2 with the required subjects. The same 45% applies to all categories. For 10+3 Diploma, 45% with Mathematics is required.',
  },
];

export default function EligibilityPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);
  const baseUrl = 'https://neramclasses.com';
  const localeUrl = (path: string) => locale === 'en' ? `${baseUrl}${path}` : `${baseUrl}/${locale}${path}`;

  return (
    <>
      <JsonLd
        data={generateBreadcrumbSchema([
          { name: 'Home', url: localeUrl('') },
          { name: 'NATA 2026', url: localeUrl('/nata-2026') },
          { name: 'Eligibility' },
        ])}
      />
      <JsonLd data={generateFAQSchema(faqs)} />

      <GuideArticle
        breadcrumb={[{ name: 'Home', href: '/' }, { name: 'NATA 2026', href: '/nata-2026' }, { name: 'Eligibility' }]}
        eyebrow="NATA 2026 · Exam guide"
        title="NATA 2026 Eligibility Criteria"
        lede="To appear for NATA 2026, you must have passed or be appearing in 10+2 (or equivalent) with Mathematics as a subject. For B.Arch admission, additional marks criteria apply."
        verified="Updated March 13, 2026 · Source: Official NATA 2026 Brochure V1.0"
        nav={nataGuideNav('eligibility')}
        related={nataRelated(['how-to-apply', 'syllabus', 'fee-structure', 'scoring-and-results'])}
        back={{ label: 'Back to NATA 2026 guide', href: '/nata-2026' }}
      >
        <ArticleSection
          id="eligibility-to-appear"
          title="Eligibility to Appear for NATA"
          intro="These criteria determine who can sit for the NATA exam. Meeting these criteria does NOT automatically make you eligible for B.Arch admission."
        >
          <CheckList items={appearCriteria} columnMin={1000} />
        </ArticleSection>

        <ArticleSection
          id="barch-admission-eligibility"
          title="Eligibility for B.Arch Admission"
          intro="These criteria are for admission to B.Arch programs using NATA scores. They are more restrictive than the criteria to simply appear for the exam."
        >
          <CheckList items={admissionCriteria} columnMin={1000} />
        </ArticleSection>

        <InlineCta
          eyebrow="Free tool"
          icon={<FactCheckOutlinedIcon />}
          title="Not sure if you are eligible?"
          body="Use our free Eligibility Checker tool to instantly check your eligibility for NATA 2026."
          action={
            <CtaButton href={`${APP_URL}/tools/nata/eligibility-checker`} external>
              Check Eligibility (Free)
            </CtaButton>
          }
        />

        <ArticleSection id="faq" title="FAQs: NATA 2026 Eligibility">
          <FaqList items={faqs} defaultOpen={-1} />
        </ArticleSection>
      </GuideArticle>

      <CtaBand
        title="Prepare for NATA 2026 with Neram Classes"
        lede="Expert coaching, free tools, and personalized guidance."
        actions={
          <>
            <CtaButton href="/apply">Start Free Trial</CtaButton>
            <CtaButton variant="link" href="/nata-2026">
              Back to NATA 2026 Guide
            </CtaButton>
          </>
        }
      />
    </>
  );
}

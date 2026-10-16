import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema, generateFAQSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import { APP_URL } from '@/lib/seo/constants';
import { nataGuideNav, nataRelated } from '@/components/nata/guideNav';
import { ArticleSection, CtaBand, CtaButton, DataTable, FactGrid, FaqList, GuideArticle, InlineCta } from '@/design-system';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'NATA 2026 Exam Centers: State-Wise City List',
    description:
      'Complete list of NATA 2026 exam centers across India, organized state-wise. Find the nearest NATA exam center city for Part A (offline) and Part B (online).',
    keywords:
      'NATA 2026 exam centers, NATA exam center list, NATA center city wise, NATA 2026 test centers, NATA exam center near me',
    alternates: buildAlternates(locale, '/nata-2026/exam-centers'),
  };
}

interface PageProps {
  params: { locale: string };
}

const examCenters: Record<string, string[]> = {
  'Andhra Pradesh': ['Amaravati', 'Guntur', 'Kakinada', 'Kurnool', 'Nellore', 'Tirupati', 'Vijayawada', 'Visakhapatnam'],
  'Assam': ['Guwahati', 'Silchar'],
  'Bihar': ['Gaya', 'Muzaffarpur', 'Patna'],
  'Chhattisgarh': ['Bhilai', 'Raipur'],
  'Delhi': ['New Delhi'],
  'Goa': ['Panaji'],
  'Gujarat': ['Ahmedabad', 'Rajkot', 'Surat', 'Vadodara'],
  'Haryana': ['Faridabad', 'Gurugram', 'Karnal'],
  'Himachal Pradesh': ['Shimla'],
  'Jharkhand': ['Dhanbad', 'Jamshedpur', 'Ranchi'],
  'Karnataka': ['Bengaluru', 'Hubballi', 'Mangaluru', 'Mysuru'],
  'Kerala': ['Ernakulam', 'Kozhikode', 'Thiruvananthapuram', 'Thrissur'],
  'Madhya Pradesh': ['Bhopal', 'Gwalior', 'Indore', 'Jabalpur'],
  'Maharashtra': ['Aurangabad', 'Mumbai', 'Nagpur', 'Nashik', 'Pune'],
  'Meghalaya': ['Shillong'],
  'Odisha': ['Bhubaneswar', 'Rourkela'],
  'Punjab': ['Amritsar', 'Jalandhar', 'Ludhiana', 'Mohali'],
  'Rajasthan': ['Jaipur', 'Jodhpur', 'Udaipur'],
  'Tamil Nadu': ['Chennai', 'Coimbatore', 'Madurai', 'Salem', 'Tiruchirappalli'],
  'Telangana': ['Hyderabad', 'Warangal'],
  'Tripura': ['Agartala'],
  'Uttar Pradesh': ['Agra', 'Allahabad', 'Bareilly', 'Gorakhpur', 'Kanpur', 'Lucknow', 'Meerut', 'Noida', 'Varanasi'],
  'Uttarakhand': ['Dehradun', 'Roorkee'],
  'West Bengal': ['Durgapur', 'Kolkata', 'Siliguri'],
  'Chandigarh': ['Chandigarh'],
  'Jammu & Kashmir': ['Jammu', 'Srinagar'],
  'Puducherry': ['Puducherry'],
  'Outside India': ['Dubai (UAE)'],
};

const faqs = [
  {
    question: 'How many exam centers are there for NATA 2026?',
    answer:
      'NATA 2026 exam centers are spread across 100+ cities in India. The exact number may vary per attempt. You can select up to 4 preferred city choices during application.',
  },
  {
    question: 'Can I change my NATA exam center after applying?',
    answer:
      'City preference changes may be allowed during a specific window before the exam. However, once the appointment card is issued with the final center, changes are generally not permitted.',
  },
  {
    question: 'Are Part A and Part B conducted at the same center?',
    answer:
      'Yes, both Part A (offline drawing) and Part B (online MCQ/NCQ) are conducted at the same exam center on the same day. Part A is first (morning), followed by Part B.',
  },
  {
    question: 'Is NATA conducted outside India?',
    answer:
      'Yes, NATA 2026 has Dubai (UAE) as an international exam center. Candidates from outside India can appear at the Dubai center. The fee for candidates from outside India is Rs 15,000 per test.',
  },
];

export default function ExamCentersPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);
  const baseUrl = 'https://neramclasses.com';
  const localeUrl = (path: string) => locale === 'en' ? `${baseUrl}${path}` : `${baseUrl}/${locale}${path}`;
  const sortedStates = Object.keys(examCenters).sort();

  return (
    <>
      <JsonLd data={generateBreadcrumbSchema([{ name: 'Home', url: localeUrl('') }, { name: 'NATA 2026', url: localeUrl('/nata-2026') }, { name: 'Exam Centers' }])} />
      <JsonLd data={generateFAQSchema(faqs)} />

      <GuideArticle
        breadcrumb={[{ name: 'Home', href: '/' }, { name: 'NATA 2026', href: '/nata-2026' }, { name: 'Exam Centers' }]}
        eyebrow="NATA 2026 · Exam guide"
        title="NATA 2026 Exam Centers"
        lede="NATA 2026 exam centers are available in 80+ cities across 25+ states/UTs in India and Dubai (UAE). You can choose up to 4 preferred cities during registration. Here is the state-wise list of exam center cities."
        verified="Updated March 13, 2026 · Source: Official NATA 2026 Brochure V1.0"
        nav={nataGuideNav('exam-centers')}
        related={nataRelated(['how-to-apply', 'important-dates', 'dos-and-donts', 'fee-structure'])}
        back={{ label: 'Back to NATA 2026 guide', href: '/nata-2026' }}
      >
        <ArticleSection id="state-wise-centers" title="State-Wise Exam Center Cities">
          <FactGrid
            cellMin={160}
            items={[
              { label: 'States/UTs', value: sortedStates.length },
              { label: 'Cities', value: Object.values(examCenters).flat().length },
            ]}
          />
          <DataTable
            caption="NATA 2026 exam center cities by state or union territory"
            hideCaption
            columns={['State/UT', 'Exam center cities']}
            rows={sortedStates.map((state) => [
              <>
                {state}
                <br />
                <span style={{ fontWeight: 400, fontSize: '0.8125rem' }}>
                  ({examCenters[state].length} {examCenters[state].length === 1 ? 'city' : 'cities'})
                </span>
              </>,
              examCenters[state].join(', '),
            ])}
          />
        </ArticleSection>

        <InlineCta
          eyebrow="Free tool"
          icon={<MapOutlinedIcon />}
          title="Find Your Nearest Exam Center"
          body="Use our free Exam Centers tool with interactive maps and center details."
          action={
            <CtaButton href={`${APP_URL}/tools/nata/exam-centers`} external>
              Open Exam Centers Tool (Free)
            </CtaButton>
          }
        />

        <ArticleSection id="faq" title="FAQs: NATA 2026 Exam Centers">
          <FaqList items={faqs} defaultOpen={-1} />
        </ArticleSection>
      </GuideArticle>

      <CtaBand
        title="Prepare for NATA 2026 with Neram Classes"
        lede="Expert coaching and free tools for NATA preparation."
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

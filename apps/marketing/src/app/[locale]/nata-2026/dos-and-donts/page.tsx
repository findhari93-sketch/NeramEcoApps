import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Box } from '@neram/ui';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema, generateFAQSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import { nataGuideNav, nataRelated } from '@/components/nata/guideNav';
import { ArticleSection, CheckList, CtaBand, CtaButton, FaqList, GuideArticle, tokens } from '@/design-system';


export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: "NATA 2026 Exam Day Do's and Don'ts",
    description:
      "Complete NATA 2026 exam day do's and don'ts. What to bring, what NOT to bring, timing rules, malpractice warnings, and tips for a smooth exam experience.",
    keywords:
      "NATA 2026 dos and donts, NATA exam day rules, NATA what to bring, NATA exam tips, NATA 2026 exam day instructions",
    alternates: buildAlternates(locale, '/nata-2026/dos-and-donts'),
  };
}

interface PageProps {
  params: { locale: string };
}

const dos = [
  'Carry your appointment card (printed) to the exam center.',
  'Carry a valid government photo ID (Aadhaar, Passport, PAN, Voter ID).',
  'Bring your own drawing materials: pencils (HB/2B), erasers, dry colors (color pencils, pastels, crayons), and a scale (up to 15 cm only).',
  'Report at the exam center by 9:00 AM (Session 1) or 12:30 PM (Session 2). Late entry cutoff is 10:15 AM / 1:45 PM.',
  'Wear comfortable clothes (avoid clothing with large logos or text).',
  'Carry a transparent water bottle.',
  'Read all Part A drawing questions carefully. You have 90 minutes for 3 questions.',
  'For Part B (online), attempt all 50 questions. No negative marking for MCQ or NCQ.',
  'Keep your drawing sheets and 3D composition materials clean.',
  'Follow all instructions from the invigilator regarding the 3D composition kit provided at the center.',
];

const donts = [
  'Do NOT carry mobile phones, smartwatches, or any electronic devices.',
  'Do NOT carry calculators (even basic ones).',
  'Do NOT bring printed or written notes, textbooks, or reference materials.',
  'Do NOT bring a geometry box, compass, set squares, protractor, or any instruments other than pencils, erasers, dry colors, and scale (up to 15 cm).',
  'Do NOT bring blades, cutters, or sharp instruments.',
  'Do NOT use erasing fluid (correction fluid/whitener) on drawing sheets.',
  'Do NOT communicate with other candidates during the exam.',
  'Do NOT leave the exam hall without permission from the invigilator.',
  'Do NOT attempt to copy or use unfair means. This leads to disqualification.',
  'Do NOT bring bags, wallets, or purses inside the exam hall.',
  'Do NOT write your name on the drawing sheet (use only the roll number).',
];

const faqs = [
  {
    question: 'Can I bring my own drawing sheets for NATA?',
    answer:
      'No, drawing sheets and base material for the 3D composition are provided by the exam center. You should NOT bring your own. You must bring only: pencils, erasers, dry colors (color pencils, pastels, crayons), and a scale up to 15 cm.',
  },
  {
    question: 'What happens if I arrive late for NATA exam?',
    answer:
      'Late entry is not allowed after the cutoff time. For Session 1, the late entry cutoff is 10:15 AM (exam starts 10:00 AM). For Session 2, the cutoff is 1:45 PM (exam starts 1:30 PM). If you arrive after the cutoff, you will not be permitted to take the exam and your fee will not be refunded.',
  },
  {
    question: 'Can I bring a geometry box or compass to NATA?',
    answer:
      'No. NATA 2026 explicitly prohibits geometry boxes, compasses, set squares, protractors, and blades. You are allowed ONLY pencils, erasers, dry colors (color pencils, pastels, crayons), and a scale up to 15 cm.',
  },
  {
    question: 'What if I get caught using unfair means in NATA?',
    answer:
      'Using unfair means (copying, carrying electronic devices, communicating with others) leads to immediate disqualification from the current attempt. Depending on severity, you may be banned from future attempts as well.',
  },
];


export default function DosAndDontsPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);
  const baseUrl = 'https://neramclasses.com';
  const localeUrl = (path: string) => locale === 'en' ? `${baseUrl}${path}` : `${baseUrl}/${locale}${path}`;

  return (
    <>
      <JsonLd data={generateBreadcrumbSchema([{ name: 'Home', url: localeUrl('') }, { name: 'NATA 2026', url: localeUrl('/nata-2026') }, { name: "Do's & Don'ts" }])} />
      <JsonLd data={generateFAQSchema(faqs)} />

      <GuideArticle
        breadcrumb={[{ name: 'Home', href: '/' }, { name: 'NATA 2026', href: '/nata-2026' }, { name: "Do's & Don'ts" }]}
        eyebrow="NATA 2026 · Exam guide"
        title="NATA 2026 Exam Day Do's and Don'ts"
        lede="On NATA exam day, carry your appointment card, photo ID, and drawing materials (pencils, erasers, dry colors, scale up to 15 cm). Do NOT bring mobile phones, geometry boxes, or electronic devices. Report by 9:00 AM (Session 1) or 12:30 PM (Session 2)."
        verified="Updated March 13, 2026 · Source: Official NATA 2026 Brochure V1.0"
        nav={nataGuideNav('dos-and-donts')}
        related={nataRelated(['exam-pattern', 'important-dates', 'exam-centers', 'photo-signature-requirements'])}
        back={{ label: 'Back to NATA 2026 guide', href: '/nata-2026' }}
      >
        <ArticleSection id="what-to-do" eyebrow="Do" title="What to Do">
          <CheckList items={dos} columnMin={600} />
        </ArticleSection>

        <ArticleSection id="what-not-to-do" eyebrow="Don't" title="What NOT to Do">
          <CheckList tone="no" columnMin={1000} items={donts} />
        </ArticleSection>

        <ArticleSection id="faq" title="FAQs: Exam Day Rules">
          <FaqList items={faqs} defaultOpen={-1} />
        </ArticleSection>
      </GuideArticle>

      <CtaBand
        title="Prepare for NATA 2026 with Neram Classes"
        lede="Be fully prepared for exam day with expert coaching."
        actions={
          <>
            <CtaButton href="/apply">Start Free Trial</CtaButton>
            <CtaButton variant="link" href="/demo-class">
              Book a free demo class
            </CtaButton>
          </>
        }
      />
    </>
  );
}

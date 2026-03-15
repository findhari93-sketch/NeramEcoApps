import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Box } from '@neram/ui';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  generateBreadcrumbSchema,
  generateFAQSchema,
} from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import {
  getActiveNataBrochures,
  getActiveNataFaqs,
  getActiveNataAnnouncements,
  getActiveNataBanners,
} from '@neram/database';

// Section components (client)
import HeroSection from '@/components/nata/sections/HeroSection';
import TopicNavigation from '@/components/nata/sections/TopicNavigation';
import WhatIsNataSection from '@/components/nata/sections/WhatIsNataSection';
import AtAGlanceSection from '@/components/nata/sections/AtAGlanceSection';
import FreeToolsSection from '@/components/nata/sections/FreeToolsSection';
import BrochureSection from '@/components/nata/sections/BrochureSection';
import AssistanceSection from '@/components/nata/sections/AssistanceSection';
import FaqSection from '@/components/nata/sections/FaqSection';
import CtaBanner from '@/components/nata/sections/CtaBanner';
import ContactSection from '@/components/nata/sections/ContactSection';
import LastUpdatedBadge from '@/components/nata/LastUpdatedBadge';

// ISR: Revalidate every hour since hub fetches dynamic data from Supabase
export const revalidate = 3600;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title:
      'NATA 2026 — Complete Exam Guide, Dates, Syllabus, Eligibility & Free Tools',
    description:
      'Everything about NATA 2026 exam — eligibility, syllabus, exam pattern, fee structure, exam centers, how to apply, cutoff calculator & free preparation tools.',
    keywords:
      'NATA 2026, NATA exam 2026, NATA eligibility, NATA syllabus, NATA exam pattern, NATA exam centers, NATA fee, NATA cutoff, NATA preparation, NATA guide',
    alternates: buildAlternates(locale, '/nata-2026'),
  };
}

interface PageProps {
  params: { locale: string };
}

const defaultFaqs = [
  {
    question: 'What is NATA 2026?',
    answer:
      'NATA (National Aptitude Test in Architecture) 2026 is a national-level entrance exam conducted by the Council of Architecture (CoA) for admission to B.Arch (Bachelor of Architecture) programs in India. It tests aptitude in drawing, observation, and critical thinking.',
  },
  {
    question: 'How many times can I attempt NATA 2026?',
    answer:
      'You can take up to 2 tests in Phase 1 (April–June 2026) or 1 test in Phase 2 (August 2026). You cannot appear in both phases. The best score among your attempts is considered for admission. Each test requires a separate fee payment.',
  },
  {
    question: 'What is the total marks for NATA 2026?',
    answer:
      'NATA 2026 is for 200 marks total. Part A (Drawing Test) is worth 80 marks and is conducted offline. Part B (MCQ/NCQ) is worth 120 marks and is conducted online in an adaptive format.',
  },
  {
    question: 'Is NATA 2026 online or offline?',
    answer:
      'NATA 2026 has two parts: Part A (Drawing Test, 80 marks) is conducted offline on paper, and Part B (MCQ/NCQ, 120 marks) is conducted online in a computer-based adaptive test format. Both parts are held on the same day.',
  },
  {
    question: 'What is the minimum qualifying score for NATA 2026?',
    answer:
      'NATA 2026 does not prescribe a minimum raw score for qualifying. Instead, Phase 1 uses percentile-based scoring calculated from all test-takers across both tests. Phase 2 uses raw marks. Admission eligibility depends on the participating institution\'s cutoff.',
  },
  {
    question: 'How long is the NATA 2026 score valid?',
    answer:
      'The NATA 2026 score is valid for 1 academic year (2026-2027 session only). However, valid NATA 2025 scores can also be used for 2026-27 admissions as per CoA rules.',
  },
];

export default async function Nata2026HubPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);

  const baseUrl = 'https://neramclasses.com';

  // Fetch dynamic content from Supabase (server-side)
  const [brochures, dbFaqs] = await Promise.all([
    getActiveNataBrochures(2026).catch(() => []),
    getActiveNataFaqs({ year: 2026, pageSlug: 'nata-2026-hub' }).catch(() => []),
    // Prefetch for potential future use
    getActiveNataAnnouncements(2026).catch(() => []),
    getActiveNataBanners('hub-hero').catch(() => []),
  ]);

  // Merge DB FAQs with defaults
  const dynamicFaqs = dbFaqs.map((faq) => ({
    question: faq.question[locale] || faq.question['en'] || '',
    answer: faq.answer[locale] || faq.answer['en'] || '',
  }));
  const faqs = dynamicFaqs.length > 0 ? dynamicFaqs : defaultFaqs;

  // Serialize brochure data for client components
  const serializedBrochures = brochures.map((b) => ({
    id: b.id,
    year: b.year,
    version: b.version,
    release_date: b.release_date,
    file_size_bytes: b.file_size_bytes,
    changelog: b.changelog,
    file_url: b.file_url,
    is_current: b.is_current,
  }));

  return (
    <>
      <JsonLd
        data={generateBreadcrumbSchema([
          { name: 'Home', url: baseUrl },
          { name: 'NATA 2026' },
        ])}
      />
      <JsonLd data={generateFAQSchema(faqs)} />

      <Box>
        <HeroSection locale={locale} />
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 1.5, bgcolor: 'background.paper' }}>
          <LastUpdatedBadge date="March 13, 2026" variant="dark" />
        </Box>
        <TopicNavigation locale={locale} />
        <WhatIsNataSection />
        <AtAGlanceSection />
        <FreeToolsSection />
        <BrochureSection brochures={serializedBrochures} />
        <AssistanceSection locale={locale} />
        <FaqSection faqs={faqs} />
        <CtaBanner locale={locale} />
        <ContactSection />
      </Box>
    </>
  );
}

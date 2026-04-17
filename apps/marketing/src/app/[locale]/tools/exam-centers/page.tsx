import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  generateBreadcrumbSchema,
  generateWebApplicationSchema,
  generateFAQSchema,
} from '@/lib/seo/schemas';
import { buildAlternates, buildOgImage } from '@/lib/seo/metadata';
import ToolLandingPage from '@/components/tools/ToolLandingPage';
import { examCentersConfig } from '@/lib/tools/configs/exam-centers';

const baseUrl = 'https://neramclasses.com';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: examCentersConfig.metaTitle,
    description: examCentersConfig.metaDescription,
    keywords: examCentersConfig.keywords.join(', '),
    alternates: buildAlternates(locale, '/tools/exam-centers'),
    openGraph: {
      title: examCentersConfig.metaTitle,
      description: examCentersConfig.metaDescription,
      url:
        locale === 'en'
          ? `${baseUrl}/tools/exam-centers`
          : `${baseUrl}/${locale}/tools/exam-centers`,
      type: 'website',
      images: [
        {
          url: buildOgImage(
            examCentersConfig.ogImageTitle,
            examCentersConfig.ogImageSubtitle,
            'tool'
          ),
        },
      ],
    },
  };
}

export default function ExamCentersPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);

  return (
    <>
      <JsonLd
        data={[
          generateBreadcrumbSchema([
            { name: 'Home', url: baseUrl },
            { name: 'Tools', url: `${baseUrl}/tools` },
            { name: 'Exam Centers', url: `${baseUrl}/tools/exam-centers` },
          ]),
          generateWebApplicationSchema({
            name: 'NATA Exam Center Finder 2026',
            description:
              'Search and find NATA 2026 exam centers near you across 96 cities in India with distance calculator and TCS iON verification.',
            url: `${baseUrl}/tools/exam-centers`,
            applicationCategory: 'EducationalApplication',
          }),
          generateFAQSchema(examCentersConfig.faqs),
        ]}
      />
      <ToolLandingPage config={examCentersConfig} />
    </>
  );
}

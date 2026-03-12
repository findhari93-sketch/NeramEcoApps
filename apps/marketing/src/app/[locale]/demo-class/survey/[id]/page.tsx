import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema } from '@/lib/seo/schemas';
import DemoSurveyContent from '@/components/DemoSurveyContent';
import { buildAlternates } from '@/lib/seo/metadata';

const baseUrl = 'https://neramclasses.com';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'Demo Class Feedback - Neram Classes',
    description:
      'Share your feedback about the Neram Classes demo class experience.',
    alternates: buildAlternates(locale, '/demo-class/survey'),
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default function DemoSurveyPage({
  params: { locale, id },
}: {
  params: { locale: string; id: string };
}) {
  setRequestLocale(locale);

  return (
    <>
      <JsonLd
        data={generateBreadcrumbSchema([
          { name: 'Home', url: baseUrl },
          { name: 'Demo Class', url: `${baseUrl}/demo-class` },
          { name: 'Survey' },
        ])}
      />
      <DemoSurveyContent id={id} />
    </>
  );
}

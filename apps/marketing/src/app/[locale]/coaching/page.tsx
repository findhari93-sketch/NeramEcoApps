import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import CoachingPageContent from '@/components/CoachingPageContent';

export const revalidate = 86400;

const baseUrl = 'https://neramclasses.com';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'NATA Coaching Methodology - Expert Architecture Entrance Preparation',
    description:
      'Our proven NATA coaching methodology combines IIT/NIT faculty expertise, personalized study plans, daily drawing practice, and weekly mock tests for top scores.',
    keywords:
      'NATA coaching methodology, architecture entrance preparation, NATA teaching method, drawing coaching, aptitude coaching',
    alternates: buildAlternates(locale, '/coaching'),
    openGraph: {
      title: 'NATA Coaching Methodology - Expert Architecture Entrance Preparation',
      description:
        'Our proven NATA coaching methodology with IIT/NIT faculty, personalized study plans, and weekly mock tests.',
      type: 'website',
      url: locale === 'en' ? `${baseUrl}/coaching` : `${baseUrl}/${locale}/coaching`,
    },
  };
}

export default function CoachingPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);

  return (
    <>
      <JsonLd
        data={generateBreadcrumbSchema([
          { name: 'Home', url: baseUrl },
          { name: 'Coaching', url: `${baseUrl}/coaching` },
        ])}
      />
      <CoachingPageContent />
    </>
  );
}

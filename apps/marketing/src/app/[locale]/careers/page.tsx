import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import CareersPageContent from '@/components/CareersPageContent';

const baseUrl = 'https://neramclasses.com';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'Careers at Neram Classes - Join Our Teaching Team',
    description:
      'Join Neram Classes as a faculty member, content creator, or counselor. We are looking for passionate educators to shape the future of architecture students.',
    keywords:
      'careers Neram Classes, teaching jobs NATA coaching, architecture faculty jobs, education jobs Tamil Nadu',
    alternates: buildAlternates(locale, '/careers'),
    openGraph: {
      title: 'Careers at Neram Classes - Join Our Teaching Team',
      description:
        'Join Neram Classes as a faculty member, content creator, or counselor. Shape the future of architecture students.',
      type: 'website',
      url: locale === 'en' ? `${baseUrl}/careers` : `${baseUrl}/${locale}/careers`,
    },
  };
}

export default function CareersPage({
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
          { name: 'Careers', url: `${baseUrl}/careers` },
        ])}
      />
      <CareersPageContent />
    </>
  );
}

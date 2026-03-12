import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import AboutPageContent from '@/components/AboutPageContent';

const baseUrl = 'https://neramclasses.com';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'About Neram Classes - Best NATA Coaching Institute in Tamil Nadu',
    description:
      'Learn about Neram Classes, founded in 2020. Expert IIT/NIT alumni faculty providing NATA & JEE Paper 2 coaching across India with online and offline classes.',
    keywords:
      'about Neram Classes, NATA coaching institute, architecture coaching Tamil Nadu, IIT NIT faculty coaching',
    alternates: buildAlternates(locale, '/about'),
    openGraph: {
      title: 'About Neram Classes - Best NATA Coaching Institute in Tamil Nadu',
      description:
        'Learn about Neram Classes, founded in 2020. Expert IIT/NIT alumni faculty providing NATA & JEE Paper 2 coaching across India.',
      type: 'website',
      url: locale === 'en' ? `${baseUrl}/about` : `${baseUrl}/${locale}/about`,
    },
  };
}

export default function AboutPage({
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
          { name: 'About', url: `${baseUrl}/about` },
        ])}
      />
      <AboutPageContent />
    </>
  );
}

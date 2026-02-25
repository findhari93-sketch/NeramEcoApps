import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema } from '@/lib/seo/schemas';
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
    alternates: {
      canonical: `${baseUrl}/${locale}/about`,
      languages: {
        en: `${baseUrl}/en/about`,
        ta: `${baseUrl}/ta/about`,
        hi: `${baseUrl}/hi/about`,
        kn: `${baseUrl}/kn/about`,
        ml: `${baseUrl}/ml/about`,
        'x-default': `${baseUrl}/en/about`,
      },
    },
    openGraph: {
      title: 'About Neram Classes - Best NATA Coaching Institute in Tamil Nadu',
      description:
        'Learn about Neram Classes, founded in 2020. Expert IIT/NIT alumni faculty providing NATA & JEE Paper 2 coaching across India.',
      type: 'website',
      url: `${baseUrl}/${locale}/about`,
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
          { name: 'About', url: `${baseUrl}/en/about` },
        ])}
      />
      <AboutPageContent />
    </>
  );
}

import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateOrganizationSchema, generateWebSiteSchema, generateBreadcrumbSchema, generateSoftwareApplicationSchema } from '@/lib/seo/schemas';
import HomePageContent from '@/components/HomePageContent';

const baseUrl = 'https://neramclasses.com';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'Best NATA Coaching in India 2026 | Online & Offline Architecture Entrance Preparation',
    description:
      "India's #1 NATA and JEE Paper 2 coaching institute. Expert IIT/NIT alumni faculty, 99.9% success rate, comprehensive study materials. Online and offline classes across Tamil Nadu, India & Gulf countries. Free demo class available.",
    keywords:
      'NATA coaching, best NATA coaching India, NATA preparation 2026, JEE Paper 2 coaching, architecture entrance exam, online NATA classes, NATA coaching Tamil Nadu, NATA coaching online, architecture entrance coaching India, NATA drawing classes, NATA mathematics coaching',
    alternates: {
      canonical: locale === 'en' ? baseUrl : `${baseUrl}/${locale}`,
      languages: {
        en: `${baseUrl}/en`,
        ta: `${baseUrl}/ta`,
        hi: `${baseUrl}/hi`,
        kn: `${baseUrl}/kn`,
        ml: `${baseUrl}/ml`,
        'x-default': `${baseUrl}/en`,
      },
    },
    openGraph: {
      title: 'Neram Classes - Best NATA & JEE Paper 2 Coaching in India',
      description:
        "India's top NATA coaching institute. IIT/NIT alumni faculty, online & offline classes. Join 5000+ successful students.",
      type: 'website',
      url: locale === 'en' ? baseUrl : `${baseUrl}/${locale}`,
    },
  };
}

export default function HomePage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);

  return (
    <>
      <JsonLd data={generateOrganizationSchema()} />
      <JsonLd data={generateWebSiteSchema()} />
      <JsonLd
        data={generateBreadcrumbSchema([
          { name: 'Home', url: baseUrl },
        ])}
      />
      <JsonLd data={generateSoftwareApplicationSchema()} />
      <HomePageContent />
    </>
  );
}

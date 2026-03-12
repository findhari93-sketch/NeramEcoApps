import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema } from '@/lib/seo/schemas';
import DemoClassPageContent from '@/components/DemoClassPageContent';

const baseUrl = 'https://neramclasses.com';

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }): Promise<Metadata> {
  return {
    title: 'Free NATA Demo Class - Try Before You Join',
    description: 'Book a free NATA demo class with our IIT/NIT alumni faculty. Experience our teaching methodology, interactive sessions, and personalized feedback before enrolling.',
    keywords: 'free NATA demo class, NATA trial class, free architecture coaching demo, try NATA coaching free',
    alternates: {
      canonical: locale === 'en' ? `${baseUrl}/demo-class` : `${baseUrl}/${locale}/demo-class`,
    },
  };
}

export default function DemoClassPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);
  return (
    <>
      <JsonLd data={generateBreadcrumbSchema([
        { name: 'Home', url: baseUrl },
        { name: 'Demo Class', url: `${baseUrl}/demo-class` },
      ])} />
      <DemoClassPageContent />
    </>
  );
}

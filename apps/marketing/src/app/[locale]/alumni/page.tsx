import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema } from '@/lib/seo/schemas';
import AlumniPageContent from '@/components/AlumniPageContent';

export const revalidate = 86400;

const baseUrl = 'https://neramclasses.com';

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }): Promise<Metadata> {
  return {
    title: 'Student Success Stories - Neram Classes NATA Toppers & Alumni',
    description: 'Meet our successful NATA toppers and alumni placed in top architecture colleges across India. Real success stories from IIT, NIT, SPA, and Anna University students.',
    keywords: 'NATA toppers, architecture college alumni, NATA success stories, Neram Classes results, architecture entrance results',
    alternates: {
      canonical: locale === 'en' ? `${baseUrl}/alumni` : `${baseUrl}/${locale}/alumni`,
    },
  };
}

export default function AlumniPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);
  return (
    <>
      <JsonLd data={generateBreadcrumbSchema([
        { name: 'Home', url: baseUrl },
        { name: 'Alumni', url: `${baseUrl}/alumni` },
      ])} />
      <AlumniPageContent />
    </>
  );
}

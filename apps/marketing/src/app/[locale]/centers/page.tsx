import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema } from '@/lib/seo/schemas';
import CentersPageContent from '@/components/CentersPageContent';

export const revalidate = 86400;

const baseUrl = 'https://neramclasses.com';

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }): Promise<Metadata> {
  return {
    title: 'Neram Classes Centers - NATA Coaching Locations Across India',
    description: 'Find Neram Classes NATA coaching centers near you. Online and offline classes available across Tamil Nadu, Karnataka, Kerala, and major cities in India.',
    keywords: 'NATA coaching centers, NATA coaching near me, architecture coaching locations, Neram Classes branches',
    alternates: {
      canonical: locale === 'en' ? `${baseUrl}/centers` : `${baseUrl}/${locale}/centers`,
    },
  };
}

export default function CentersPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);
  return (
    <>
      <JsonLd data={generateBreadcrumbSchema([
        { name: 'Home', url: baseUrl },
        { name: 'Centers', url: `${baseUrl}/centers` },
      ])} />
      <CentersPageContent />
    </>
  );
}

import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema } from '@/lib/seo/schemas';
import FeesPageContent from '@/components/FeesPageContent';
import { buildAlternates } from '@/lib/seo/metadata';


const baseUrl = 'https://neramclasses.com';

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }): Promise<Metadata> {
  return {
    title: 'NATA Coaching Fees & Course Pricing - Neram Classes',
    description: 'Transparent fee structure for NATA and JEE Paper 2 coaching. Affordable plans starting from Rs 15,000. EMI options, scholarships, and early bird discounts available.',
    keywords: 'NATA coaching fees, NATA coaching cost, architecture coaching price, affordable NATA coaching, NATA coaching EMI',
    alternates: buildAlternates(locale, '/fees'),
  };
}

export default function FeesPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);
  return (
    <>
      <JsonLd data={generateBreadcrumbSchema([
        { name: 'Home', url: baseUrl },
        { name: 'Fees', url: `${baseUrl}/fees` },
      ])} />
      <FeesPageContent />
    </>
  );
}

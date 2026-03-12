import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema } from '@/lib/seo/schemas';
import ScholarshipPageContent from '@/components/ScholarshipPageContent';
import { buildAlternates } from '@/lib/seo/metadata';

const baseUrl = 'https://neramclasses.com';

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }): Promise<Metadata> {
  return {
    title: 'NATA Coaching Scholarships - Up to 100% Fee Waiver',
    description: 'Apply for scholarships at Neram Classes. Merit-based and need-based scholarships for NATA coaching. Up to 100% fee waiver for eligible students.',
    keywords: 'NATA coaching scholarship, architecture coaching scholarship, free NATA coaching, merit scholarship NATA',
    alternates: buildAlternates(locale, '/scholarship'),
  };
}

export default function ScholarshipPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);
  return (
    <>
      <JsonLd data={generateBreadcrumbSchema([
        { name: 'Home', url: baseUrl },
        { name: 'Scholarship', url: `${baseUrl}/scholarship` },
      ])} />
      <ScholarshipPageContent />
    </>
  );
}

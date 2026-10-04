import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema } from '@/lib/seo/schemas';
import FeesPageContent from '@/components/FeesPageContent';
import { buildAlternates } from '@/lib/seo/metadata';
import ClientIntl from '@/components/i18n/ClientIntl';


const baseUrl = 'https://neramclasses.com';

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }): Promise<Metadata> {
  return {
    title: 'NATA Coaching Fees & Course Pricing',
    description: 'Transparent fees for NATA and JEE Paper 2 coaching. Pay once and save, or pay in 2 interest-free instalments.',
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
      <ClientIntl locale={locale} namespaces={['fees']}><FeesPageContent /></ClientIntl>
    </>
  );
}

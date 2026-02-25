import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema } from '@/lib/seo/schemas';
import PremiumPageContent from '@/components/PremiumPageContent';

const baseUrl = 'https://neramclasses.com';

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }): Promise<Metadata> {
  return {
    title: 'Premium NATA Coaching - 1-on-1 Mentoring & Exclusive Resources',
    description: 'Get premium NATA coaching with personal mentoring from IIT/NIT alumni, exclusive study materials, unlimited mock tests, and guaranteed score improvement.',
    keywords: 'premium NATA coaching, personal mentoring NATA, exclusive NATA study material, best NATA preparation, 1-on-1 architecture coaching',
    alternates: {
      canonical: `${baseUrl}/${locale}/premium`,
    },
  };
}

export default function PremiumPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);
  return (
    <>
      <JsonLd data={generateBreadcrumbSchema([
        { name: 'Home', url: baseUrl },
        { name: 'Premium', url: `${baseUrl}/en/premium` },
      ])} />
      <PremiumPageContent />
    </>
  );
}

import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema } from '@/lib/seo/schemas';
import ApplyCallbackContent from '@/components/ApplyCallbackContent';

const baseUrl = 'https://neramclasses.com';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'Application Submitted - Neram Classes',
    description:
      'Your application to Neram Classes has been submitted successfully. Our team will contact you within 24 hours.',
    keywords: 'Neram Classes application status',
    alternates: {
      canonical: locale === 'en' ? `${baseUrl}/apply/callback` : `${baseUrl}/${locale}/apply/callback`,
    },
    robots: {
      index: false,
      follow: true,
    },
  };
}

export default function CallbackPage({
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
          { name: 'Apply', url: `${baseUrl}/apply` },
          { name: 'Callback', url: `${baseUrl}/apply/callback` },
        ])}
      />
      <ApplyCallbackContent />
    </>
  );
}

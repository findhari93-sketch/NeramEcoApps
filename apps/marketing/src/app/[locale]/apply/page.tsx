import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import ApplyPageContent from '@/components/ApplyPageContent';

const baseUrl = 'https://neramclasses.com';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'Apply for NATA Coaching - Neram Classes Admission',
    description:
      'Apply now for NATA and JEE Paper 2 coaching at Neram Classes. Easy online application, scholarships available, flexible batch options.',
    keywords:
      'apply NATA coaching, Neram Classes admission, NATA coaching enrollment, architecture coaching application',
    alternates: buildAlternates(locale, '/apply'),
    openGraph: {
      title: 'Apply for NATA Coaching - Neram Classes Admission',
      description:
        'Apply now for NATA and JEE Paper 2 coaching at Neram Classes. Scholarships available, flexible batch options.',
      type: 'website',
      url: `${baseUrl}/${locale}/apply`,
    },
  };
}

export default function ApplyPage({
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
        ])}
      />
      <ApplyPageContent />
    </>
  );
}

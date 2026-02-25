import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema } from '@/lib/seo/schemas';
import ContactPageContent from '@/components/ContactPageContent';

const baseUrl = 'https://neramclasses.com';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'Contact Neram Classes - NATA Coaching Enquiry',
    description:
      'Get in touch with Neram Classes for NATA and JEE Paper 2 coaching enquiries. Call +91-9176137043 or visit our website for a free demo class.',
    keywords:
      'contact Neram Classes, NATA coaching enquiry, architecture coaching contact, free demo class NATA',
    alternates: {
      canonical: `${baseUrl}/${locale}/contact`,
      languages: {
        en: `${baseUrl}/en/contact`,
        ta: `${baseUrl}/ta/contact`,
        hi: `${baseUrl}/hi/contact`,
        kn: `${baseUrl}/kn/contact`,
        ml: `${baseUrl}/ml/contact`,
        'x-default': `${baseUrl}/en/contact`,
      },
    },
    openGraph: {
      title: 'Contact Neram Classes - NATA Coaching Enquiry',
      description:
        'Get in touch with Neram Classes for NATA and JEE Paper 2 coaching enquiries. Free demo class available.',
      type: 'website',
      url: `${baseUrl}/${locale}/contact`,
    },
  };
}

export default function ContactPage({
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
          { name: 'Contact', url: `${baseUrl}/en/contact` },
        ])}
      />
      <ContactPageContent />
    </>
  );
}

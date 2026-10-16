import { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import AboutPageContent from '@/components/AboutPageContent';
import ClientIntl from '@/components/i18n/ClientIntl';


const baseUrl = 'https://neramclasses.com';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  // Translated copies get a translated title and description; with English ones
  // every locale shared the same title and read as duplicates.
  if (locale !== 'en') {
    const t = await getTranslations({ locale, namespace: 'about' });
    return {
      title: t('pageTitle'),
      description: t('heroSubtitle'),
      alternates: buildAlternates(locale, '/about'),
      openGraph: { title: t('pageTitle'), description: t('heroSubtitle'), type: 'website', url: `${baseUrl}/${locale}/about` },
    };
  }
  return {
    title: 'About Neram Classes - Best NATA Coaching Institute in Tamil Nadu',
    description:
      'Learn about Neram Classes, founded in 2020. Expert IIT/NIT alumni faculty providing NATA & JEE Paper 2 coaching across India with online and offline classes.',
    keywords:
      'about Neram Classes, NATA coaching institute, architecture coaching Tamil Nadu, IIT NIT faculty coaching',
    alternates: buildAlternates(locale, '/about'),
    openGraph: {
      title: 'About Neram Classes - Best NATA Coaching Institute in Tamil Nadu',
      description:
        'Learn about Neram Classes, founded in 2020. Expert IIT/NIT alumni faculty providing NATA & JEE Paper 2 coaching across India.',
      type: 'website',
      url: locale === 'en' ? `${baseUrl}/about` : `${baseUrl}/${locale}/about`,
    },
  };
}

export default function AboutPage({
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
          { name: 'About', url: `${baseUrl}/about` },
        ])}
      />
      <ClientIntl locale={locale} namespaces={['about', 'header.freeDemoClass', 'contact.title']}><AboutPageContent /></ClientIntl>
    </>
  );
}

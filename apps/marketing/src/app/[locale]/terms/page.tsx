import { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { buildAlternates } from '@/lib/seo/metadata';
import { LegalPage } from '@/design-system';
import { TERMS_SECTION_KEYS } from '@/components/legal/sections';
import { legalPolicies } from '@/components/legal/policies';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'Terms & Conditions',
    description: 'Terms and Conditions for using Neram Classes services. Read our policies on enrollment, payments, data usage, and more.',
    alternates: buildAlternates(locale, '/terms'),
  };
}

interface PageProps {
  params: { locale: string };
}

export default async function TermsPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'terms' });

  return (
    <LegalPage
      title={t('pageTitle')}
      updated={t('lastUpdated')}
      policies={await legalPolicies(locale, 'terms')}
      railLabel={t('pageTitle')}
      sections={TERMS_SECTION_KEYS.map((key) => ({
        id: key,
        title: t(`sections.${key}.title`),
        body: <p>{t(`sections.${key}.content`)}</p>,
      }))}
    />
  );
}

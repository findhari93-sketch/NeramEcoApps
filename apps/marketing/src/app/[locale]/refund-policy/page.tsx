import { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { buildAlternates } from '@/lib/seo/metadata';
import { LegalPage } from '@/design-system';
import { REFUND_SECTION_KEYS } from '@/components/legal/sections';
import { legalPolicies } from '@/components/legal/policies';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'Refund Policy',
    description: 'Refund Policy for Neram Classes. Learn about our 24-hour refund window, processing fees, and how to request a refund.',
    alternates: buildAlternates(locale, '/refund-policy'),
  };
}

interface PageProps {
  params: { locale: string };
}

export default async function RefundPolicyPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'refundPolicy' });

  return (
    <LegalPage
      title={t('pageTitle')}
      updated={t('lastUpdated')}
      policies={await legalPolicies(locale, 'refund')}
      railLabel={t('pageTitle')}
      sections={REFUND_SECTION_KEYS.map((key) => ({
        id: key,
        title: t(`sections.${key}.title`),
        body: <p>{t(`sections.${key}.content`)}</p>,
      }))}
    />
  );
}

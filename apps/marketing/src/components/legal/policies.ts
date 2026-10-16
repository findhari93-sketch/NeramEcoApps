import { getTranslations } from 'next-intl/server';

export type PolicyKey = 'terms' | 'privacy' | 'refund';

/** The legal pill switcher (Terms, Privacy, Refund policy) with translated labels. */
export async function legalPolicies(locale: string, current: PolicyKey) {
  const t = await getTranslations({ locale, namespace: 'apply.shell' });
  return [
    { label: t('terms'), href: '/terms', current: current === 'terms' },
    { label: t('privacy'), href: '/privacy', current: current === 'privacy' },
    { label: t('refund'), href: '/refund-policy', current: current === 'refund' },
  ];
}

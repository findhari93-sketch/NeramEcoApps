import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import CounsellingHubPage from '@/components/counselling/CounsellingHubPage';
import config from '@/data/counselling-2026/ap-barch';
import { HUB_REGISTRY } from '@/data/counselling-2026';
import { buildAlternates } from '@/lib/seo/metadata';

export const revalidate = 86400;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: config.seoTitle ?? config.title,
    description: config.seoDescription ?? config.description.slice(0, 160),
    keywords: config.seoKeywords,
    alternates: buildAlternates(locale, `/counseling/${config.slug}`),
    openGraph: {
      title: config.seoTitle ?? config.title,
      description: config.seoDescription ?? config.description.slice(0, 160),
      url: `https://neramclasses.com/counseling/${config.slug}`,
      type: 'article',
    },
  };
}

interface PageProps {
  params: { locale: string };
}

export default function Page({ params: { locale } }: PageProps) {
  setRequestLocale(locale);
  const related = HUB_REGISTRY.filter((h) => h.slug !== config.slug && h.region === 'south').slice(0, 4);
  return <CounsellingHubPage config={config} locale={locale} related={related} />;
}

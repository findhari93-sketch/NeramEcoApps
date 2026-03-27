import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema } from '@/lib/seo/schemas';
import YouTubeRewardPageContent from '@/components/YouTubeRewardPageContent';
import { buildAlternates } from '@/lib/seo/metadata';

export const revalidate = 86400;

const baseUrl = 'https://neramclasses.com';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'YouTube Subscription Reward - Get Discount on NATA Coaching',
    description:
      'Subscribe to Neram Classes YouTube channel and get exclusive discounts on NATA coaching. Watch free preparation videos and earn rewards.',
    keywords:
      'NATA coaching discount, YouTube subscription reward, free NATA videos, architecture coaching discount',
    alternates: buildAlternates(locale, '/youtube-reward'),
    openGraph: {
      title: 'YouTube Subscription Reward - Get Discount on NATA Coaching',
      description:
        'Subscribe to Neram Classes YouTube channel and get exclusive discounts on NATA coaching.',
      url: locale === 'en' ? `${baseUrl}/youtube-reward` : `${baseUrl}/${locale}/youtube-reward`,
      type: 'website',
    },
  };
}

export default function YouTubeRewardPage({
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
          { name: 'YouTube Reward', url: `${baseUrl}/youtube-reward` },
        ])}
      />
      <YouTubeRewardPageContent />
    </>
  );
}

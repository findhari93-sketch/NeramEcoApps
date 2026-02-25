import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema } from '@/lib/seo/schemas';
import YouTubeRewardPageContent from '@/components/YouTubeRewardPageContent';

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
    alternates: {
      canonical: `${baseUrl}/${locale}/youtube-reward`,
      languages: {
        en: `${baseUrl}/en/youtube-reward`,
        ta: `${baseUrl}/ta/youtube-reward`,
        hi: `${baseUrl}/hi/youtube-reward`,
        kn: `${baseUrl}/kn/youtube-reward`,
        ml: `${baseUrl}/ml/youtube-reward`,
        'x-default': `${baseUrl}/en/youtube-reward`,
      },
    },
    openGraph: {
      title: 'YouTube Subscription Reward - Get Discount on NATA Coaching',
      description:
        'Subscribe to Neram Classes YouTube channel and get exclusive discounts on NATA coaching.',
      url: `${baseUrl}/${locale}/youtube-reward`,
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
          { name: 'YouTube Reward', url: `${baseUrl}/en/youtube-reward` },
        ])}
      />
      <YouTubeRewardPageContent />
    </>
  );
}

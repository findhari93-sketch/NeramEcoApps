import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import CityCoachingTemplate from '@/components/nata-coaching/CityCoachingTemplate';
import { panIndiaCities } from '@/components/nata-coaching/city-data';
import { buildAlternates, buildOgImage } from '@/lib/seo/metadata';
import { BASE_URL } from '@/lib/seo/constants';

export const revalidate = 86400;

const city = panIndiaCities.delhi;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const title = `NATA Online Coaching in Delhi NCR 2026 | SPA Delhi Prep | Neram Classes`;
  const description = `NATA online coaching for Delhi NCR students aiming at SPA Delhi, USAP, Jamia Millia, Manav Rachna. Live classes by NIT/IIT/SPA alumni, 99.9% success rate. Serves Dwarka, Noida, Gurgaon, Ghaziabad, Faridabad.`;
  return {
    title,
    description,
    keywords:
      'NATA online coaching Delhi, NATA coaching online Delhi NCR, SPA Delhi coaching, NATA coaching Noida, NATA coaching Gurgaon, NATA coaching Ghaziabad, NATA coaching Faridabad, NATA classes Delhi, NATA preparation Delhi',
    alternates: buildAlternates(locale, `/nata-coaching/${city.slug}`),
    openGraph: {
      title: `NATA Online Coaching in ${city.displayName} NCR | Neram Classes`,
      description,
      type: 'website',
      url: `${BASE_URL}/nata-coaching/${city.slug}`,
      images: [
        {
          url: buildOgImage(`NATA Online Coaching in Delhi NCR`, 'SPA Delhi Prep | Since 2009', 'coaching'),
          width: 1200,
          height: 630,
          alt: `NATA Online Coaching in Delhi NCR, Neram Classes`,
        },
      ],
    },
  };
}

export default function NataOnlineCoachingDelhiPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);
  return <CityCoachingTemplate city={city} locale={locale} />;
}

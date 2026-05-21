import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import CityCoachingTemplate from '@/components/nata-coaching/CityCoachingTemplate';
import { panIndiaCities } from '@/components/nata-coaching/city-data';
import { buildAlternates, buildOgImage } from '@/lib/seo/metadata';
import { BASE_URL } from '@/lib/seo/constants';

export const revalidate = 86400;

const city = panIndiaCities.mumbai;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const title = `NATA Online Coaching in Mumbai 2026 | Sir JJ College Prep | Neram Classes`;
  const description = `NATA online coaching for Mumbai and MMR students aiming at Sir JJ College of Architecture, KRVIA, Rachana Sansad, and Rizvi. Live classes by NIT/IIT/SPA alumni faculty.`;
  return {
    title,
    description,
    keywords:
      'NATA online coaching Mumbai, NATA coaching online Mumbai, NATA classes Mumbai, JJ College architecture coaching, KRVIA coaching, NATA coaching Andheri, NATA coaching Powai, NATA coaching Thane, NATA coaching Navi Mumbai, NATA preparation Mumbai',
    alternates: buildAlternates(locale, `/nata-coaching/${city.slug}`),
    openGraph: {
      title: `NATA Online Coaching in ${city.displayName} | Neram Classes`,
      description,
      type: 'website',
      url: `${BASE_URL}/nata-coaching/${city.slug}`,
      images: [
        {
          url: buildOgImage(`NATA Online Coaching in ${city.displayName}`, 'Live Classes | NIT/IIT Faculty | Since 2009', 'coaching'),
          width: 1200,
          height: 630,
          alt: `NATA Online Coaching in ${city.displayName}, Neram Classes`,
        },
      ],
    },
  };
}

export default function NataOnlineCoachingMumbaiPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);
  return <CityCoachingTemplate city={city} locale={locale} />;
}

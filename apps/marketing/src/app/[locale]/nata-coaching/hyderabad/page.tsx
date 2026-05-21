import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import CityCoachingTemplate from '@/components/nata-coaching/CityCoachingTemplate';
import { panIndiaCities } from '@/components/nata-coaching/city-data';
import { buildAlternates, buildOgImage } from '@/lib/seo/metadata';
import { BASE_URL } from '@/lib/seo/constants';

export const revalidate = 86400;

const city = panIndiaCities.hyderabad;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const title = `NATA Online Coaching in Hyderabad 2026 | JNAFAU Prep | Neram Classes`;
  const description = `NATA online coaching for Hyderabad students aiming at JNAFAU, JNTU College of Architecture, and other Telugu-state institutes. Live classes by NIT/IIT/SPA alumni faculty, 99.9% success rate.`;
  return {
    title,
    description,
    keywords:
      'NATA online coaching Hyderabad, NATA coaching online Hyderabad, NATA classes Hyderabad, JNAFAU coaching, JNTU architecture coaching, NATA coaching Gachibowli, NATA coaching Madhapur, NATA coaching Secunderabad, NATA preparation Hyderabad',
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

export default function NataOnlineCoachingHyderabadPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);
  return <CityCoachingTemplate city={city} locale={locale} />;
}

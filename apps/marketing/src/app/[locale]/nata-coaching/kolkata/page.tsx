import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import CityCoachingTemplate from '@/components/nata-coaching/CityCoachingTemplate';
import { panIndiaCities } from '@/components/nata-coaching/city-data';
import { buildAlternates, buildOgImage } from '@/lib/seo/metadata';
import { BASE_URL } from '@/lib/seo/constants';

export const revalidate = 86400;

const city = panIndiaCities.kolkata;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const title = `NATA Online Coaching in Kolkata 2026 | Jadavpur University, IIEST Prep | Neram Classes`;
  const description = `NATA online coaching for Kolkata and East India students aiming at Jadavpur University, IIEST Shibpur, Bengal Institute of Technology. Live classes by NIT/IIT/SPA alumni faculty, 99.9% success rate.`;
  return {
    title,
    description,
    keywords:
      'NATA online coaching Kolkata, NATA coaching online Kolkata, NATA classes Kolkata, Jadavpur University architecture coaching, IIEST Shibpur coaching, NATA coaching Salt Lake, NATA coaching New Town, NATA preparation Kolkata',
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

export default function NataOnlineCoachingKolkataPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);
  return <CityCoachingTemplate city={city} locale={locale} />;
}

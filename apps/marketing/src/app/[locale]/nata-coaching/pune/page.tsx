import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import CityCoachingTemplate from '@/components/nata-coaching/CityCoachingTemplate';
import { panIndiaCities } from '@/components/nata-coaching/city-data';
import { buildAlternates, buildOgImage } from '@/lib/seo/metadata';
import { BASE_URL } from '@/lib/seo/constants';

export const revalidate = 86400;

const city = panIndiaCities.pune;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const title = `NATA Online Coaching in Pune 2026 | BNCA, Sinhgad, MIT Prep | Neram Classes`;
  const description = `NATA online coaching for Pune students aiming at BNCA, Sinhgad, MIT, D Y Patil architecture colleges. Live classes by NIT/IIT/SPA alumni faculty, daily drawing practice, 99.9% success rate.`;
  return {
    title,
    description,
    keywords:
      'NATA online coaching Pune, NATA coaching online Pune, NATA classes Pune, BNCA coaching, Sinhgad architecture coaching, NATA coaching Kothrud, NATA coaching Aundh, NATA coaching Pimpri Chinchwad, NATA preparation Pune',
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

export default function NataOnlineCoachingPunePage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);
  return <CityCoachingTemplate city={city} locale={locale} />;
}

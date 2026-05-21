import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import CityCoachingTemplate from '@/components/nata-coaching/CityCoachingTemplate';
import { tnCities } from '@/components/nata-coaching/city-data';
import { buildAlternates, buildOgImage } from '@/lib/seo/metadata';
import { BASE_URL } from '@/lib/seo/constants';

export const revalidate = 86400;

const city = tnCities.vellore;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const title = `NATA Online Coaching in Vellore 2026 | VIT Architecture Prep | Neram Classes`;
  const description = `NATA online coaching for Vellore students. Live classes by NIT/IIT/SPA alumni faculty, 99.9% success rate, daily drawing practice. Target VIT, Anna University, and Bangalore colleges.`;
  return {
    title,
    description,
    keywords:
      'NATA online coaching Vellore, NATA coaching online Vellore, NATA classes Vellore, NATA preparation Vellore, NATA coaching Katpadi, NATA coaching Ranipet',
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

export default function NataOnlineCoachingVellorePage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);
  return <CityCoachingTemplate city={city} locale={locale} />;
}

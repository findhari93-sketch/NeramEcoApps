import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import CityCoachingTemplate from '@/components/nata-coaching/CityCoachingTemplate';
import { tnCities } from '@/components/nata-coaching/city-data';
import { buildAlternates, buildOgImage } from '@/lib/seo/metadata';
import { BASE_URL } from '@/lib/seo/constants';

export const revalidate = 86400;

const city = tnCities.trichy;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const title = `NATA Online Coaching in Trichy 2026 | NIT Trichy B.Arch Prep | Neram Classes`;
  const description = `NATA online coaching for Trichy students aiming at NIT Trichy and NIT Calicut. Live classes by NIT alumni, NATA + JEE Paper 2 combined prep, 100+ mock tests, 99.9% success rate.`;
  return {
    title,
    description,
    keywords:
      'NATA online coaching Trichy, NATA coaching online Tiruchirappalli, NIT Trichy B.Arch coaching, NATA classes Trichy, JEE Paper 2 coaching Trichy, NATA preparation Trichy',
    alternates: buildAlternates(locale, `/nata-coaching/${city.slug}`),
    openGraph: {
      title: `NATA Online Coaching in ${city.displayName} | Neram Classes`,
      description,
      type: 'website',
      url: `${BASE_URL}/nata-coaching/${city.slug}`,
      images: [
        {
          url: buildOgImage(`NATA Online Coaching in ${city.displayName}`, 'NIT Trichy Prep | Since 2009', 'coaching'),
          width: 1200,
          height: 630,
          alt: `NATA Online Coaching in ${city.displayName}, Neram Classes`,
        },
      ],
    },
  };
}

export default function NataOnlineCoachingTrichyPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);
  return <CityCoachingTemplate city={city} locale={locale} />;
}

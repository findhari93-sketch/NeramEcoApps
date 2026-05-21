import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import CityCoachingTemplate from '@/components/nata-coaching/CityCoachingTemplate';
import { panIndiaCities } from '@/components/nata-coaching/city-data';
import { buildAlternates, buildOgImage } from '@/lib/seo/metadata';
import { BASE_URL } from '@/lib/seo/constants';

export const revalidate = 86400;

const city = panIndiaCities.kochi;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const title = `NATA Online Coaching in Kochi 2026 | CET Trivandrum, NIT Calicut Prep | Neram Classes`;
  const description = `NATA online coaching for Kochi and Ernakulam students aiming at CET Trivandrum, NIT Calicut, TKM Kollam architecture programs. Live classes by NIT/IIT/SPA alumni faculty.`;
  return {
    title,
    description,
    keywords:
      'NATA online coaching Kochi, NATA coaching online Ernakulam, NATA classes Kochi, NIT Calicut architecture coaching, NATA coaching Edappally, NATA coaching Kakkanad, NATA coaching Aluva, NATA preparation Kerala',
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

export default function NataOnlineCoachingKochiPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);
  return <CityCoachingTemplate city={city} locale={locale} />;
}

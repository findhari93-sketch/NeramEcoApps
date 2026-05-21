import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import CityCoachingTemplate from '@/components/nata-coaching/CityCoachingTemplate';
import { tnCities } from '@/components/nata-coaching/city-data';
import { buildAlternates, buildOgImage } from '@/lib/seo/metadata';
import { BASE_URL } from '@/lib/seo/constants';

export const revalidate = 86400;

const city = tnCities.coimbatore;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const title = `NATA Online Coaching in Coimbatore 2026 | Live Classes, NIT/IIT Faculty | Neram Classes`;
  const description = `NATA online coaching for Coimbatore students: live classes by NIT/IIT/SPA alumni, daily drawing practice, 100+ mock tests, 99.9% success rate. Fees from Rs. 15,000.`;
  return {
    title,
    description,
    keywords:
      'NATA online coaching Coimbatore, NATA coaching online Coimbatore, NATA classes Coimbatore, best NATA coaching Coimbatore, NATA coaching RS Puram, NATA coaching Saibaba Colony, NATA coaching Peelamedu, NATA preparation Coimbatore',
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

export default function NataOnlineCoachingCoimbatorePage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);
  return <CityCoachingTemplate city={city} locale={locale} />;
}

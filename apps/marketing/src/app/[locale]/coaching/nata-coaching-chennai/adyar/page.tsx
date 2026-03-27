import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema, generateFAQSchema } from '@/lib/seo/schemas';
import { BASE_URL } from '@/lib/seo/constants';
import { buildAlternates } from '@/lib/seo/metadata';
import { getNeighborhoodBySlug, generateChennaiNeighborhoodSchema } from '@/lib/seo/chennai-neighborhoods';
import ChennaiNeighborhoodPage from '@/components/seo/ChennaiNeighborhoodPage';

export const revalidate = 86400;

const SLUG = 'adyar';
const neighborhood = getNeighborhoodBySlug(SLUG)!;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: neighborhood.metaTitle,
    description: neighborhood.metaDescription,
    keywords: neighborhood.metaKeywords,
    alternates: buildAlternates(locale, `/coaching/nata-coaching-chennai/${SLUG}`),
    openGraph: {
      title: neighborhood.metaTitle,
      description: neighborhood.metaDescription,
      type: 'article',
    },
  };
}

const faqs = [
  {
    question: 'Is there NATA coaching in Adyar, Chennai?',
    answer: 'Yes, Neram Classes serves Adyar students through our Ashok Nagar center (8 km away) and live online classes. Being near IIT Madras, Adyar students benefit from our IIT Madras alumni faculty who can arrange campus drawing practice sessions. Max 25 per batch, 99.9% success rate.',
  },
  {
    question: 'Which is the best NATA coaching near Adyar?',
    answer: 'Neram Classes, with our center at Ashok Nagar (25 min from Adyar), is the top choice for Adyar students. Key advantages: only institute with free AI study app, IIT/NIT alumni faculty, max 25 per batch, hybrid online-offline model, and 99.9% success rate since 2009.',
  },
  {
    question: 'Can I attend NATA coaching online from Adyar?',
    answer: 'Yes, Neram offers live interactive online NATA classes accessible from Adyar. Same curriculum, same IIT/NIT faculty, real-time drawing feedback via screen sharing. Switch between online and offline anytime.',
  },
];

export default function Page({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);
  return (
    <>
      <JsonLd data={generateChennaiNeighborhoodSchema(neighborhood)} />
      <JsonLd data={generateBreadcrumbSchema([
        { name: 'Home', url: BASE_URL },
        { name: 'Coaching', url: `${BASE_URL}/coaching` },
        { name: 'NATA Coaching Chennai', url: `${BASE_URL}/coaching/nata-coaching-chennai` },
        { name: `NATA Coaching ${neighborhood.name}` },
      ])} />
      <JsonLd data={generateFAQSchema(faqs)} />
      <ChennaiNeighborhoodPage neighborhood={neighborhood} />
    </>
  );
}

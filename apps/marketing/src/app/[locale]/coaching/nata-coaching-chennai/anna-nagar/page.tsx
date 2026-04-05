import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema, generateFAQSchema } from '@/lib/seo/schemas';
import { BASE_URL } from '@/lib/seo/constants';
import { buildAlternates } from '@/lib/seo/metadata';
import { getNeighborhoodBySlug, generateChennaiNeighborhoodSchema } from '@/lib/seo/chennai-neighborhoods';
import ChennaiNeighborhoodPage from '@/components/seo/ChennaiNeighborhoodPage';


const SLUG = 'anna-nagar';
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
    question: 'Is there NATA coaching in Anna Nagar, Chennai?',
    answer: 'Yes, Neram Classes serves Anna Nagar students through our Ashok Nagar center (just 1 metro stop away, Anna Nagar East Metro to Ashok Nagar Metro) and live online classes. Our hybrid model means you can attend offline at the center or study from home in Anna Nagar with the same IIT/NIT alumni faculty. Max 25 per batch, 99.9% success rate.',
  },
  {
    question: 'How far is Neram Classes from Anna Nagar?',
    answer: "Neram Classes' Ashok Nagar center is 7 km from Anna Nagar, approximately 20 minutes by auto or just 1 stop on the Chennai Metro (Anna Nagar East to Ashok Nagar). Many Anna Nagar students also join our live online classes on weekdays.",
  },
  {
    question: 'What is the fee for NATA coaching near Anna Nagar?',
    answer: 'Neram Classes offers: Crash Course (3 months) ₹15,000, 1-Year Program ₹25,000, 2-Year Program ₹30,000. Merit scholarships (up to 100%) and EMI available. Free demo class available.',
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

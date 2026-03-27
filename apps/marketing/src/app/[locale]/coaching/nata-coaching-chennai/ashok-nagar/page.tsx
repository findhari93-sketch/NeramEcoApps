import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema, generateFAQSchema } from '@/lib/seo/schemas';
import { BASE_URL } from '@/lib/seo/constants';
import { buildAlternates } from '@/lib/seo/metadata';
import { getNeighborhoodBySlug, generateChennaiNeighborhoodSchema } from '@/lib/seo/chennai-neighborhoods';
import ChennaiNeighborhoodPage from '@/components/seo/ChennaiNeighborhoodPage';

export const revalidate = 86400;

const SLUG = 'ashok-nagar';
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
    question: 'Where is Neram Classes NATA coaching center in Chennai?',
    answer: "Neram Classes' flagship Chennai center is at PT Rajan Road, Sector 13, Ashok Nagar, Chennai 600083. 5-minute walk from Ashok Nagar Metro Station (Blue Line). The center offers both online and offline NATA coaching.",
  },
  {
    question: 'What are the timings at Neram Ashok Nagar center?',
    answer: 'Neram Classes Ashok Nagar operates Monday to Friday 9 AM to 6 PM, Saturday 9 AM to 2 PM. Multiple batch timings available: morning (9-12), afternoon (2-5), and evening (5-8) slots. Book a free demo to see our center.',
  },
  {
    question: 'Is there parking at Neram Ashok Nagar center?',
    answer: 'Yes, two-wheeler parking is available near the center on PT Rajan Road. The center is also well-served by public transport: Ashok Nagar Metro (5 min walk), multiple bus routes, and auto-rickshaws from Saidapet Junction.',
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

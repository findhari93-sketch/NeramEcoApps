import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema, generateFAQSchema } from '@/lib/seo/schemas';
import { BASE_URL } from '@/lib/seo/constants';
import { buildAlternates } from '@/lib/seo/metadata';
import { getNeighborhoodBySlug, generateChennaiNeighborhoodSchema } from '@/lib/seo/chennai-neighborhoods';
import ChennaiNeighborhoodPage from '@/components/seo/ChennaiNeighborhoodPage';


const SLUG = 't-nagar';
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
    question: 'Is there NATA coaching near T. Nagar, Chennai?',
    answer: "Yes, Neram Classes' Ashok Nagar center is just 3 km from T. Nagar, a 10-minute auto ride or 15-minute walk. Many T. Nagar students walk to our center after school for daily NATA classes. Online classes also available.",
  },
  {
    question: 'Which is the closest NATA coaching to T. Nagar?',
    answer: 'Neram Classes at Ashok Nagar is the closest professional NATA coaching to T. Nagar at just 3 km (10 min). IIT/NIT alumni faculty, max 25 per batch, 99.9% success rate, free AI study app. Students from Pondy Bazaar, West Mambalam, and K.K. Nagar also attend.',
  },
  {
    question: 'What is the fee for NATA coaching near T. Nagar?',
    answer: 'Neram Classes fees: Crash Course (3 months) ₹15,000, 1-Year Program ₹25,000, 2-Year Program ₹30,000. Center at Ashok Nagar, just 10 min from T. Nagar. Merit scholarships (up to 100%) and EMI options available.',
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

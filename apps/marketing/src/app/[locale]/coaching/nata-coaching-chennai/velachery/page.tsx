import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema, generateFAQSchema } from '@/lib/seo/schemas';
import { BASE_URL } from '@/lib/seo/constants';
import { buildAlternates } from '@/lib/seo/metadata';
import { getNeighborhoodBySlug, generateChennaiNeighborhoodSchema } from '@/lib/seo/chennai-neighborhoods';
import ChennaiNeighborhoodPage from '@/components/seo/ChennaiNeighborhoodPage';

const SLUG = 'velachery';
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
    question: 'Is there NATA coaching near Velachery, Chennai?',
    answer: 'Yes, Neram Classes serves Velachery students through our Ashok Nagar center (12 km) and live online classes. Most Velachery students attend online on weekdays and visit the center on weekends for drawing practice. Our hybrid model is ideal for South Chennai students.',
  },
  {
    question: 'What is the best NATA coaching for OMR/Velachery students?',
    answer: 'Neram Classes offers the best NATA coaching for Velachery, OMR, and Sholinganallur students. Our hybrid online-offline model means you study from home on weekdays and attend intensive drawing sessions at Ashok Nagar on weekends. IIT/NIT faculty, max 25 per batch, 99.9% success rate.',
  },
  {
    question: 'Can I do NATA coaching online from Velachery?',
    answer: "Yes, Neram's live online NATA classes are the most popular option for Velachery students. Same IIT/NIT alumni faculty, real-time drawing feedback, max 25 per batch. Free AI study app with cutoff calculator and college predictor included.",
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

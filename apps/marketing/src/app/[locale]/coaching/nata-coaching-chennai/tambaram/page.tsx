import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema, generateFAQSchema } from '@/lib/seo/schemas';
import { BASE_URL } from '@/lib/seo/constants';
import { buildAlternates } from '@/lib/seo/metadata';
import { getNeighborhoodBySlug, generateChennaiNeighborhoodSchema } from '@/lib/seo/chennai-neighborhoods';
import ChennaiNeighborhoodPage from '@/components/seo/ChennaiNeighborhoodPage';


const SLUG = 'tambaram';
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
    question: 'Is there NATA coaching in Tambaram?',
    answer: 'Yes, Neram Classes has a dedicated sub-center in Tambaram (Thiruneermalai, Jain Alpine Meadows) plus the main center at Ashok Nagar. Tambaram students can attend at either location or join live online classes. Students from Chengalpattu, Kanchipuram, and ECR also attend at our Tambaram sub-center.',
  },
  {
    question: 'How can Tambaram students reach Neram Classes?',
    answer: 'Two options: (1) Attend at our Tambaram sub-center at Thiruneermalai, Jain Alpine Meadows. (2) Take suburban train from Tambaram to Mambalam (15 min), then 10-min auto to Ashok Nagar main center. (3) Join live online classes from home.',
  },
  {
    question: 'What is the best NATA coaching in Tambaram, Chennai?',
    answer: "Neram Classes operates both a Tambaram sub-center and the main Ashok Nagar center — giving Tambaram students the best access to NATA coaching. IIT/NIT alumni faculty, max 25 per batch, 99.9% success rate, free AI study app.",
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

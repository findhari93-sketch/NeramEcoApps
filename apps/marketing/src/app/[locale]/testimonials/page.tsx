import { Suspense } from 'react';
import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema, generateTestimonialsPageSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import TestimonialsPageContent from '@/components/TestimonialsPageContent';
import { getAggregateRating, getReviewSummary } from '@/lib/review-stats';
import { hasEnoughRatings } from '@/lib/reviews/rules';

// ISR: the rating below comes from published reviews (cached for an hour).
export const revalidate = 3600;

const baseUrl = 'https://neramclasses.com';

export function generateStaticParams() {
  return [
    { locale: 'en' },
    { locale: 'ta' },
    { locale: 'hi' },
    { locale: 'kn' },
    { locale: 'ml' },
  ];
}

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'Student Reviews & Success Stories',
    description:
      'Read published reviews from Neram Classes students who prepared for NATA and JEE Paper 2. Filter by city, course, year, and learning mode.',
    keywords:
      'Neram Classes reviews, NATA coaching reviews, student testimonials, architecture coaching success stories, NATA student results',
    alternates: buildAlternates(locale, '/testimonials'),
    openGraph: {
      title: 'Student Success Stories',
      description:
        'Published reviews from NATA and JEE Paper 2 students who prepared with Neram Classes.',
      type: 'website',
      url: locale === 'en' ? `${baseUrl}/testimonials` : `${baseUrl}/${locale}/testimonials`,
    },
  };
}

export default async function TestimonialsPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);

  // Data-driven only: null (and no AggregateRating) until enough published ratings exist.
  const [aggregateRating, summary] = await Promise.all([getAggregateRating('all'), getReviewSummary('all')]);
  const ratingSchema = generateTestimonialsPageSchema(aggregateRating);

  return (
    <>
      <JsonLd
        data={[
          generateBreadcrumbSchema([
            { name: 'Home', url: baseUrl },
            { name: 'Testimonials', url: `${baseUrl}/testimonials` },
          ]),
          ...(ratingSchema ? [ratingSchema] : []),
        ]}
      />
      <Suspense>
        <TestimonialsPageContent averageRating={hasEnoughRatings(summary) ? summary.average : null} />
      </Suspense>
    </>
  );
}

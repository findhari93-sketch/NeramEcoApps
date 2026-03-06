import { Suspense } from 'react';
import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema, generateTestimonialsPageSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import TestimonialsPageContent from '@/components/TestimonialsPageContent';

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
    title: 'Student Reviews & Success Stories | Neram Classes',
    description:
      'Read reviews from 2500+ students across India who achieved their architecture dreams with Neram Classes. Filter by city, course, year, and learning mode.',
    keywords:
      'Neram Classes reviews, NATA coaching reviews, student testimonials, architecture coaching success stories, NATA student results',
    alternates: buildAlternates(locale, '/testimonials'),
    openGraph: {
      title: 'Student Success Stories | Neram Classes',
      description:
        'Real reviews from NATA & JEE Paper 2 students who achieved top ranks with Neram Classes coaching.',
      type: 'website',
      url: `${baseUrl}/${locale}/testimonials`,
    },
  };
}

export default function TestimonialsPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);

  return (
    <>
      <JsonLd
        data={[
          generateBreadcrumbSchema([
            { name: 'Home', url: baseUrl },
            { name: 'Testimonials', url: `${baseUrl}/en/testimonials` },
          ]),
          generateTestimonialsPageSchema({
            total: 2500,
            avgRating: 4.8,
          }),
        ]}
      />
      <Suspense>
        <TestimonialsPageContent />
      </Suspense>
    </>
  );
}

import { Suspense } from 'react';
import { Metadata } from 'next';
import { permanentRedirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import TestimonialsPageContent from '@/components/TestimonialsPageContent';
import { loadVerifiedPublishedCount } from '@/lib/reviews/data';
import { shouldSwitchOver } from '@/lib/reviews/hub';
import { localePath } from '@/lib/reviews/rules';
import ClientIntl from '@/components/i18n/ClientIntl';

// ISR, daily, purged at once by the "reviews" tag when staff publish a review.
export const revalidate = 86400;

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
    // Stays indexable until the switch-over below: it ranks today, and the
    // permanent redirect then hands that ranking to /reviews.
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

  // Switch-over: once enough verified reviews are published, /reviews is the one
  // review page and this one sends its visitors (and its links) there for good.
  if (shouldSwitchOver(await loadVerifiedPublishedCount())) {
    permanentRedirect(localePath(locale, '/reviews'));
  }

  return (
    <>
      <JsonLd
        data={[
          generateBreadcrumbSchema([
            { name: 'Home', url: baseUrl },
            { name: 'Testimonials', url: `${baseUrl}/testimonials` },
          ]),
        ]}
      />
      <Suspense>
        {/* No average here: it would mix templated rows with real ones. */}
        <ClientIntl locale={locale} namespaces={['testimonials']}><TestimonialsPageContent averageRating={null} /></ClientIntl>
      </Suspense>
    </>
  );
}

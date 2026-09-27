import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ReviewsPageView, { buildReviewsMetadata } from '@/components/reviews/ReviewsPageView';
import { parsePageSegment } from '@/lib/reviews/rules';

// Lazy ISR: no generateStaticParams, so page N is rendered on its first request
// and cached for an hour. Page 1 lives at the section root, not /page/1.
export const revalidate = 3600;

interface PageProps {
  params: { locale: string; page: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const page = parsePageSegment(params.page);
  if (!page) notFound();
  return buildReviewsMetadata(params.locale, 'jee', page);
}

export default function ReviewsPagedPage({ params }: PageProps) {
  const page = parsePageSegment(params.page);
  if (!page) notFound();
  return <ReviewsPageView locale={params.locale} exam="jee" page={page} />;
}

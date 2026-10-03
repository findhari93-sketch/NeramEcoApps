import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ReviewsPageView, { buildReviewsMetadata } from '@/components/reviews/ReviewsPageView';
import { parsePageSegment } from '@/lib/reviews/rules';

// Lazy ISR: an empty generateStaticParams, so page N is rendered on its first request
// and cached for a day (admin saves purge the "reviews" tag). Page 1 lives at the section root, not /page/1.
export const revalidate = 86400;

// An empty list registers the route for on-demand ISR. Without it Next 14 renders
// every request dynamically, and the revalidate above never takes effect. It adds
// no build files, so the 15k file cap is safe.
export function generateStaticParams() {
  return [];
}

interface PageProps {
  params: { locale: string; page: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const page = parsePageSegment(params.page);
  if (!page) notFound();
  return buildReviewsMetadata(params.locale, 'all', page);
}

export default function ReviewsPagedPage({ params }: PageProps) {
  const page = parsePageSegment(params.page);
  if (!page) notFound();
  return <ReviewsPageView locale={params.locale} exam="all" page={page} />;
}

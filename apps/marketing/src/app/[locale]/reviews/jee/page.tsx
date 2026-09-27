import type { Metadata } from 'next';
import ReviewsPageView, { buildReviewsMetadata } from '@/components/reviews/ReviewsPageView';

// ISR: published reviews change rarely; an hour keeps them fresh without per-request renders.
export const revalidate = 3600;

interface PageProps {
  params: { locale: string };
}

export function generateMetadata({ params: { locale } }: PageProps): Promise<Metadata> {
  return buildReviewsMetadata(locale, 'jee', 1);
}

export default function ReviewsPage({ params: { locale } }: PageProps) {
  return <ReviewsPageView locale={locale} exam="jee" page={1} />;
}

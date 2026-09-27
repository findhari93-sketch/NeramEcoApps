import type { Metadata } from 'next';
import { Suspense } from 'react';
import ReviewForm, { ReviewFormSkeleton } from './ReviewForm';

export const metadata: Metadata = {
  title: 'Write a review | aiArchitek',
  description: 'Tell other students about your time with Neram Classes.',
  robots: { index: false, follow: false },
};

export default function ReviewPage() {
  return (
    <Suspense fallback={<ReviewFormSkeleton />}>
      <ReviewForm />
    </Suspense>
  );
}

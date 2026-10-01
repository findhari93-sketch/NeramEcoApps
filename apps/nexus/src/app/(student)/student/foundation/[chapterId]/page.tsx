'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import FoundationLearningContent from '@/components/foundation/FoundationLearningContent';
import { safeBackPath } from '@/lib/safe-back-path';

function ChapterLearningInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const chapterId = params.chapterId as string;
  // A question bank "What to study" link opens one section and comes back.
  const sectionId = searchParams.get('section');
  const backUrl = safeBackPath(searchParams.get('back')) ?? undefined;

  return <FoundationLearningContent chapterId={chapterId} initialSectionId={sectionId} backUrl={backUrl} />;
}

// useSearchParams needs a Suspense boundary or the route bails out of prerender.
export default function ChapterLearningView() {
  return (
    <Suspense fallback={null}>
      <ChapterLearningInner />
    </Suspense>
  );
}

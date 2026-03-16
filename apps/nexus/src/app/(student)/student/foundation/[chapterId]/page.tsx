'use client';

import { useParams } from 'next/navigation';
import FoundationLearningContent from '@/components/foundation/FoundationLearningContent';

export default function ChapterLearningView() {
  const params = useParams();
  const chapterId = params.chapterId as string;

  return <FoundationLearningContent chapterId={chapterId} />;
}

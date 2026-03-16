'use client';

import { useParams } from 'next/navigation';
import FoundationLearningContent from '@/components/foundation/FoundationLearningContent';

export default function ModuleChapterLearningPage() {
  const params = useParams();
  const moduleId = params.id as string;
  const chapterId = params.chapterId as string;

  return (
    <FoundationLearningContent
      chapterId={chapterId}
      backUrl={`/student/modules/${moduleId}`}
    />
  );
}

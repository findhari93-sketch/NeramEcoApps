'use client';

import { useParams } from 'next/navigation';
import FoundationChapterEditorContent from '@/components/foundation/FoundationChapterEditorContent';

export default function ModuleChapterEditorPage() {
  const params = useParams();
  const moduleId = params.id as string;
  const chapterId = params.chapterId as string;

  return (
    <FoundationChapterEditorContent
      chapterId={chapterId}
      backUrl={`/teacher/modules/${moduleId}`}
    />
  );
}

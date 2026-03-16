'use client';

import { useParams } from 'next/navigation';
import FoundationChapterEditorContent from '@/components/foundation/FoundationChapterEditorContent';

export default function ChapterEditorPage() {
  const params = useParams();
  const chapterId = params.chapterId as string;

  return <FoundationChapterEditorContent chapterId={chapterId} />;
}

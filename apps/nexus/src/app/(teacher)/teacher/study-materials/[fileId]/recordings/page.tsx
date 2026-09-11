'use client';

/**
 * /teacher/study-materials/[fileId]/recordings?lang=ta&from=library
 *
 * A chapter's class recordings, one tab per language. The language and where the
 * teacher came from live in the URL, so a refresh, a shared link and the
 * checkpoint editor's Back all return to the same tab. See RecordingsWorkspace.
 */

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Box, Skeleton } from '@neram/ui';
import RecordingsWorkspace from '@/components/study-materials/recordings/RecordingsWorkspace';
import { parseRecordingsFrom } from '@/lib/recordings-nav';

function ChapterRecordings() {
  const { fileId } = useParams<{ fileId: string }>();
  const searchParams = useSearchParams();
  return (
    <RecordingsWorkspace
      fileId={fileId}
      lang={searchParams.get('lang')}
      from={parseRecordingsFrom(searchParams.get('from'))}
    />
  );
}

export default function ChapterRecordingsPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ p: 2 }}>
          <Skeleton variant="rounded" height={420} />
        </Box>
      }
    >
      <ChapterRecordings />
    </Suspense>
  );
}
